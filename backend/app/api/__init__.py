from fastapi import APIRouter
from app.api import auth, sessions, documents, medical, journal, conversation, tools, audio_recording, daily_plans

api_router = APIRouter()

# Authentication
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# Session management
api_router.include_router(sessions.router)

# Document management
api_router.include_router(documents.router)

# Audio recordings
api_router.include_router(audio_recording.router)

# Journal (new)
api_router.include_router(journal.router)

# Conversation (new - replaces medical chat)
api_router.include_router(conversation.router)

# Daily Plans
api_router.include_router(daily_plans.router, prefix="/daily-plans", tags=["daily-plans"])

# Tools (new - standalone tools)
api_router.include_router(tools.router)

# Medical (legacy - keep for backwards compatibility during transition)
api_router.include_router(medical.router)
