# EcoSight Backend — Setup & Run Guide

## Overview

The backend is a **FastAPI** (Python) server that:
- Runs **YOLOv8** for multi-class waste detection
- Runs **YOLOv8n** for human detection + face blurring  
- Uses **DeepSORT** for object tracking with virtual line counting
- Detects **liquid contamination** via HSV opacity analysis
- Estimates **bin volume** from bounding box area
- Saves all detections to **MongoDB Atlas**
- Provides REST + **WebSocket** APIs consumed by the Next.js frontend

---

## 1. Prerequisites

- Python 3.10 or 3.11
- Your two model files:
  - `models_dir/best.pt` — your waste detection model
  - `models_dir/yolov8n.pt` — human detection (auto-downloaded if missing)

---

## 2. Install Dependencies

```bash
cd ecosight-backend
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
```

> **Note:** If you don't have a GPU, `ultralytics` will use CPU. Processing will be slower but functional.

---

## 3. Configure Environment

Edit `.env` with your actual credentials:

```env
# MongoDB Atlas (from cloud.mongodb.com)
MONGODB_URI=mongodb+srv://YOUR_USER:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/ecosight?retryWrites=true&w=majority
MONGODB_DB_NAME=ecosight

# Clerk Secret Key (from dashboard.clerk.com)
CLERK_SECRET_KEY=sk_test_YOUR_SECRET_KEY

# Your Next.js frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

---

## 4. Add Your Model Files

```
ecosight-backend/
└── models_dir/
    ├── best.pt          ← your waste detection model (REQUIRED)
    └── yolov8n.pt       ← human model (auto-downloaded if absent)
```

If `yolov8n.pt` is missing, it will be auto-downloaded by ultralytics on first use.

**Class mapping** (in `app/services/detection.py`):  
The system maps your model's class names to standard categories:
- `plastic`, `bottle`, `pet` → **Plastic**
- `metal`, `tin`, `can`, `aluminum` → **Metal**
- `glass`, `jar` → **Glass**
- `paper`, `cardboard`, `carton` → **Paper**
- `bio`, `biohazard`, `organic` → **Bio-Hazard**
- Everything else → **Unknown** (not saved to DB)

Edit `WASTE_CLASS_MAP` in `detection.py` to match your model's exact class names.

---

## 5. Initialize the Database

Run once to create indexes and seed sample data:

```bash
python scripts/init_db.py
```

---

## 6. Start the Backend

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

API docs available at: **http://localhost:8000/docs**

---

## 7. Start the Frontend

```bash
cd ../ecosight          # the Next.js project
npm install
npm run dev
```

Open: **http://localhost:3000**

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard/stats` | Live KPIs, charts, alerts |
| GET | `/api/bins/` | List all bins |
| POST | `/api/bins/` | Create bin (admin) |
| PATCH | `/api/bins/{id}` | Update bin (admin) |
| DELETE | `/api/bins/{id}` | Delete bin (admin) |
| POST | `/api/bins/{id}/empty` | Reset bin counters |
| GET | `/api/cameras/` | List cameras |
| POST | `/api/cameras/` | Add camera |
| POST | `/api/video/upload` | Upload video for AI detection |
| GET | `/api/video/sessions` | List processing sessions |
| GET | `/api/video/sessions/{id}` | Get session status |
| GET | `/api/video/result/{id}` | Download annotated video |
| WS | `/api/video/ws/{id}` | Live processing progress |
| GET | `/api/audit-log` | Detection history (paginated) |
| GET | `/api/reports` | Aggregated analytics |
| GET | `/api/alerts` | List active alerts |
| POST | `/api/alerts/{id}/resolve` | Resolve an alert |
| GET | `/api/models/status` | Check model files |
| POST | `/api/models/quantize` | Quantize model to Int8 ONNX |

---

## Bin Fill Calculation

Bins use **per-class capacity thresholds**. The fill % is the MAX across all classes:

```
fill_pct = max(
    plastic_count / plastic_capacity * 100,
    metal_count   / metal_capacity   * 100,
    glass_count   / glass_capacity   * 100,
    paper_count   / paper_capacity   * 100,
    bio_count     / bio_capacity     * 100,
)
```

**Default capacities** (configurable per bin):
- Plastic: 100 items
- Metal: 50 items
- Glass: 40 items
- Paper: 80 items
- Bio-Hazard: 30 items

Alerts fire automatically:
- `Warning` at ≥ 70%
- `Critical/Full` at ≥ 90%

---

## Virtual Line Counting

Items are counted when their **tracked centroid** crosses a horizontal line at 60% of frame height (top → bottom direction). This prevents double-counting the same object.

---

## Model Quantization

To convert your `.pt` model to Int8 ONNX for edge deployment:

```bash
curl -X POST http://localhost:8000/api/models/quantize?model=object
```

The quantized model appears in `models_dir/best_int8.onnx`.

---

## Project Structure

```
ecosight-backend/
├── main.py                    # FastAPI app entry point
├── requirements.txt
├── .env                       # Your credentials (DO NOT commit)
├── models_dir/                # Place .pt files here
│   ├── best.pt
│   └── yolov8n.pt
├── uploads/                   # Uploaded + processed videos (auto-created)
├── scripts/
│   └── init_db.py             # Database initialization
└── app/
    ├── core/
    │   ├── config.py          # Settings from .env
    │   └── database.py        # MongoDB connection + indexes
    ├── models/
    │   └── schemas.py         # Pydantic models
    ├── services/
    │   ├── detection.py       # YOLOv8 + DeepSORT + face blur
    │   ├── video_service.py   # Async video processing jobs
    │   ├── bin_service.py     # Bin CRUD + fill calculation + alerts
    │   └── stats_service.py   # Dashboard/reports aggregation
    └── api/
        ├── bins.py
        ├── cameras.py
        ├── video.py           # Upload + WebSocket progress
        ├── analytics.py       # Dashboard, reports, audit log, alerts
        └── models_api.py      # Model status + quantization
```
