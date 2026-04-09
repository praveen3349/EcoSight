"""
API Routes — Bins, Cameras, Alerts
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from bson import ObjectId

from app.core.database import get_db
from app.models.schemas import BinCreate, BinUpdate
from app.services import bin_service

router = APIRouter(prefix="/bins", tags=["bins"])


def _is_valid_id(oid: str) -> bool:
    try:
        ObjectId(oid)
        return True
    except Exception:
        return False


@router.get("/")
async def list_bins():
    return await bin_service.list_bins()


@router.post("/", status_code=201)
async def create_bin(data: BinCreate):
    return await bin_service.create_bin(data)


@router.get("/{bin_id}")
async def get_bin(bin_id: str):
    if not _is_valid_id(bin_id):
        raise HTTPException(400, "Invalid bin ID")
    b = await bin_service.get_bin(bin_id)
    if not b:
        raise HTTPException(404, "Bin not found")
    return b


@router.patch("/{bin_id}")
async def update_bin(bin_id: str, data: BinUpdate):
    if not _is_valid_id(bin_id):
        raise HTTPException(400, "Invalid bin ID")
    updated = await bin_service.update_bin(bin_id, data)
    if not updated:
        raise HTTPException(404, "Bin not found")
    return updated


@router.delete("/{bin_id}")
async def delete_bin(bin_id: str):
    if not _is_valid_id(bin_id):
        raise HTTPException(400, "Invalid bin ID")
    ok = await bin_service.delete_bin(bin_id)
    if not ok:
        raise HTTPException(404, "Bin not found")
    return {"success": True}


@router.post("/{bin_id}/empty")
async def empty_bin(bin_id: str):
    if not _is_valid_id(bin_id):
        raise HTTPException(400, "Invalid bin ID")
    updated = await bin_service.empty_bin(bin_id)
    if not updated:
        raise HTTPException(404, "Bin not found")
    return updated
