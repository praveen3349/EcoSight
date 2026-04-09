from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from bson import ObjectId
from app.core.database import get_db
from app.models.schemas import CameraCreate, CameraUpdate

router = APIRouter(prefix="/cameras", tags=["cameras"])


def _doc(d):
    d["id"] = str(d.pop("_id"))
    return d


@router.get("/")
async def list_cameras():
    db = get_db()
    cursor = db.cameras.find({}).sort("created_at", -1)
    return [_doc(d) async for d in cursor]


@router.post("/", status_code=201)
async def create_camera(data: CameraCreate):
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = {**data.model_dump(), "created_at": now, "updated_at": now}
    result = await db.cameras.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _doc(doc)


@router.patch("/{camera_id}")
async def update_camera(camera_id: str, data: CameraUpdate):
    db = get_db()
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc)
    await db.cameras.update_one({"_id": ObjectId(camera_id)}, {"$set": update})
    doc = await db.cameras.find_one({"_id": ObjectId(camera_id)})
    if not doc:
        raise HTTPException(404, "Camera not found")
    return _doc(doc)


@router.delete("/{camera_id}")
async def delete_camera(camera_id: str):
    db = get_db()
    result = await db.cameras.delete_one({"_id": ObjectId(camera_id)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Camera not found")
    return {"success": True}
