"""
EcoSight Webcam WebSocket API
WS  /api/webcam/stream        — live frame-in / annotated-frame-out
POST /api/webcam/detect-image — single image detection
"""

# ── pkg_resources shim MUST be first ─────────────────────────────────────────
import sys
import importlib.util

if importlib.util.find_spec("pkg_resources") is None:
    try:
        import pip._vendor.pkg_resources as _pkgr
    except ImportError:
        try:
            import setuptools._vendor.pkg_resources as _pkgr
        except ImportError:
            _pkgr = None
    if _pkgr is not None:
        sys.modules["pkg_resources"] = _pkgr
# ─────────────────────────────────────────────────────────────────────────────

import asyncio
import base64
import json
import logging
import time

import cv2
import numpy as np
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.responses import JSONResponse

from app.services.detection import (
    get_engine,
    CLASS_COLORS,
    WASTE_CATEGORIES,
    _map_class,
    _draw_label,
    _draw_stats_overlay,
    _estimate_volume,
    _is_inside_box,
    FONT,
)
from app.core.database import get_db

router = APIRouter(prefix="/webcam", tags=["webcam"])
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
#  Per-connection session state
# ─────────────────────────────────────────────────────────────────────────────

class WebcamSession:
    def __init__(self):
        self.class_counts: dict[str, int] = {
            "Plastic": 0, "Metal": 0, "Glass": 0,
            "Paper": 0, "Bio-Hazard": 0, "Unknown": 0,
        }
        self.contamination_count = 0
        self.face_blur_count     = 0
        self.counted_ids: set[int]         = set()
        self.track_class_map: dict[int, str] = {}
        self.frame_count = 0
        self.tracker     = None
        self.bin_id:   str = ""
        self.bin_name: str = "No bin selected"
        self.bin_fill: int = 0
        self.recent_events: list[dict] = []   # last 20 shown on frontend

    def init_tracker(self):
        try:
            from deep_sort_realtime.deepsort_tracker import DeepSort
            self.tracker = DeepSort(max_iou_distance=0.7, max_age=30, n_init=3)
            logger.info("DeepSORT tracker initialised")
        except Exception as e:
            logger.warning(f"DeepSORT unavailable: {e}. Running without tracking.")
            self.tracker = None


# ─────────────────────────────────────────────────────────────────────────────
#  Frame processing (runs in thread-pool executor — blocking OK here)
# ─────────────────────────────────────────────────────────────────────────────

