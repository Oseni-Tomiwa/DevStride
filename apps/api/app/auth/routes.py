from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.get("/me", response_model=CurrentUser)
async def get_me(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUser:
    return current_user
