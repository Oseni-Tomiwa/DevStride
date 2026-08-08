from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.profiles import repository
from app.profiles.models import Profile
from app.profiles.schemas import OnboardingRequest, ProfilePatchRequest


class ProfileNotFoundError(Exception):
    pass


class DuplicateOnboardingError(Exception):
    pass


async def get_profile(session: AsyncSession, user_id: UUID) -> Profile:
    profile = await repository.get_profile_by_user_id(session, user_id)
    if profile is None:
        raise ProfileNotFoundError
    return profile


async def create_onboarding_profile(
    session: AsyncSession, user_id: UUID, data: OnboardingRequest
) -> Profile:
    existing = await repository.get_profile_by_user_id(session, user_id)
    if existing is not None:
        raise DuplicateOnboardingError

    profile = Profile(
        user_id=user_id,
        onboarding_completed=True,
        **data.model_dump(mode="json"),
    )
    try:
        await repository.create_profile(session, profile)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise DuplicateOnboardingError from exc
    return profile


async def update_profile(
    session: AsyncSession, user_id: UUID, data: ProfilePatchRequest
) -> Profile:
    profile = await get_profile(session, user_id)
    updates = data.model_dump(exclude_unset=True, mode="json")
    await repository.update_profile(session, profile, updates)
    await session.commit()
    return profile
