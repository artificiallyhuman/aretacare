from fastapi import APIRouter
from app.api import sessions, documents, medical

api_router = APIRouter()

api_router.include_router(sessions.router)
api_router.include_router(documents.router)
api_router.include_router(medical.router)
