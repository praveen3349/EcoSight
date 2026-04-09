from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.services.detection import quantize_model_to_int8
from app.core.config import get_settings
import os
import logging

router = APIRouter(prefix="/models", tags=["models"])
logger = logging.getLogger(__name__)
settings = get_settings()


@router.post("/quantize")
async def quantize_model(
    background_tasks: BackgroundTasks,
    model: str = "object",  # "object" | "human"
):
    """
    Trigger Float32 → Int8 ONNX quantization for the selected model.
    """
    if model == "object":
        pt_path = settings.object_model_path
    elif model == "human":
        pt_path = settings.human_model_path
    else:
        raise HTTPException(400, "model must be 'object' or 'human'")

    if not os.path.exists(pt_path):
        raise HTTPException(404, f"Model file not found: {pt_path}")

    def do_quantize():
        try:
            output = quantize_model_to_int8(pt_path, "models_dir")
            logger.info(f"Quantization done: {output}")
        except Exception as e:
            logger.error(f"Quantization failed: {e}")

    background_tasks.add_task(do_quantize)
    return {"message": f"Quantization of '{model}' model started in background."}


@router.get("/status")
async def model_status():
    """Check which model files are present."""
    return {
        "object_model": {
            "path": settings.object_model_path,
            "exists": os.path.exists(settings.object_model_path),
        },
        "human_model": {
            "path": settings.human_model_path,
            "exists": os.path.exists(settings.human_model_path),
        },
    }
