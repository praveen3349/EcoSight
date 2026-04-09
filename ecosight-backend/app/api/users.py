from fastapi import APIRouter, HTTPException, BackgroundTasks
import requests
from app.core.config import get_settings
from pydantic import BaseModel
import logging

router = APIRouter(prefix="/users", tags=["users"])
logger = logging.getLogger(__name__)

class UserCreate(BaseModel):
    email: str
    password: str
    first_name: str = ""
    last_name: str = ""
    role: str = "user"

@router.get("/")
def list_users():
    settings = get_settings()
    if not settings.clerk_secret_key:
        return []
    
    url = "https://api.clerk.com/v1/users?limit=50"
    headers = {
        "Authorization": f"Bearer {settings.clerk_secret_key}",
        "Content-Type": "application/json"
    }
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        logger.error(f"Failed to fetch users: {response.text}")
        raise HTTPException(status_code=response.status_code, detail="Failed to fetch users from Clerk")
    
    data = response.json()
    users = []
    for u in data:
        email = u.get("email_addresses", [{}])[0].get("email_address", "")
        role = u.get("public_metadata", {}).get("role", "user")
        users.append({
            "id": u["id"],
            "first_name": u.get("first_name", ""),
            "last_name": u.get("last_name", ""),
            "email": email,
            "role": role,
            "created_at": u.get("created_at")
        })
    return users

@router.post("/")
def create_user(user: UserCreate):
    settings = get_settings()
    if not settings.clerk_secret_key:
        raise HTTPException(status_code=500, detail="Clerk Secret Key not configured")

    url = "https://api.clerk.com/v1/users"
    headers = {
        "Authorization": f"Bearer {settings.clerk_secret_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "email_address": [user.email],
        "password": user.password,
        "username": user.email.split("@")[0],
        "first_name": user.first_name,
        "last_name": user.last_name,
        "public_metadata": {"role": user.role}
    }
    response = requests.post(url, headers=headers, json=payload)
    if response.status_code != 200:
        logger.error(f"Failed to create user: {response.text}")
        raise HTTPException(status_code=response.status_code, detail=f"Clerk Error: {response.text}")
    return response.json()

@router.delete("/{user_id}")
def delete_user(user_id: str):
    settings = get_settings()
    if not settings.clerk_secret_key:
        raise HTTPException(status_code=500, detail="Clerk Secret Key not configured")

    url = f"https://api.clerk.com/v1/users/{user_id}"
    headers = {
        "Authorization": f"Bearer {settings.clerk_secret_key}",
        "Content-Type": "application/json"
    }
    response = requests.delete(url, headers=headers)
    if response.status_code != 200:
        logger.error(f"Failed to delete user: {response.text}")
        raise HTTPException(status_code=response.status_code, detail="Failed to delete user from Clerk")
    return {"success": True}
