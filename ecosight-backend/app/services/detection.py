"""
EcoSight Detection Engine
- best.pt  → waste detection (Plastic, Metal, Glass, Paper, Bio-Hazard, Unknown)
- yolov8n.pt → human detection + face blur ONLY (person class=0)
  * yolov8n detections are NOT labelled as waste classes
  * Only best.pt determines waste labels — no colour heuristics
- DeepSORT object tracking with track-ID labels
- Liquid contamination: bio-hazard flag only (no colour analysis)
- Bin volume estimation from bounding-box area
- ONNX Int8 quantization helper
"""

# ── pkg_resources shim (Python 3.12 compatibility) ───────────────────────────
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

import cv2
import numpy as np
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Waste class mapping ───────────────────────────────────────────────────────
# Keys: lowercase class names your best.pt model outputs.
# Values: canonical EcoSight category.
# Anything NOT in this map → "Unknown" (not saved to MongoDB).
#
# To see your model's exact class names run:
#   from ultralytics import YOLO; m=YOLO("models_dir/best.pt"); print(m.names)
# Then add any missing entries below.

WASTE_CLASS_MAP: dict[str, str] = {
    # Plastic variants
    "plastic":          "Plastic",
    "bottle":           "Plastic",
    "pet":              "Plastic",
    "pet_bottle":       "Plastic",
    "plastic_bottle":   "Plastic",
    "plastic_bag":      "Plastic",
    "straw":            "Plastic",
    # Metal variants
    "metal":            "Metal",
    "tin":              "Metal",
    "can":              "Metal",
    "aluminum":         "Metal",
    "aluminium":        "Metal",
    "tin_can":          "Metal",
    "metal_can":        "Metal",
    # Glass variants
    "glass":            "Glass",
    "jar":              "Glass",
    "glass_bottle":     "Glass",
    # Paper / Cardboard variants
    "paper":            "Paper",
    "cardboard":        "Paper",
    "carton":           "Paper",
    "newspaper":        "Paper",
    "paper_cup":        "Paper",
    # Bio-Hazard variants
    "bio":              "Bio-Hazard",
    "biohazard":        "Bio-Hazard",
    "bio_hazard":       "Bio-Hazard",
    "organic":          "Bio-Hazard",
    "biodegradable":    "Bio-Hazard",
    "food_waste":       "Bio-Hazard",
    "bio-hazard":       "Bio-Hazard",
    # Catch-all
    "waste":            "Unknown",
    "trash":            "Unknown",
    "garbage":          "Unknown",
}

# Bounding-box colour per category (BGR)
CLASS_COLORS: dict[str, tuple] = {
    "Plastic":    (0,   200, 100),
    "Metal":      (200, 100,   0),
    "Glass":      (0,   180, 220),
    "Paper":      (220, 180,   0),
    "Bio-Hazard": (0,     0, 220),
    "Unknown":    (150, 150, 150),
    "Human":      (255,  80,  80),
}

FONT = cv2.FONT_HERSHEY_SIMPLEX

WASTE_CATEGORIES = {"Plastic", "Metal", "Glass", "Paper", "Bio-Hazard", "Unknown"}


def _map_class(raw_name: str) -> str:
    """Map a raw model class name to an EcoSight category."""
    key = raw_name.lower().strip().replace(" ", "_")
    # Direct match
    if key in WASTE_CLASS_MAP:
        return WASTE_CLASS_MAP[key]
    # Partial match — if any key is a substring of the raw name
    for k, v in WASTE_CLASS_MAP.items():
        if k in key or key in k:
            return v
    return "Unknown"


# ─────────────────────────────────────────────────────────────────────────────
#  DetectionEngine
# ─────────────────────────────────────────────────────────────────────────────

