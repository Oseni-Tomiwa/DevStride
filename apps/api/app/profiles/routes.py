from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.database.session import get_db_session
from app.profiles.schemas import OnboardingRequest, ProfilePatchRequest, ProfileResponse
from app.profiles.service import (
    DuplicateOnboardingError,
    ProfileNotFoundError,
    create_onboarding_profile,
    get_profile,
    update_profile,
)

router = APIRouter(tags=["profiles", "onboarding"])
Session = Annotated[AsyncSession, Depends(get_db_session)]
AuthenticatedUser = Annotated[CurrentUser, Depends(get_current_user)]


@router.get("/api/v1/profile/me", response_model=ProfileResponse)
async def get_my_profile(session: Session, current_user: AuthenticatedUser) -> ProfileResponse:
    try:
        profile = await get_profile(session, current_user.id)
        return ProfileResponse.model_validate(profile)
    except ProfileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found"
        ) from None


@router.post(
    "/api/v1/onboarding",
    response_model=ProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def complete_onboarding(
    data: OnboardingRequest, session: Session, current_user: AuthenticatedUser
) -> ProfileResponse:
    try:
        profile = await create_onboarding_profile(session, current_user.id, data)
        return ProfileResponse.model_validate(profile)
    except DuplicateOnboardingError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Onboarding has already been completed",
        ) from None


@router.patch("/api/v1/profile/me", response_model=ProfileResponse)
async def patch_my_profile(
    data: ProfilePatchRequest, session: Session, current_user: AuthenticatedUser
) -> ProfileResponse:
    try:
        profile = await update_profile(session, current_user.id, data)
        return ProfileResponse.model_validate(profile)
    except ProfileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found"
        ) from None
