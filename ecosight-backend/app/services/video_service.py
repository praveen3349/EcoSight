"""
Video Processing Service
- Accepts uploaded video files
- Runs detection engine in a background thread
- Streams progress via WebSocket
- Saves all events to MongoDB
- Updates bin counters
"""

import asyncio
import logging
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Callable
from bson import ObjectId

from app.core.database import get_db
from app.core.config import get_settings
from app.services.detection import get_engine
from app.services.bin_service import increment_bin_counters
from app.models.schemas import SessionStatus

logger = logging.getLogger(__name__)
settings = get_settings()

# In-memory map: session_id → progress dict (for WebSocket streaming)
_session_progress: dict = {}


def get_session_progress(session_id: str) -> Optional[dict]:
    return _session_progress.get(session_id)


async def create_session(bin_id: str, filename: str, camera_id: Optional[str] = None) -> dict:
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = {
        "bin_id": bin_id,
        "camera_id": camera_id,
        "filename": filename,
        "status": SessionStatus.QUEUED.value,
        "total_frames": 0,
        "processed_frames": 0,
        "progress_pct": 0.0,
        "detections_count": 0,
        "contamination_count": 0,
        "face_blurs_count": 0,
        "error_message": None,
        "result_video_path": None,
        "summary": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.processing_sessions.insert_one(doc)
    doc["_id"] = result.inserted_id
    doc["id"] = str(doc.pop("_id"))
    return doc


async def get_session(session_id: str) -> Optional[dict]:
    db = get_db()
    doc = await db.processing_sessions.find_one({"_id": ObjectId(session_id)})
    if doc:
        doc["id"] = str(doc.pop("_id"))
    return doc


async def list_sessions(bin_id: Optional[str] = None, limit: int = 20) -> list:
    db = get_db()
    query = {"bin_id": bin_id} if bin_id else {}
    cursor = db.processing_sessions.find(query).sort("created_at", -1).limit(limit)
    results = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        results.append(doc)
    return results


async def process_video_async(
    session_id: str,
    video_path: str,
    bin_id: str,
    on_progress: Optional[Callable] = None,
):
    """
    Run in a background asyncio task.
    Calls the blocking detection engine in a thread pool executor.
    """
    db = get_db()
    engine = get_engine()

    output_dir = os.path.join(settings.upload_dir, "output")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"{session_id}_result.webm")

    # Mark as processing
    await db.processing_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {
            "status": SessionStatus.PROCESSING.value,
            "updated_at": datetime.now(timezone.utc),
        }}
    )

    _session_progress[session_id] = {
        "status": "processing",
        "progress_pct": 0.0,
        "processed_frames": 0,
        "total_frames": 0,
    }

    def sync_progress(frame_idx, total, pct):
        _session_progress[session_id].update({
            "progress_pct": round(pct, 1),
            "processed_frames": frame_idx,
            "total_frames": total,
        })

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: engine.process_video(
                video_path=video_path,
                bin_id=bin_id,
                session_id=session_id,
                output_path=output_path,
                progress_callback=sync_progress,
            )
        )

        # Save all detection events to MongoDB (only non-Unknown types)
        events_to_save = [
            e for e in result["events"]
            if e.get("waste_type") != "Unknown"
        ]

        now = datetime.now(timezone.utc)
        if events_to_save:
            for ev in events_to_save:
                ev["timestamp"] = now
            await db.detection_events.insert_many(events_to_save)

        # Update bin counters (sum per class from this session)
        class_counts = result.get("class_counts", {})
        for waste_type, count in class_counts.items():
            if count > 0 and waste_type != "Unknown":
                await increment_bin_counters(bin_id, waste_type, count)

        # Fire contamination alerts
        if result["contamination_count"] > 0:
            alert_doc = {
                "bin_id": bin_id,
                "session_id": session_id,
                "alert_type": "contamination",
                "severity": "critical",
                "message": (
                    f"{result['contamination_count']} contamination event(s) detected "
                    f"in session {session_id}."
                ),
                "resolved": False,
                "created_at": now,
            }
            await db.alerts.insert_one(alert_doc)

        # Build session summary
        summary = {
            "class_counts": class_counts,
            "total_items": result["total_items_counted"],
            "contamination_count": result["contamination_count"],
            "face_blurs_count": result["face_blurs_count"],
        }

        # Update session as completed
        await db.processing_sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {
                "status": SessionStatus.COMPLETED.value,
                "total_frames": result["total_frames"],
                "processed_frames": result["processed_frames"],
                "progress_pct": 100.0,
                "detections_count": len(events_to_save),
                "contamination_count": result["contamination_count"],
                "face_blurs_count": result["face_blurs_count"],
                "result_video_path": output_path,
                "summary": summary,
                "updated_at": now,
            }}
        )

        _session_progress[session_id] = {
            "status": "completed",
            "progress_pct": 100.0,
            "processed_frames": result["processed_frames"],
            "total_frames": result["total_frames"],
            "summary": summary,
        }

        logger.info(f"Session {session_id} completed. {len(events_to_save)} events saved.")

    except Exception as e:
        logger.error(f"Session {session_id} failed: {e}", exc_info=True)
        await db.processing_sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {
                "status": SessionStatus.FAILED.value,
                "error_message": str(e),
                "updated_at": datetime.now(timezone.utc),
            }}
        )
        _session_progress[session_id] = {
            "status": "failed",
            "error_message": str(e),
        }
    finally:
        # Clean up original upload
        try:
            if os.path.exists(video_path):
                os.remove(video_path)
        except Exception:
            pass