class DetectionEngine:
    def __init__(self, settings):
        self.settings = settings
        self._object_model = None   # best.pt  — waste detection
        self._human_model  = None   # yolov8n  — human / face blur ONLY
        self._face_cascade = None
        self._loaded = False

    # ── Lazy load ─────────────────────────────────────────────────────────────
    def _load_models(self):
        if self._loaded:
            return

        try:
            from ultralytics import YOLO

            obj_path   = self.settings.object_model_path
            human_path = self.settings.human_model_path

            # ---------- Waste model (best.pt) ----------
            if os.path.exists(obj_path):
                self._object_model = YOLO(obj_path)
                logger.info(f"Waste model loaded: {obj_path}")
                logger.info(f"Waste model classes: {self._object_model.names}")
            else:
                logger.warning(f"Waste model NOT found at '{obj_path}' — detections disabled")

            # ---------- Human model (yolov8n.pt) ----------
            # Only load if paths differ; otherwise human detection is disabled
            # to avoid labelling everything with waste model's human class.
            if os.path.exists(human_path):
                if os.path.abspath(human_path) == os.path.abspath(obj_path):
                    logger.warning(
                        "human_model_path == object_model_path. "
                        "Set HUMAN_MODEL_PATH=models_dir/yolov8n.pt "
                        "in .env for separate human detection."
                    )
                    self._human_model = None
                else:
                    self._human_model = YOLO(human_path)
                    logger.info(f"Human model loaded: {human_path}")
            else:
                # Auto-download yolov8n if path looks like the default name
                if "yolov8n" in str(human_path).lower():
                    try:
                        self._human_model = YOLO("yolov8n.pt")  # triggers auto-download
                        logger.info("yolov8n.pt auto-downloaded for human detection")
                    except Exception as e:
                        logger.warning(f"yolov8n auto-download failed: {e}. Face blur disabled.")
                else:
                    logger.warning(f"Human model NOT found at '{human_path}'. Face blur disabled.")

        except Exception as e:
            logger.error(f"Model loading error: {e}", exc_info=True)

        # Haar cascade for face blurring
        try:
            cascade_xml = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            self._face_cascade = cv2.CascadeClassifier(cascade_xml)
        except Exception:
            self._face_cascade = None

        self._loaded = True

    def _new_tracker(self):
        """Return a fresh per-session DeepSORT tracker, or None on failure."""
        try:
            from deep_sort_realtime.deepsort_tracker import DeepSort
            return DeepSort(max_iou_distance=0.7, max_age=30, n_init=3)
        except Exception as e:
            logger.warning(f"DeepSORT unavailable ({e}). Tracking disabled.")
            return None

    # ── Single-image detection (used by detect-image endpoint) ────────────────
    def detect_image(self, frame: np.ndarray, confidence: float = 0.15) -> tuple[np.ndarray, list[dict]]:
        """
        Run detection on a single BGR image/frame.
        Returns (annotated_frame, list_of_detection_dicts).
        """
        self._load_models()
        annotated = frame.copy()
        detections: list[dict] = []

        h, w = frame.shape[:2]

        # Face blur via Haar cascade
        if self._face_cascade is not None and self.settings.enable_face_blur:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self._face_cascade.detectMultiScale(gray, 1.3, 5, minSize=(30, 30))
            for (fx, fy, fw, fh) in faces:
                roi = annotated[fy:fy+fh, fx:fx+fw]
                if roi.size > 0:
                    annotated[fy:fy+fh, fx:fx+fw] = cv2.GaussianBlur(roi, (51, 51), 30)

        # Human detection via yolov8n (class 0 = person)
        human_boxes = []
        if self._human_model is not None and self.settings.enable_face_blur:
            try:
                results = self._human_model(frame, classes=[0], verbose=False, conf=0.45)
                for r in results:
                    for box in r.boxes:
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        conf = float(box.conf[0])
                        human_boxes.append((x1, y1, x2, y2))
                        color = CLASS_COLORS["Human"]
                        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                        _draw_label(annotated, f"human {conf:.0%}", x1, y1, color)
                        detections.append({
                            "waste_type": "Human",
                            "confidence": round(conf, 3),
                            "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                            "is_contamination": False,
                        })
            except Exception as e:
                logger.debug(f"Human detection error: {e}")

        # Waste detection via best.pt
        if self._object_model is not None:
            try:
                results = self._object_model(frame, verbose=False, conf=confidence)
                for r in results:
                    for box in r.boxes:
                        conf_val = float(box.conf[0])
                        cls_idx  = int(box.cls[0])
                        raw_name = self._object_model.names.get(cls_idx, "unknown")
                        category = _map_class(raw_name)

                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        
                        overlap = False
                        for hb in human_boxes:
                            if _is_inside_box((x1, y1, x2, y2), hb, 0.3):
                                overlap = True
                                break
                        if overlap:
                            continue
                        is_contam = category == "Bio-Hazard"
                        vol_ml    = _estimate_volume((x2-x1)*(y2-y1), w, h)

                        color = CLASS_COLORS.get(category, (0, 255, 0))
                        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                        _draw_label(annotated, f"{category} {conf_val:.0%}", x1, y1, color)

                        detections.append({
                            "waste_type": category,
                            "raw_class":  raw_name,
                            "confidence": round(conf_val, 3),
                            "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                            "is_contamination": is_contam,
                            "estimated_volume_ml": vol_ml,
                        })
            except Exception as e:
                logger.debug(f"Waste detection error: {e}")

        _draw_stats_overlay_from_detections(annotated, detections)
        return annotated, detections

    # ── Full video processing ─────────────────────────────────────────────────
    def process_video(
        self,
        video_path: str,
        bin_id: str,
        session_id: str,
        output_path: str,
        progress_callback=None,
        confidence: float = 0.15,
    ) -> dict:
        self._load_models()
        tracker = self._new_tracker()

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video: {video_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        fps_video    = cap.get(cv2.CAP_PROP_FPS) or 25.0
        vid_w        = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        vid_h        = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        fourcc = cv2.VideoWriter_fourcc(*"vp80")
        out    = cv2.VideoWriter(output_path, fourcc, fps_video, (vid_w, vid_h))

        class_counts: dict[str, int] = {
            "Plastic": 0, "Metal": 0, "Glass": 0,
            "Paper": 0, "Bio-Hazard": 0, "Unknown": 0,
        }
        events: list[dict]      = []
        counted_ids: set[int]   = set()
        track_last_y: dict[int, float] = {}
        contamination_count = 0
        face_blur_count     = 0
        frame_idx           = 0

        # DeepSORT needs a per-track class label; store it here
        track_class_map: dict[int, str] = {}

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1
            annotated = frame.copy()

            ds_input  = []   # for DeepSORT
            all_meta  = []   # parallel metadata list

            # ── Haar face blur ────────────────────────────────────────────────
            if self._face_cascade is not None and self.settings.enable_face_blur:
                gray  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = self._face_cascade.detectMultiScale(gray, 1.3, 5, minSize=(30, 30))
                for (fx, fy, fw, fh) in faces:
                    roi = annotated[fy:fy+fh, fx:fx+fw]
                    if roi.size > 0:
                        annotated[fy:fy+fh, fx:fx+fw] = cv2.GaussianBlur(roi, (51, 51), 30)
                        face_blur_count += 1

            # ── Human detection (yolov8n, class 0 only) ───────────────────────
            human_boxes = []
            if self._human_model is not None and self.settings.enable_face_blur:
                try:
                    h_res = self._human_model(frame, classes=[0], verbose=False, conf=0.45)
                    for r in h_res:
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

            # ── Waste detection (best.pt) ─────────────────────────────────────
            if self._object_model is not None:
                try:
                    obj_res = self._object_model(frame, verbose=False, conf=confidence)
                    for r in obj_res:
                        for box in r.boxes:
                            conf_val = float(box.conf[0])
                            cls_idx  = int(box.cls[0])
                            raw_name = self._object_model.names.get(cls_idx, "unknown")
                            category = _map_class(raw_name)
                            x1, y1, x2, y2 = map(int, box.xyxy[0])
                            
                            overlap = False
                            for hb in human_boxes:
                                if _is_inside_box((x1, y1, x2, y2), hb, 0.3):
                                    overlap = True
                                    break
                            if overlap:
                                continue
                                
                            bw, bh = x2-x1, y2-y1
                            ds_input.append(([x1, y1, bw, bh], conf_val, category))
                            all_meta.append({"waste_type": category, "confidence": conf_val,
                                             "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                                             "raw_class": raw_name})
                except Exception as e:
                    logger.debug(f"Waste det error: {e}")

            # ── Tracking / drawing ────────────────────────────────────────────
            if tracker is not None and ds_input:
                try:
                    tracks = tracker.update_tracks(ds_input, frame=frame)
                    for track in tracks:
                        if not track.is_confirmed():
                            continue
                        tid  = track.track_id
                        ltrb = track.to_ltrb()
                        tx1, ty1, tx2, ty2 = map(int, ltrb)

                        # Retrieve class: DeepSORT may expose det_class or we use our map
                        if hasattr(track, "det_class") and track.det_class:
                            category = track.det_class
                        else:
                            category = track_class_map.get(tid, "Unknown")

                        # Update map with latest confirmed det
                        # (closest raw detection to track centroid)
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
                            if best_dist < 80:
                                track_class_map[tid] = best_cat
                                category = best_cat

                        color = CLASS_COLORS.get(category, (0, 255, 0))
                        cv2.rectangle(annotated, (tx1, ty1), (tx2, ty2), color, 2)
                        _draw_label(annotated, f"{category} #{tid}", tx1, ty1, color)

                        # Count each track once
                        if tid not in counted_ids:
                            counted_ids.add(tid)
                            if category == "Human":
                                face_blur_count += 1
                                events.append(_make_event(
                                    bin_id, session_id, "Human",
                                    0.85, False, False, 0.0, frame_idx,
                                    tx1, ty1, tx2, ty2, vid_w, vid_h, tid,
                                ))
                            elif category in WASTE_CATEGORIES:
                                class_counts[category] = class_counts.get(category, 0) + 1
                                is_contam = category == "Bio-Hazard"
                                if is_contam:
                                    contamination_count += 1
                                vol = _estimate_volume((tx2-tx1)*(ty2-ty1), vid_w, vid_h)
                                events.append(_make_event(
                                    bin_id, session_id, category,
                                    0.85, is_contam, False, vol, frame_idx,
                                    tx1, ty1, tx2, ty2, vid_w, vid_h, tid,
                                ))

                except Exception as e:
                    logger.debug(f"DeepSORT error: {e}")

            elif ds_input:
                # No tracker — draw raw detections
                for meta in all_meta:
                    wt    = meta["waste_type"]
                    color = CLASS_COLORS.get(wt, (0, 255, 0))
                    x1, y1, x2, y2 = meta["x1"], meta["y1"], meta["x2"], meta["y2"]
                    cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                    _draw_label(annotated, f"{wt} {meta['confidence']:.0%}", x1, y1, color)
                    if wt in WASTE_CATEGORIES and wt != "Unknown":
                        class_counts[wt] = class_counts.get(wt, 0) + 1
                        is_contam = wt == "Bio-Hazard"
                        if is_contam:
                            contamination_count += 1
                        vol = _estimate_volume((x2-x1)*(y2-y1), vid_w, vid_h)
                        events.append(_make_event(
                            bin_id, session_id, wt,
                            meta["confidence"], is_contam, False, vol, frame_idx,
                            x1, y1, x2, y2, vid_w, vid_h, None,
                        ))

            _draw_stats_overlay(annotated, class_counts, contamination_count)
            out.write(annotated)

            if progress_callback and frame_idx % 10 == 0:
                pct = (frame_idx / total_frames) * 100
                progress_callback(frame_idx, total_frames, pct)

        cap.release()
        out.release()

        return {
            "total_frames":        total_frames,
            "processed_frames":    frame_idx,
            "events":              events,
            "class_counts":        class_counts,
            "contamination_count": contamination_count,
            "face_blurs_count":    face_blur_count,
            "total_items_counted": sum(v for k, v in class_counts.items() if k != "Unknown"),
            "output_path":         output_path,
        }


# ─────────────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_event(bin_id, session_id, waste_type, confidence,
                is_contam, is_liquid, vol_ml, frame_idx,
                x1, y1, x2, y2, fw, fh, track_id) -> dict:
    return {
        "bin_id":      bin_id,
        "session_id":  session_id,
        "waste_type":  waste_type,
        "confidence":  round(confidence, 3),
        "is_contamination":       is_contam,
        "is_liquid_contamination": is_liquid,
        "line_crossed": True,
        "frame_index":  frame_idx,
        "estimated_volume_ml": round(vol_ml, 1),
        "bounding_box": {
            "x":       x1 / fw if fw else 0,
            "y":       y1 / fh if fh else 0,
            "width":   (x2-x1) / fw if fw else 0,
            "height":  (y2-y1) / fh if fh else 0,
            "track_id": track_id,
        },
    }


def _is_inside_box(boxA: tuple, boxB: tuple, thresh: float = 0.3) -> bool:
    """Check if boxA (x1,y1,x2,y2) is inside or heavily overlaps boxB (hx1,hy1,hx2,hy2)."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    interArea = max(0, xB - xA) * max(0, yB - yA)
    if interArea == 0:
        return False

    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    if boxAArea == 0:
        return False
        
    return (interArea / boxAArea) > thresh


def _estimate_volume(area_px: int, frame_w: int, frame_h: int) -> float:
    if frame_w == 0 or frame_h == 0:
        return 0.0
    px_per_m  = frame_w / 0.6
    area_m2   = area_px / (px_per_m ** 2)
    vol_liters = area_m2 * 0.15
    return round(vol_liters * 1000, 1)


def _draw_label(img, text: str, x: int, y: int, color: tuple):
    """Draw label with dark background for readability."""
    font_scale = 0.55
    thickness  = 2
    (tw, th), _ = cv2.getTextSize(text, FONT, font_scale, thickness)
    ty = max(y - 8, th + 4)
    cv2.rectangle(img, (x, ty - th - 4), (x + tw + 4, ty + 2), (0, 0, 0), -1)
    cv2.putText(img, text, (x + 2, ty), FONT, font_scale, color, thickness)


def _draw_stats_overlay(img, class_counts: dict, contamination_count: int):
    lines = [("EcoSight", (255, 255, 255))]
    for cls, cnt in class_counts.items():
        if cnt > 0 or cls != "Unknown":
            lines.append((f"{cls}: {cnt}", CLASS_COLORS.get(cls, (200, 200, 200))))
    lines.append((f"Contam: {contamination_count}", (0, 80, 255)))

    lh = 20
    ph = 10 + len(lines) * lh + 6
    pw = 190
    overlay = img.copy()
    cv2.rectangle(overlay, (6, 6), (6 + pw, 6 + ph), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.55, img, 0.45, 0, img)
    y = 6 + lh
    for text, color in lines:
        cv2.putText(img, text, (12, y), FONT, 0.45, color, 1)
        y += lh


def _draw_stats_overlay_from_detections(img, detections: list):
    counts: dict[str, int] = {}
    contam = 0
    for d in detections:
        wt = d.get("waste_type", "Unknown")
        if wt != "Human":
            counts[wt] = counts.get(wt, 0) + 1
            if d.get("is_contamination"):
                contam += 1
    _draw_stats_overlay(img, counts, contam)


# ─────────────────────────────────────────────────────────────────────────────
#  Quantization helper
# ─────────────────────────────────────────────────────────────────────────────

def quantize_model_to_int8(pt_path: str, output_dir: str = "models_dir") -> str:
    from ultralytics import YOLO
    import onnx
    from onnxruntime.quantization import quantize_dynamic, QuantType

    logger.info(f"Quantizing {pt_path} → Int8 ONNX…")
    model     = YOLO(pt_path)
    onnx_path = model.export(format="onnx", imgsz=640, dynamic=False)
    q_path    = os.path.join(output_dir, Path(pt_path).stem + "_int8.onnx")
    quantize_dynamic(onnx_path, q_path, weight_type=QuantType.QInt8)
    logger.info(f"Quantized model saved to {q_path}")
    return q_path


# ─────────────────────────────────────────────────────────────────────────────
#  Singleton
# ─────────────────────────────────────────────────────────────────────────────

_engine: Optional["DetectionEngine"] = None


def get_engine() -> "DetectionEngine":
    global _engine
    if _engine is None:
        from app.core.config import get_settings
        _engine = DetectionEngine(get_settings())
    return _engine


# Expose for webcam.py import
def _check_liquid_contamination(roi: np.ndarray) -> bool:
    """
    Kept for API compatibility.
    We no longer use colour heuristics — contamination is determined
    purely by waste category (Bio-Hazard = contaminated).
    """
    return False
