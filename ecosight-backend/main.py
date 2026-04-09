"""
EcoSight Backend — Main FastAPI Application
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.core.database import connect_db, disconnect_db
from app.api import bins, cameras, video, analytics, models_api, webcam, users

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.upload_dir, exist_ok=True)
    os.makedirs(os.path.join(settings.upload_dir, "output"), exist_ok=True)
    os.makedirs("models_dir", exist_ok=True)
    await connect_db()
    logger.info("EcoSight Backend started.")
    yield
    await disconnect_db()
    logger.info("EcoSight Backend stopped.")


app = FastAPI(
    title="EcoSight API",
    description="Backend for the EcoSight Smart Waste Management System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bins.router,       prefix="/api")
app.include_router(cameras.router,    prefix="/api")
app.include_router(video.router,      prefix="/api")
app.include_router(analytics.router,  prefix="/api")
app.include_router(models_api.router, prefix="/api")
app.include_router(webcam.router,     prefix="/api")
app.include_router(users.router,      prefix="/api")

output_dir = os.path.join(settings.upload_dir, "output")
os.makedirs(output_dir, exist_ok=True)
app.mount("/outputs", StaticFiles(directory=output_dir), name="outputs")


@app.get("/")
async def root():
    return {"name": "EcoSight API", "version": "1.0.0", "docs": "/docs", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.debug)
