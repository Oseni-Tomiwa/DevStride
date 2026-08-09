from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.auth.routes import router as auth_router
from app.conversations.routes import router as conversations_router
from app.core.config import settings
from app.profiles.routes import router as profiles_router

app = FastAPI(
    title="DevStride API",
    version="0.1.0",
    debug=settings.app_env == "development",
)

cors_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(conversations_router)
app.include_router(profiles_router)
