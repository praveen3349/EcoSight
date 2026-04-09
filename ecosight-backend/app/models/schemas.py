from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ─────────────────────────────────────────────
#  Enums
# ─────────────────────────────────────────────

class WasteType(str, Enum):
    PLASTIC = "Plastic"
    METAL = "Metal"
    GLASS = "Glass"
    PAPER = "Paper"
    BIO_HAZARD = "Bio-Hazard"
    UNKNOWN = "Unknown"


class BinStatus(str, Enum):
    NORMAL = "Normal"
    WARNING = "Warning"
    CRITICAL = "Critical"
    FULL = "Full"


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertType(str, Enum):
    BIN_FULL = "bin_full"
    BIN_WARNING = "bin_warning"
    CONTAMINATION = "contamination"
    FACE_DETECTED = "face_detected"
    UNKNOWN_OBJECT = "unknown_object"


class SessionStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# ─────────────────────────────────────────────
#  Bin Item Counters
# ─────────────────────────────────────────────

class BinCounters(BaseModel):
    plastic: int = 0
    metal: int = 0
    glass: int = 0
    paper: int = 0
    bio_hazard: int = 0
    unknown: int = 0

    def total(self) -> int:
        return self.plastic + self.metal + self.glass + self.paper + self.bio_hazard

    def fill_percentage(self, capacities: Dict[str, int]) -> float:
        """
        Weighted fill percentage based on per-class item counts vs. capacities.
        Returns 0.0 – 100.0
        """
        scores = []
        pairs = [
            ("plastic", self.plastic),
            ("metal", self.metal),
            ("glass", self.glass),
            ("paper", self.paper),
            ("bio_hazard", self.bio_hazard),
        ]
        for key, count in pairs:
            cap = capacities.get(key, 100)
            if cap > 0:
                scores.append(min(count / cap, 1.0) * 100)
        if not scores:
            return 0.0
        # The bin is considered full when ANY category hits 100%.
        # Use the MAX score so the worst-case class drives the alert.
        return round(max(scores), 1)


# ─────────────────────────────────────────────
#  Bin
# ─────────────────────────────────────────────

class BinCreate(BaseModel):
    name: str
    location: str
    max_item_capacity: int = 1000
    plastic_capacity: int = 100
    metal_capacity: int = 50
    glass_capacity: int = 40
    paper_capacity: int = 80
    bio_hazard_capacity: int = 30
    zone: Optional[str] = None
    coords: Optional[Dict[str, float]] = None  # {"x": 0.0, "y": 0.0}


class BinUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    max_item_capacity: Optional[int] = None
    plastic_capacity: Optional[int] = None
    metal_capacity: Optional[int] = None
    glass_capacity: Optional[int] = None
    paper_capacity: Optional[int] = None
    bio_hazard_capacity: Optional[int] = None
    zone: Optional[str] = None
    coords: Optional[Dict[str, float]] = None


class BinResponse(BaseModel):
    id: str
    name: str
    location: str
    zone: Optional[str] = None
    status: BinStatus = BinStatus.NORMAL
    fill_percentage: float = 0.0
    counters: BinCounters = BinCounters()
    max_item_capacity: int = 1000
    plastic_capacity: int = 100
    metal_capacity: int = 50
    glass_capacity: int = 40
    paper_capacity: int = 80
    bio_hazard_capacity: int = 30
    last_emptied_at: Optional[datetime] = None
    estimated_days_to_full: Optional[float] = None
    coords: Optional[Dict[str, float]] = None
    created_at: datetime
    updated_at: datetime


class BinEmptyRequest(BaseModel):
    bin_id: str


# ─────────────────────────────────────────────
#  Camera
# ─────────────────────────────────────────────

class CameraCreate(BaseModel):
    name: str
    ip: str
    location: Optional[str] = ""
    active: bool = True
    fps: int = 30


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    ip: Optional[str] = None
    location: Optional[str] = None
    active: Optional[bool] = None


class CameraResponse(BaseModel):
    id: str
    name: str
    ip: str
    location: str
    active: bool
    fps: int
    created_at: datetime


# ─────────────────────────────────────────────
#  Detection Event
# ─────────────────────────────────────────────

class BoundingBox(BaseModel):
    x: float       # relative 0-1
    y: float
    width: float
    height: float
    confidence: float
    track_id: Optional[int] = None


class DetectionEventCreate(BaseModel):
    bin_id: str
    camera_id: Optional[str] = None
    session_id: Optional[str] = None
    waste_type: WasteType
    confidence: float
    is_contamination: bool = False
    is_liquid_contamination: bool = False
    bounding_box: Optional[BoundingBox] = None
    frame_index: Optional[int] = None
    line_crossed: bool = False          # item counted when it crosses the virtual line
    estimated_volume_ml: Optional[float] = None


class DetectionEventResponse(BaseModel):
    id: str
    bin_id: str
    camera_id: Optional[str]
    session_id: Optional[str]
    waste_type: WasteType
    confidence: float
    is_contamination: bool
    is_liquid_contamination: bool
    bounding_box: Optional[BoundingBox]
    frame_index: Optional[int]
    line_crossed: bool
    estimated_volume_ml: Optional[float]
    timestamp: datetime


# ─────────────────────────────────────────────
#  Alert
# ─────────────────────────────────────────────

class AlertResponse(BaseModel):
    id: str
    bin_id: Optional[str]
    camera_id: Optional[str]
    session_id: Optional[str]
    alert_type: AlertType
    severity: AlertSeverity
    message: str
    resolved: bool = False
    created_at: datetime


# ─────────────────────────────────────────────
#  Processing Session (Video upload job)
# ─────────────────────────────────────────────

class SessionCreate(BaseModel):
    bin_id: str
    camera_id: Optional[str] = None
    filename: str


class SessionResponse(BaseModel):
    id: str
    bin_id: str
    camera_id: Optional[str]
    filename: str
    status: SessionStatus
    total_frames: int = 0
    processed_frames: int = 0
    progress_pct: float = 0.0
    detections_count: int = 0
    contamination_count: int = 0
    face_blurs_count: int = 0
    error_message: Optional[str] = None
    result_video_path: Optional[str] = None
    summary: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


# ─────────────────────────────────────────────
#  Dashboard Stats
# ─────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_detections_today: int
    contamination_rate_pct: float
    active_cameras: int
    total_cameras: int
    active_alerts: int
    bins_normal: int
    bins_warning: int
    bins_critical: int
    detection_timeline: List[Dict[str, Any]]   # [{time, detections}]
    waste_distribution: List[Dict[str, Any]]   # [{name, value}]
    bin_fill_levels: List[Dict[str, Any]]       # [{bin, fill}]
    recent_alerts: List[Dict[str, Any]]


# ─────────────────────────────────────────────
#  Audit Log query response
# ─────────────────────────────────────────────

class AuditLogResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[DetectionEventResponse]


# ─────────────────────────────────────────────
#  Reports
# ─────────────────────────────────────────────

class ReportData(BaseModel):
    timeframe: str
    waste_trends: List[Dict[str, Any]]
    contamination_trend: List[Dict[str, Any]]
    bin_usage: List[Dict[str, Any]]
    waste_pie: List[Dict[str, Any]]
    summary: Dict[str, Any]
