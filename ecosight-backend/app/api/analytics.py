"""
Dashboard, Audit Log, Reports, Alerts API
"""
from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime, timezone

from app.core.database import get_db
from app.services.stats_service import get_dashboard_stats, get_reports_data
from app.services.bin_service import get_alerts, resolve_alert

router = APIRouter(tags=["analytics"])


# ── Dashboard ──────────────────────────────────────────────────────────────

@router.get("/dashboard/stats")
async def dashboard_stats():
    return await get_dashboard_stats()


# ── Reports ────────────────────────────────────────────────────────────────

@router.get("/reports")
async def reports(timeframe: str = Query("monthly", regex="^(daily|weekly|monthly)$")):
    return await get_reports_data(timeframe)


# ── Audit Log ──────────────────────────────────────────────────────────────

@router.get("/audit-log")
async def audit_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100000),
    waste_type: Optional[str] = None,
    is_contamination: Optional[bool] = None,
    search: Optional[str] = None,
    date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    camera_id: Optional[str] = None,
):
    db = get_db()
    query: dict = {"line_crossed": True}

    if waste_type and waste_type != "All":
        query["waste_type"] = waste_type
    if is_contamination is not None:
        query["is_contamination"] = is_contamination
    if camera_id:
        query["camera_id"] = camera_id
        
    if start_date or end_date:
        ts_filter = {}
        if start_date:
            try:
                sd = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                ts_filter["$gte"] = sd
            except ValueError:
                pass
        if end_date:
            try:
                ed = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc, hour=23, minute=59, second=59)
                ts_filter["$lte"] = ed
            except ValueError:
                pass
        if ts_filter:
            query["timestamp"] = ts_filter
    elif date:
        try:
            day = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            query["timestamp"] = {
                "$gte": day,
                "$lt": day.replace(hour=23, minute=59, second=59),
            }
        except ValueError:
            pass

    total = await db.detection_events.count_documents(query)
    skip = (page - 1) * page_size

    cursor = (
        db.detection_events.find(query)
        .sort("timestamp", -1)
        .skip(skip)
        .limit(page_size)
    )

    items = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        items.append(doc)

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items,
    }


# ── Alerts ─────────────────────────────────────────────────────────────────

@router.get("/alerts")
async def list_alerts(resolved: Optional[bool] = None, limit: int = 20):
    return await get_alerts(resolved=resolved, limit=limit)


@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert_endpoint(alert_id: str):
    ok = await resolve_alert(alert_id)
    return {"success": ok}
