import asyncio
from typing import Literal, TypedDict

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from app.database.session import engine

router = APIRouter(tags=["health"])


class HealthResponse(TypedDict):
    status: Literal["ok"]
    service: str


class ReadinessResponse(TypedDict):
    status: Literal["ready"]
    service: str


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return {"status": "ok", "service": "devstride-api"}


@router.get("/ready", response_model=ReadinessResponse)
async def readiness() -> ReadinessResponse:
    try:
        async with asyncio.timeout(2):
            async with engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service is not ready",
        ) from None
    return {"status": "ready", "service": "devstride-api"}
