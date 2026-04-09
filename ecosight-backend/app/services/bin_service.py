"""
Bin Service – CRUD + fill percentage calculation + alert generation
"""
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
import uuid
from app.core.database import get_db
from app.models.schemas import (
    BinCreate, BinUpdate, BinCounters, BinStatus,
    AlertType, AlertSeverity
)
import logging

logger = logging.getLogger(__name__)

# ── Capacity defaults (overridden per bin) ────────────────────────────────────
DEFAULT_CAPACITIES = {
    "plastic":    100,
    "metal":       50,
    "glass":       40,
    "paper":       80,
    "bio_hazard":  30,
}

WARNING_THRESHOLD = 70.0   # %
CRITICAL_THRESHOLD = 90.0  # %


def _doc_to_bin(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


async def create_bin(data: BinCreate) -> dict:
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = {
        **data.model_dump(),
        "status": BinStatus.NORMAL.value,
        "fill_percentage": 0.0,
        "counters": BinCounters().model_dump(),
        "last_emptied_at": now,
        "estimated_days_to_full": None,
        "streamKey": uuid.uuid4().hex,
        "createdAt": now,
        "updatedAt": now,
    }
    result = await db.bins.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _doc_to_bin(doc)


async def get_bin(bin_id: str) -> Optional[dict]:
    db = get_db()
    doc = await db.bins.find_one({"_id": ObjectId(bin_id)})
    return _doc_to_bin(doc) if doc else None


async def list_bins() -> list:
    db = get_db()
    cursor = db.bins.find({}).sort("updatedAt", -1)
    return [_doc_to_bin(d) async for d in cursor]


async def update_bin(bin_id: str, data: BinUpdate) -> Optional[dict]:
    db = get_db()
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updatedAt"] = datetime.now(timezone.utc)
    await db.bins.update_one({"_id": ObjectId(bin_id)}, {"$set": update_data})
    return await get_bin(bin_id)


async def delete_bin(bin_id: str) -> bool:
    db = get_db()
    result = await db.bins.delete_one({"_id": ObjectId(bin_id)})
    return result.deleted_count > 0


async def empty_bin(bin_id: str) -> Optional[dict]:
    """Reset bin counters and status after physical emptying."""
    db = get_db()
    now = datetime.now(timezone.utc)
    await db.bins.update_one(
        {"_id": ObjectId(bin_id)},
        {"$set": {
            "counters": BinCounters().model_dump(),
            "fill_percentage": 0.0,
            "status": BinStatus.NORMAL.value,
            "last_emptied_at": now,
            "estimated_days_to_full": None,
            "updatedAt": now,
        }}
    )
    return await get_bin(bin_id)


async def increment_bin_counters(
    bin_id: str,
    waste_type: str,
    count: int = 1,
) -> Optional[dict]:
    """
    Increment the counter for a waste type and recalculate fill %.
    Generates alerts if thresholds crossed.
    """
    db = get_db()
    doc = await db.bins.find_one({"_id": ObjectId(bin_id)})
    if not doc:
        return None

    # Map waste_type string to counter field
    field_map = {
        "Plastic":    "plastic",
        "Metal":      "metal",
        "Glass":      "glass",
        "Paper":      "paper",
        "Bio-Hazard": "bio_hazard",
    }
    field = field_map.get(waste_type)
    if field:
        await db.bins.update_one(
            {"_id": ObjectId(bin_id)},
            {"$inc": {f"counters.{field}": count}}
        )

    # Re-fetch and recalculate
    doc = await db.bins.find_one({"_id": ObjectId(bin_id)})
    counters = doc.get("counters", {})

    capacities = {
        "plastic":    doc.get("plastic_capacity", DEFAULT_CAPACITIES["plastic"]),
        "metal":      doc.get("metal_capacity", DEFAULT_CAPACITIES["metal"]),
        "glass":      doc.get("glass_capacity", DEFAULT_CAPACITIES["glass"]),
        "paper":      doc.get("paper_capacity", DEFAULT_CAPACITIES["paper"]),
        "bio_hazard": doc.get("bio_hazard_capacity", DEFAULT_CAPACITIES["bio_hazard"]),
    }

    # Compute max % across all classes
    scores = []
    for key, cap in capacities.items():
        cnt = counters.get(key, 0)
        if cap > 0:
            scores.append(min(cnt / cap, 1.0) * 100)
    fill_pct = round(max(scores, default=0.0), 1)

    # Determine status
    if fill_pct >= CRITICAL_THRESHOLD:
        status = BinStatus.FULL.value
    elif fill_pct >= WARNING_THRESHOLD:
        status = BinStatus.WARNING.value
    else:
        status = BinStatus.NORMAL.value

    now = datetime.now(timezone.utc)
    await db.bins.update_one(
        {"_id": ObjectId(bin_id)},
        {"$set": {
            "fill_percentage": fill_pct,
            "status": status,
            "updatedAt": now,
        }}
    )

    # Fire alerts if status changed
    old_status = doc.get("status", BinStatus.NORMAL.value)
    await _maybe_fire_alert(bin_id, doc.get("name", ""), old_status, status, fill_pct)

    return await get_bin(bin_id)


async def _maybe_fire_alert(
    bin_id: str, bin_name: str,
    old_status: str, new_status: str, fill_pct: float
):
    """Create an alert document when the bin crosses a threshold."""
    db = get_db()
    if new_status == old_status:
        return

    if new_status == BinStatus.FULL.value:
        alert = {
            "bin_id": bin_id,
            "alert_type": AlertType.BIN_FULL.value,
            "severity": AlertSeverity.CRITICAL.value,
            "message": f"Bin '{bin_name}' is FULL ({fill_pct:.0f}%). Immediate collection required.",
            "resolved": False,
            "created_at": datetime.now(timezone.utc),
        }
        await db.alerts.insert_one(alert)
        logger.warning(f"ALERT: Bin {bin_id} FULL at {fill_pct}%")

    elif new_status == BinStatus.WARNING.value:
        alert = {
            "bin_id": bin_id,
            "alert_type": AlertType.BIN_WARNING.value,
            "severity": AlertSeverity.WARNING.value,
            "message": f"Bin '{bin_name}' is {fill_pct:.0f}% full. Schedule collection soon.",
            "resolved": False,
            "created_at": datetime.now(timezone.utc),
        }
        await db.alerts.insert_one(alert)
        logger.info(f"ALERT: Bin {bin_id} WARNING at {fill_pct}%")


async def get_alerts(resolved: Optional[bool] = None, limit: int = 20) -> list:
    db = get_db()
    query = {}
    if resolved is not None:
        query["resolved"] = resolved
    cursor = db.alerts.find(query).sort("created_at", -1).limit(limit)
    alerts = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        alerts.append(doc)
    return alerts


async def resolve_alert(alert_id: str) -> bool:
    db = get_db()
    from bson import ObjectId
    result = await db.alerts.update_one(
        {"_id": ObjectId(alert_id)},
        {"$set": {"resolved": True, "resolved_at": datetime.now(timezone.utc)}}
    )
    return result.modified_count > 0
