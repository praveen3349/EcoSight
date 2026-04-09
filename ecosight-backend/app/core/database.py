from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)

settings = get_settings()

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def connect_db():
    global _client, _db
    logger.info("Connecting to MongoDB...")
    _client = AsyncIOMotorClient(settings.mongodb_uri)
    _db = _client[settings.mongodb_db_name]
    await _create_indexes()
    logger.info(f"Connected to MongoDB database: {settings.mongodb_db_name}")


async def disconnect_db():
    global _client
    if _client:
        _client.close()
        logger.info("MongoDB connection closed.")


async def _create_indexes():
    """Create all necessary indexes for performance."""
    db = get_db()

    # Bins
    await db.bins.create_index("name")
    await db.bins.create_index("location")
    await db.bins.create_index("status")
    await db.bins.create_index([("updatedAt", -1)])

    # Detection events
    await db.detection_events.create_index([("timestamp", -1)])
    await db.detection_events.create_index("bin_id")
    await db.detection_events.create_index("waste_type")
    await db.detection_events.create_index("camera_id")
    await db.detection_events.create_index("is_contamination")
    await db.detection_events.create_index([("bin_id", 1), ("timestamp", -1)])

    # Sessions (video processing jobs)
    await db.processing_sessions.create_index([("created_at", -1)])
    await db.processing_sessions.create_index("status")
    await db.processing_sessions.create_index("bin_id")

    # Cameras
    await db.cameras.create_index("name")
    await db.cameras.create_index("active")

    # Alerts
    await db.alerts.create_index([("created_at", -1)])
    await db.alerts.create_index("resolved")
    await db.alerts.create_index("bin_id")

    logger.info("Database indexes created.")


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not connected. Call connect_db() first.")
    return _db
