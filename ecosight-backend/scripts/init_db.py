"""
EcoSight MongoDB Initialization Script
Run once to create indexes and seed sample data.

Usage:
    python scripts/init_db.py
"""

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from motor.motor_asyncio import AsyncIOMotorClient


MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGODB_DB_NAME", "ecosight")


async def init():
    print(f"Connecting to MongoDB: {MONGODB_URI[:40]}…")
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DB_NAME]

    # ── Indexes ──────────────────────────────────────────────────────────────
    print("Creating indexes…")

    await db.bins.create_index("name")
    await db.bins.create_index("status")
    await db.bins.create_index([("updatedAt", -1)])

    await db.detection_events.create_index([("timestamp", -1)])
    await db.detection_events.create_index("bin_id")
    await db.detection_events.create_index("waste_type")
    await db.detection_events.create_index("is_contamination")
    await db.detection_events.create_index("line_crossed")

    await db.processing_sessions.create_index([("created_at", -1)])
    await db.processing_sessions.create_index("status")

    await db.cameras.create_index("active")
    await db.alerts.create_index([("created_at", -1)])
    await db.alerts.create_index("resolved")

    print("✅ Indexes created.")

    # ── Seed cameras ─────────────────────────────────────────────────────────
    cam_count = await db.cameras.count_documents({})
    if cam_count == 0:
        print("Seeding cameras…")
        now = datetime.now(timezone.utc)
        cameras = [
            {"name": "Main Sorter",   "ip": "192.168.1.10", "location": "Zone A", "active": True,  "fps": 30, "created_at": now, "updated_at": now},
            {"name": "Feeder Belt 1", "ip": "192.168.1.11", "location": "Zone B", "active": True,  "fps": 28, "created_at": now, "updated_at": now},
            {"name": "Feeder Belt 2", "ip": "192.168.1.12", "location": "Zone B", "active": False, "fps": 0,  "created_at": now, "updated_at": now},
            {"name": "Manual QA",     "ip": "192.168.1.13", "location": "Zone C", "active": True,  "fps": 24, "created_at": now, "updated_at": now},
        ]
        await db.cameras.insert_many(cameras)
        print(f"  Inserted {len(cameras)} cameras.")
    else:
        print(f"  Skipping cameras ({cam_count} already exist).")

    # ── Seed bins ─────────────────────────────────────────────────────────────
    bin_count = await db.bins.count_documents({})
    if bin_count == 0:
        print("Seeding bins…")
        now = datetime.now(timezone.utc)
        bins = [
            {
                "name": "Main Concourse A", "location": "Zone 1", "zone": "Zone 1",
                "status": "Normal", "fill_percentage": 15.0,
                "counters": {"plastic": 12, "metal": 2, "glass": 1, "paper": 8, "bio_hazard": 0, "unknown": 0},
                "max_item_capacity": 1000,
                "plastic_capacity": 100, "metal_capacity": 50, "glass_capacity": 40,
                "paper_capacity": 80, "bio_hazard_capacity": 30,
                "last_emptied_at": now - timedelta(hours=2),
                "estimated_days_to_full": 5.0,
                "coords": {"x": 20.0, "y": 30.0},
                "createdAt": now, "updatedAt": now,
            },
            {
                "name": "Food Court North", "location": "Zone 2", "zone": "Zone 2",
                "status": "Critical", "fill_percentage": 92.0,
                "counters": {"plastic": 8, "metal": 3, "glass": 2, "paper": 5, "bio_hazard": 27, "unknown": 0},
                "max_item_capacity": 1000,
                "plastic_capacity": 100, "metal_capacity": 50, "glass_capacity": 40,
                "paper_capacity": 80, "bio_hazard_capacity": 30,
                "last_emptied_at": now - timedelta(hours=8),
                "estimated_days_to_full": 0.2,
                "coords": {"x": 70.0, "y": 20.0},
                "createdAt": now, "updatedAt": now,
            },
            {
                "name": "Platform 1", "location": "Zone 3", "zone": "Zone 3",
                "status": "Normal", "fill_percentage": 25.0,
                "counters": {"plastic": 20, "metal": 5, "glass": 0, "paper": 10, "bio_hazard": 0, "unknown": 0},
                "max_item_capacity": 1000,
                "plastic_capacity": 100, "metal_capacity": 50, "glass_capacity": 40,
                "paper_capacity": 80, "bio_hazard_capacity": 30,
                "last_emptied_at": now - timedelta(hours=5),
                "estimated_days_to_full": 3.0,
                "coords": {"x": 15.0, "y": 70.0},
                "createdAt": now, "updatedAt": now,
            },
            {
                "name": "Admin Block", "location": "Zone 4", "zone": "Zone 4",
                "status": "Warning", "fill_percentage": 72.0,
                "counters": {"plastic": 10, "metal": 1, "glass": 0, "paper": 58, "bio_hazard": 0, "unknown": 0},
                "max_item_capacity": 1000,
                "plastic_capacity": 100, "metal_capacity": 50, "glass_capacity": 40,
                "paper_capacity": 80, "bio_hazard_capacity": 30,
                "last_emptied_at": now - timedelta(hours=12),
                "estimated_days_to_full": 1.5,
                "coords": {"x": 80.0, "y": 80.0},
                "createdAt": now, "updatedAt": now,
            },
        ]
        result = await db.bins.insert_many(bins)
        bin_ids = result.inserted_ids
        print(f"  Inserted {len(bins)} bins.")

        # ── Seed detection events ─────────────────────────────────────────────
        print("Seeding detection events…")
        import random
        waste_types = ["Plastic", "Metal", "Glass", "Paper", "Bio-Hazard"]
        events = []
        for i in range(80):
            ts = now - timedelta(hours=random.randint(0, 6), minutes=random.randint(0, 59))
            wt = random.choice(waste_types)
            is_contam = wt == "Bio-Hazard" or (wt == "Plastic" and random.random() < 0.1)
            events.append({
                "bin_id": str(random.choice(bin_ids)),
                "waste_type": wt,
                "confidence": round(random.uniform(0.75, 0.99), 2),
                "is_contamination": is_contam,
                "is_liquid_contamination": is_contam and wt == "Plastic",
                "line_crossed": True,
                "timestamp": ts,
                "frame_index": random.randint(1, 500),
                "estimated_volume_ml": round(random.uniform(50, 800), 1),
                "bounding_box": {
                    "x": round(random.uniform(0.1, 0.7), 2),
                    "y": round(random.uniform(0.1, 0.7), 2),
                    "width": round(random.uniform(0.1, 0.3), 2),
                    "height": round(random.uniform(0.1, 0.3), 2),
                    "confidence": round(random.uniform(0.75, 0.99), 2),
                },
            })
        await db.detection_events.insert_many(events)
        print(f"  Inserted {len(events)} detection events.")

        # ── Seed alerts ───────────────────────────────────────────────────────
        print("Seeding alerts…")
        alerts = [
            {
                "bin_id": str(bin_ids[1]),
                "alert_type": "bin_full",
                "severity": "critical",
                "message": "Bin 'Food Court North' is FULL (92%). Immediate collection required.",
                "resolved": False,
                "created_at": now - timedelta(minutes=5),
            },
            {
                "bin_id": str(bin_ids[3]),
                "alert_type": "bin_warning",
                "severity": "warning",
                "message": "Bin 'Admin Block' is 72% full. Schedule collection soon.",
                "resolved": False,
                "created_at": now - timedelta(minutes=30),
            },
            {
                "alert_type": "contamination",
                "severity": "critical",
                "message": "Liquid contamination detected in plastic bottle — Zone 2.",
                "resolved": False,
                "created_at": now - timedelta(hours=1),
            },
        ]
        await db.alerts.insert_many(alerts)
        print(f"  Inserted {len(alerts)} alerts.")
    else:
        print(f"  Skipping bins/events ({bin_count} bins already exist).")

    client.close()
    print("\n✅ EcoSight database initialized successfully!")
    print(f"   Database: {DB_NAME}")


if __name__ == "__main__":
    asyncio.run(init())