def _process_frame(engine, session: WebcamSession, frame: np.ndarray) -> tuple[np.ndarray, list[dict]]:
    """
    Detect on one frame; returns (annotated_bgr, list_of_new_events).
    All events in the returned list are NEW (not seen before this call).
    """
    engine._load_models()          # no-op after first call
    h, w = frame.shape[:2]
    annotated  = frame.copy()
    new_events: list[dict] = []

    ds_input: list = []   # [[x,y,w,h], conf, class_str]
    all_meta: list = []   # parallel list for fallback drawing

    # ── Haar face blur ────────────────────────────────────────────────────────
    if engine._face_cascade is not None and engine.settings.enable_face_blur:
        gray  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = engine._face_cascade.detectMultiScale(gray, 1.3, 5, minSize=(30, 30))
        for (fx, fy, fw, fh) in faces:
            roi = annotated[fy:fy+fh, fx:fx+fw]
            if roi.size > 0:
                annotated[fy:fy+fh, fx:fx+fw] = cv2.GaussianBlur(roi, (51, 51), 30)
                session.face_blur_count += 1

    # ── Human detection via yolov8n (person class=0 only) ────────────────────
    human_boxes = []
    if engine._human_model is not None and engine.settings.enable_face_blur:
        try:
            h_results = engine._human_model(frame, classes=[0], verbose=False, conf=0.45)
            for r in h_results:
                for box in r.boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    conf = float(box.conf[0])
                    human_boxes.append((x1, y1, x2, y2))
                    bw, bh = x2-x1, y2-y1
                    ds_input.append(([x1, y1, bw, bh], conf, "Human"))
                    all_meta.append({"waste_type": "Human", "confidence": conf,
                                     "x1": x1, "y1": y1, "x2": x2, "y2": y2})
        except Exception as e:
            logger.debug(f"Human det error: {e}")

    # ── Waste detection via best.pt ───────────────────────────────────────────
    if engine._object_model is not None:
        try:
            obj_results = engine._object_model(frame, verbose=False, conf=0.15)
            for r in obj_results:
                for box in r.boxes:
                    conf_val = float(box.conf[0])
                    cls_idx  = int(box.cls[0])
                    raw_name = engine._object_model.names.get(cls_idx, "unknown")
                    category = _map_class(raw_name)
                    x1_w, y1_w, x2_w, y2_w = map(int, box.xyxy[0])
                    
                    overlap = False
                    for hb in human_boxes:
                        if _is_inside_box((x1_w, y1_w, x2_w, y2_w), hb, 0.3):
                            overlap = True
                            break
                    if overlap:
                        continue
                        
                    bw, bh = x2_w-x1_w, y2_w-y1_w
                    ds_input.append(([x1_w, y1_w, bw, bh], conf_val, category))
                    all_meta.append({"waste_type": category, "confidence": conf_val,
                                     "x1": x1_w, "y1": y1_w, "x2": x2_w, "y2": y2_w})
        except Exception as e:
            logger.debug(f"Waste det error: {e}")

    # ── DeepSORT tracking ─────────────────────────────────────────────────────
    if session.tracker is not None and ds_input:
        try:
            tracks = session.tracker.update_tracks(ds_input, frame=frame)
            for track in tracks:
                if not track.is_confirmed():
                    continue
                tid  = track.track_id
                ltrb = track.to_ltrb()
                tx1, ty1, tx2, ty2 = map(int, ltrb)

                # Determine category for this track
                if hasattr(track, "det_class") and track.det_class:
                    category = track.det_class
                else:
                    category = session.track_class_map.get(tid, "Unknown")

                # Update track→class mapping from nearest raw detection
                if ds_input:
                    cx, cy = (tx1+tx2)//2, (ty1+ty2)//2
                    best_dist, best_cat = float("inf"), category
                    for (bbox, _, cat) in ds_input:
                        bx1, by1, bw2, bh2 = bbox
                        bcx, bcy = bx1+bw2//2, by1+bh2//2
                        dist = abs(cx-bcx) + abs(cy-bcy)
                        if dist < best_dist:
                            best_dist = dist
                            best_cat  = cat
                    if best_dist < 100:
                        session.track_class_map[tid] = best_cat
                        category = best_cat

                # Draw box + label
                color = CLASS_COLORS.get(category, (0, 255, 0))
                cv2.rectangle(annotated, (tx1, ty1), (tx2, ty2), color, 2)
                _draw_label(annotated, f"{category} #{tid}", tx1, ty1, color)

                # Count each track once
                if tid not in session.counted_ids:
                    session.counted_ids.add(tid)

                    if category == "Human":
                        new_events.append({
                            "type":       "human",
                            "label":      "Human",
                            "track_id":   tid,
                            "confidence": 0.85,
                            "is_contamination": False,
                            "bbox": {"x1": tx1, "y1": ty1, "x2": tx2, "y2": ty2},
                        })

                    elif category in WASTE_CATEGORIES:
                        session.class_counts[category] = session.class_counts.get(category, 0) + 1
                        is_contam = category == "Bio-Hazard"
                        if is_contam:
                            session.contamination_count += 1
                        vol = _estimate_volume((tx2-tx1)*(ty2-ty1), w, h)
                        event = {
                            "type":       "detection",
                            "label":      category,
                            "track_id":   tid,
                            "confidence": 0.85,
                            "is_contamination": is_contam,
                            "estimated_volume_ml": vol,
                            "bbox": {"x1": tx1, "y1": ty1, "x2": tx2, "y2": ty2},
                        }
                        new_events.append(event)
                        session.recent_events = [event] + session.recent_events[:19]

        except Exception as e:
            logger.debug(f"DeepSORT update error: {e}")

    elif ds_input:
        # No tracker — draw raw detections without IDs
        for meta in all_meta:
            wt    = meta["waste_type"]
            color = CLASS_COLORS.get(wt, (0, 255, 0))
            x1, y1, x2, y2 = meta["x1"], meta["y1"], meta["x2"], meta["y2"]
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            _draw_label(annotated, f"{wt} {meta['confidence']:.0%}", x1, y1, color)

            if wt in WASTE_CATEGORIES:
                session.class_counts[wt] = session.class_counts.get(wt, 0) + 1
                is_contam = wt == "Bio-Hazard"
                if is_contam:
                    session.contamination_count += 1
                vol = _estimate_volume((x2-x1)*(y2-y1), w, h)
                event = {
                    "type":       "detection",
                    "label":      wt,
                    "track_id":   None,
                    "confidence": meta["confidence"],
                    "is_contamination": is_contam,
                    "estimated_volume_ml": vol,
                    "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                }
                new_events.append(event)
                session.recent_events = [event] + session.recent_events[:19]

    # Stats overlay
    _draw_stats_overlay(annotated, session.class_counts, session.contamination_count)

    return annotated, new_events


async def _save_events_to_mongo(db, session: WebcamSession, new_events: list[dict]):
    """Persist detection events + update bin fill — fire-and-forget."""
    if not new_events:
        return
    now = datetime.now(timezone.utc)
    docs = []
    for ev in new_events:
        label   = ev.get("label", "Unknown")
        ev_type = ev.get("type", "")
        if label == "Human":
            continue   # don't save human detections
        docs.append({
            "bin_id":      session.bin_id or "webcam",
            "session_id":  "live_stream",
            "timestamp":   now,
            "waste_type":  label,
            "confidence":  ev.get("confidence", 1.0),
            "is_contamination": ev.get("is_contamination", False),
            "line_crossed": ev_type == "detection",
            "estimated_volume_ml": ev.get("estimated_volume_ml", 0),
            "bounding_box": ev.get("bbox", {}),
        })

    if docs:
        try:
            await db.detection_events.insert_many(docs)
        except Exception as e:
            logger.error(f"DB insert error: {e}")

    # Update bin item counters
    if session.bin_id:
        for ev in new_events:
            label = ev.get("label", "")
            if label in WASTE_CATEGORIES and label != "Unknown":
                field = f"items.{label.lower().replace('-', '_')}"
                try:
                    from app.services.bin_service import increment_bin_counters
                    await increment_bin_counters(session.bin_id, label)
                except Exception as e:
                    logger.debug(f"Bin increment error: {e}")


# ─────────────────────────────────────────────────────────────────────────────
#  WebSocket — live webcam stream
# ─────────────────────────────────────────────────────────────────────────────

@router.websocket("/stream")
async def webcam_stream(websocket: WebSocket):
    """
    Protocol:
      Client → server: JSON {
        "frame":   "<base64 JPEG>",
        "bin_id":  "<optional MongoDB bin ObjectId>"
      }
      Server → client: JSON {
        "frame":              "<base64 annotated JPEG>",
        "detections":         [...],
        "counts":             {...},
        "contamination_count": N,
        "face_blur_count":    N,
        "fps":                N,
        "frame_count":        N
      }
    """
    await websocket.accept()
    logger.info("Webcam WS connected")

    engine  = get_engine()
    session = WebcamSession()
    session.init_tracker()

    fps_counter = 0
    fps_start   = time.time()
    current_fps = 0.0

    try:
        while True:
            # Receive frame
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=15.0)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"error": "timeout"}))
                continue
            except WebSocketDisconnect:
                raise

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            frame_b64 = msg.get("frame", "")
            if not frame_b64:
                continue

            # Update bin selection if sent
            new_bin_id = msg.get("bin_id", "")
            if new_bin_id and new_bin_id != session.bin_id:
                session.bin_id = new_bin_id
                try:
                    from bson import ObjectId
                    db  = get_db()
                    doc = await db.bins.find_one({"_id": ObjectId(new_bin_id)})
                    if doc:
                        session.bin_name = doc.get("name", "Unknown Bin")
                        session.bin_fill = doc.get("fill_percentage", 0)
                except Exception:
                    pass

            # Decode JPEG
            try:
                img_bytes = base64.b64decode(frame_b64)
                np_arr    = np.frombuffer(img_bytes, np.uint8)
                frame     = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                if frame is None:
                    continue
            except Exception as e:
                logger.debug(f"Frame decode error: {e}")
                continue

            session.frame_count += 1

            # Run detection in thread pool (blocking calls inside)
            loop = asyncio.get_event_loop()
            try:
                annotated, new_events = await loop.run_in_executor(
                    None, _process_frame, engine, session, frame
                )
            except Exception as e:
                logger.error(f"Detection error: {e}", exc_info=True)
                annotated  = frame
                new_events = []

            # Encode result
            try:
                _, buf     = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
                out_b64    = base64.b64encode(buf).decode()
            except Exception:
                continue

            # Persist to MongoDB (non-blocking)
            if new_events:
                db = get_db()
                asyncio.create_task(_save_events_to_mongo(db, session, new_events))

            # FPS
            fps_counter += 1
            elapsed = time.time() - fps_start
            if elapsed >= 1.0:
                current_fps = round(fps_counter / elapsed, 1)
                fps_counter = 0
                fps_start   = time.time()

            response = {
                "frame":               out_b64,
                "detections":          new_events,
                "counts":              session.class_counts,
                "contamination_count": session.contamination_count,
                "face_blur_count":     session.face_blur_count,
                "fps":                 current_fps,
                "frame_count":         session.frame_count,
                "bin_info": {
                    "id":   session.bin_id,
                    "name": session.bin_name,
                    "fill": session.bin_fill,
                },
            }
            await websocket.send_text(json.dumps(response))

    except WebSocketDisconnect:
        logger.info(f"Webcam WS disconnected after {session.frame_count} frames")
    except Exception as e:
        logger.error(f"Webcam WS error: {e}", exc_info=True)
        try:
            await websocket.send_text(json.dumps({"error": str(e)}))
        except Exception:
            pass
    finally:
        logger.info(
            f"Session ended | counts={session.class_counts} "
            f"contam={session.contamination_count}"
        )
        try:
            await websocket.close()
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────────────────
#  POST /api/webcam/detect-image  — single image upload detection
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/detect-image")
async def detect_image_endpoint(
    file:       UploadFile = File(...),
    bin_id:     str        = Form(default=""),
    confidence: float      = Form(default=0.40),
):
    """
    Upload an image → run detection → return annotated image + detections.
    Saves detections to MongoDB detection_events.
    """
    allowed = {"image/jpeg", "image/png", "image/webp", "image/bmp"}
    if file.content_type not in allowed:
        return JSONResponse({"error": f"Unsupported type {file.content_type}"}, status_code=400)

    try:
        data     = await file.read()
        np_arr   = np.frombuffer(data, np.uint8)
        frame    = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return JSONResponse({"error": "Cannot decode image"}, status_code=400)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    engine = get_engine()

    loop = asyncio.get_event_loop()
    try:
        annotated, detections = await loop.run_in_executor(
            None, engine.detect_image, frame, confidence
        )
    except Exception as e:
        logger.error(f"detect_image error: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)

    # Encode annotated image to base64
    _, buf    = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 92])
    img_b64   = base64.b64encode(buf).decode()

    # Persist waste detections (not humans)
    db   = get_db()
    now  = datetime.now(timezone.utc)
    docs = []
    for det in detections:
        wt = det.get("waste_type", "Unknown")
        if wt == "Human":
            continue
        docs.append({
            "bin_id":      bin_id or "image_upload",
            "session_id":  "image_detection",
            "timestamp":   now,
            "waste_type":  wt,
            "confidence":  det.get("confidence", 0),
            "is_contamination": det.get("is_contamination", False),
            "line_crossed": False,
            "estimated_volume_ml": det.get("estimated_volume_ml", 0),
            "bounding_box": det.get("bbox", {}),
        })

    if docs:
        try:
            await db.detection_events.insert_many(docs)
        except Exception as e:
            logger.error(f"Image det DB save error: {e}")

    # Summary counts
    counts: dict[str, int] = {}
    for det in detections:
        wt = det.get("waste_type", "Unknown")
        if wt != "Human":
            counts[wt] = counts.get(wt, 0) + 1

    return {
        "annotated_image": img_b64,
        "detections":      detections,
        "counts":          counts,
        "total_objects":   len([d for d in detections if d.get("waste_type") != "Human"]),
        "saved_to_db":     len(docs),
    }
