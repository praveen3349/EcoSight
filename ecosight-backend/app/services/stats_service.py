"""
Dashboard statistics aggregation service.
Pulls live data from MongoDB to power the frontend dashboard.
"""

from datetime import datetime, timezone, timedelta
from app.core.database import get_db
import logging

logger = logging.getLogger(__name__)

WASTE_COLORS = {
    "Plastic":    "hsl(var(--primary))",
    "Paper":      "#3b82f6",
    "Glass":      "#06b6d4",
    "Metal":      "#8b5cf6",
    "Bio-Hazard": "#ef4444",
    "Unknown":    "#9ca3af",
}


async def get_dashboard_stats() -> dict:
    db = get_db()
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # ── Totals today ──────────────────────────────────────────────────────────
    total_today = await db.detection_events.count_documents({
        "timestamp": {"$gte": today_start},
        "line_crossed": True,
        "waste_type": {"$ne": "Unknown"},
    })

    contam_today = await db.detection_events.count_documents({
        "timestamp": {"$gte": today_start},
        "is_contamination": True,
    })

    contamination_rate = (
        round(contam_today / total_today * 100, 1) if total_today > 0 else 0.0
    )

    # ── Cameras ───────────────────────────────────────────────────────────────
    active_cameras = await db.cameras.count_documents({"active": True})
    total_cameras = await db.cameras.count_documents({})

    # ── Alerts ────────────────────────────────────────────────────────────────
    active_alerts = await db.alerts.count_documents({"resolved": False})

    # ── Bin status counts ─────────────────────────────────────────────────────
    bins_normal = await db.bins.count_documents({"status": "Normal"})
    bins_warning = await db.bins.count_documents({"status": "Warning"})
    bins_critical = await db.bins.count_documents({"status": {"$in": ["Critical", "Full"]}})

    # ── Detection timeline (hourly, last 7 hours) ─────────────────────────────
    timeline = []
    for h in range(6, -1, -1):
        window_start = now - timedelta(hours=h + 1)
        window_end = now - timedelta(hours=h)
        count = await db.detection_events.count_documents({
            "timestamp": {"$gte": window_start, "$lt": window_end},
            "line_crossed": True,
        })
        label = window_end.strftime("%H:%M")
        timeline.append({"time": label, "detections": count})

    # ── Waste distribution (today) ────────────────────────────────────────────
    pipeline = [
        {"$match": {
            "timestamp": {"$gte": today_start},
            "line_crossed": True,
            "waste_type": {"$ne": "Unknown"},
        }},
        {"$group": {"_id": "$waste_type", "value": {"$sum": 1}}},
    ]
    dist_cursor = db.detection_events.aggregate(pipeline)
    waste_dist = []
    async for doc in dist_cursor:
        waste_dist.append({
            "name": doc["_id"],
            "value": doc["value"],
            "color": WASTE_COLORS.get(doc["_id"], "#9ca3af"),
        })

    # ── Bin fill levels ───────────────────────────────────────────────────────
    bin_cursor = db.bins.find({}, {"name": 1, "fill_percentage": 1, "location": 1}).limit(10)
    bin_fills = []
    async for b in bin_cursor:
        bin_fills.append({
            "bin": b.get("name", "Unknown"),
            "fill": b.get("fill_percentage", 0),
        })

    # ── Recent alerts ─────────────────────────────────────────────────────────
    alert_cursor = db.alerts.find(
        {"resolved": False}
    ).sort("created_at", -1).limit(5)
    recent_alerts = []
    async for a in alert_cursor:
        created = a.get("created_at", now)
        diff = now - created.replace(tzinfo=timezone.utc) if created.tzinfo else timedelta(0)
        if diff.seconds < 3600:
            time_str = f"{diff.seconds // 60} mins ago" if diff.seconds >= 60 else "just now"
        elif diff.days == 0:
            time_str = f"{diff.seconds // 3600} hour(s) ago"
        else:
            time_str = f"{diff.days} day(s) ago"

        recent_alerts.append({
            "id": str(a["_id"]),
            "type": a.get("severity", "info"),
            "message": a.get("message", ""),
            "time": time_str,
        })

    return {
        "total_detections_today": total_today,
        "contamination_rate_pct": contamination_rate,
        "active_cameras": active_cameras,
        "total_cameras": total_cameras,
        "active_alerts": active_alerts,
        "bins_normal": bins_normal,
        "bins_warning": bins_warning,
        "bins_critical": bins_critical,
        "detection_timeline": timeline,
        "waste_distribution": waste_dist,
        "bin_fill_levels": bin_fills,
        "recent_alerts": recent_alerts,
    }


