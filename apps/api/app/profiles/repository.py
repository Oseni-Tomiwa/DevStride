from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.profiles.models import Profile


async def create_profile(session: AsyncSession, profile: Profile) -> Profile:
    session.add(profile)
    await session.flush()
    await session.refresh(profile)
    return profile


async def get_profile_by_user_id(session: AsyncSession, user_id: UUID) -> Profile | None:
    result = await session.execute(select(Profile).where(Profile.user_id == user_id))
    return result.scalar_one_or_none()


async def update_profile(
    session: AsyncSession, profile: Profile, updates: dict[str, object]
) -> Profile:
    for field, value in updates.items():
        setattr(profile, field, value)
    await session.flush()
    await session.refresh(profile)
    return profile
