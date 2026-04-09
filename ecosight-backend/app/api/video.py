"""
Video Upload API
POST /api/video/upload  – upload video, returns session_id
GET  /api/video/sessions/{session_id}  – poll session status
GET  /api/video/sessions  – list all sessions
GET  /api/video/result/{session_id}  – stream the annotated output video
WS   /api/video/ws/{session_id}  – real-time progress websocket
"""

import asyncio
import json
import logging
import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.responses import FileResponse
from typing import Optional

from app.core.config import get_settings
from app.services.video_service import (
    create_session,
    get_session,
    list_sessions,
    process_video_async,
    get_session_progress,
)

router = APIRouter(prefix="/video", tags=["video"])
logger = logging.getLogger(__name__)
settings = get_settings()

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".jpg", ".jpeg", ".png"}
MAX_FILE_SIZE_MB = 500


@router.post("/upload")
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    bin_id: str = Form(...),
    camera_id: Optional[str] = Form(None),
):
    """
    Upload a video file and kick off detection processing.
    Returns session_id immediately; use /ws/{session_id} for live progress.
    """
    ext = Path(file.filename or "video.mp4").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: {ALLOWED_EXTENSIONS}")

    # Save file
    os.makedirs(settings.upload_dir, exist_ok=True)
    save_name = f"{uuid.uuid4()}{ext}"
    save_path = os.path.join(settings.upload_dir, save_name)

    async with aiofiles.open(save_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):  # 1 MB chunks
            await f.write(chunk)

    # Create session record
    session = await create_session(
        bin_id=bin_id,
        filename=file.filename or save_name,
        camera_id=camera_id,
    )
    session_id = session["id"]

    # Kick off background processing
    background_tasks.add_task(
        process_video_async,
        session_id=session_id,
        video_path=save_path,
        bin_id=bin_id,
    )

    logger.info(f"Video uploaded, session {session_id} queued.")
    return {
        "session_id": session_id,
        "filename": file.filename,
        "status": "queued",
        "message": "Processing started. Connect to WebSocket for live progress.",
        "ws_url": f"/api/video/ws/{session_id}",
    }


@router.get("/sessions")
async def list_all_sessions(bin_id: Optional[str] = None, limit: int = 20):
    return await list_sessions(bin_id=bin_id, limit=limit)


@router.get("/sessions/{session_id}")
async def get_session_status(session_id: str):
    session = await get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    # Merge live progress if still processing
    live = get_session_progress(session_id)
    if live:
        session.update({k: v for k, v in live.items() if v is not None})
    return session


@router.get("/result/{session_id}")
async def get_result_video(session_id: str):
    """Stream the annotated output video."""
    session = await get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if session.get("status") != "completed":
        raise HTTPException(400, f"Session not completed yet (status: {session.get('status')})")
    result_path = session.get("result_video_path")
    if not result_path or not os.path.exists(result_path):
        raise HTTPException(404, "Result video not found")
    return FileResponse(
        result_path,
        media_type="video/mp4" if result_path.endswith(".mp4") else "image/jpeg",
        filename=f"ecosight_result_{session_id}{os.path.splitext(result_path)[1]}",
    )


@router.websocket("/ws/{session_id}")
async def websocket_progress(websocket: WebSocket, session_id: str):
    """WebSocket endpoint: streams progress updates every 500ms until complete."""
    await websocket.accept()
    try:
        while True:
            session = await get_session(session_id)
            live = get_session_progress(session_id)
            if live:
                data = {**(session or {}), **live}
            else:
                data = session or {"status": "unknown"}

            await websocket.send_text(json.dumps(data, default=str))

            status = data.get("status", "")
            if status in ("completed", "failed"):
                break

            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        logger.info(f"WS client disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WS error for session {session_id}: {e}")
        try:
            await websocket.send_text(json.dumps({"error": str(e)}))
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
