from typing import Literal, TypedDict

from fastapi import APIRouter

router = APIRouter(tags=["health"])


class HealthResponse(TypedDict):
    status: Literal["ok"]
    service: str


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return {"status": "ok", "service": "devstride-api"}