async def get_reports_data(timeframe: str = "monthly") -> dict:
    db = get_db()
    now = datetime.now(timezone.utc)

    if timeframe == "daily":
        periods = [(now - timedelta(days=i), now - timedelta(days=i - 1), f"Day {7-i}") for i in range(6, -1, -1)]
        labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    elif timeframe == "weekly":
        periods = [(now - timedelta(weeks=i), now - timedelta(weeks=i - 1), f"W{4-i}") for i in range(3, -1, -1)]
        labels = ["W1", "W2", "W3", "W4"]
    else:  # monthly
        periods = []
        labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        for i in range(12):
            month_start = now.replace(month=i + 1, day=1, hour=0, minute=0, second=0)
            if i < 11:
                month_end = now.replace(month=i + 2, day=1, hour=0, minute=0, second=0)
            else:
                month_end = now.replace(year=now.year + 1, month=1, day=1)
            periods.append((month_start, month_end, labels[i]))

    waste_trends = []
    contamination_trend = []

    for i, (start, end, label) in enumerate(periods):
        # Per class counts
        row: dict = {"name": labels[i] if i < len(labels) else label}
        for waste_type in ["Plastic", "Paper", "Metal", "Glass", "Bio-Hazard"]:
            cnt = await db.detection_events.count_documents({
                "timestamp": {"$gte": start, "$lt": end},
                "waste_type": waste_type,
                "line_crossed": True,
            })
            row[waste_type.lower().replace("-", "_")] = cnt
        waste_trends.append(row)

        # Contamination rate
        total = sum(row[k] for k in ["plastic", "paper", "metal", "glass", "bio_hazard"])
        contam = await db.detection_events.count_documents({
            "timestamp": {"$gte": start, "$lt": end},
            "is_contamination": True,
        })
        rate = round(contam / total * 100, 1) if total > 0 else 0.0
        contamination_trend.append({"name": labels[i] if i < len(labels) else label, "rate": rate})

    # Bin usage (all bins)
    bin_cursor = db.bins.find({}, {"name": 1, "fill_percentage": 1})
    bin_usage = []
    async for b in bin_cursor:
        bin_usage.append({"bin": b.get("name"), "usage": b.get("fill_percentage", 0)})

    # Aggregate waste pie for period
    pipeline = [
        {"$match": {"line_crossed": True, "waste_type": {"$ne": "Unknown"}}},
        {"$group": {"_id": "$waste_type", "value": {"$sum": 1}}},
    ]
    waste_pie = []
    async for doc in db.detection_events.aggregate(pipeline):
        waste_pie.append({
            "name": doc["_id"],
            "value": doc["value"],
            "color": WASTE_COLORS.get(doc["_id"], "#9ca3af"),
        })

    # Summary totals
    total_all = await db.detection_events.count_documents({
        "line_crossed": True, "waste_type": {"$ne": "Unknown"}
    })
    total_contam = await db.detection_events.count_documents({"is_contamination": True})
    total_sessions = await db.processing_sessions.count_documents({"status": "completed"})

    return {
        "timeframe": timeframe,
        "waste_trends": waste_trends,
        "contamination_trend": contamination_trend,
        "bin_usage": bin_usage,
        "waste_pie": waste_pie,
        "summary": {
            "total_items": total_all,
            "total_contaminations": total_contam,
            "contamination_rate": round(total_contam / total_all * 100, 1) if total_all else 0,
            "total_sessions": total_sessions,
        },
    }
