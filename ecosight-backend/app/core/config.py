from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    # MongoDB
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "ecosight"

    # Clerk
    clerk_secret_key: str = ""

    # CORS
    frontend_url: str = "http://localhost:3000"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    # Model paths
    object_model_path: str = "models_dir/best.pt"
    human_model_path: str = "models_dir/yolov8n.pt"

    # Bin capacity per class (item counts)
    plastic_capacity: int = 100
    metal_capacity: int = 50
    glass_capacity: int = 40
    paper_capacity: int = 80
    bio_hazard_capacity: int = 30

    # Thresholds
    contamination_confidence_threshold: float = 0.75
    enable_face_blur: bool = True

    # Upload
    upload_dir: str = "uploads"

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
