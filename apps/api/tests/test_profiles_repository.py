from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from sqlalchemy import Result, Table, UniqueConstraint
from sqlalchemy.ext.asyncio import AsyncSession

from app.profiles.models import Profile
from app.profiles.repository import create_profile, get_profile_by_user_id


class RecordingSession:
    def __init__(self, result: Profile | None = None) -> None:
        self.added: list[Profile] = []
        self.result = result

    def add(self, instance: Profile) -> None:
        self.added.append(instance)

    async def flush(self) -> None:
        return None

    async def refresh(self, instance: Profile) -> None:
        return None

    async def execute(self, statement: Any) -> Result[tuple[Profile]]:
        del statement
        return cast(Result[tuple[Profile]], FakeResult(self.result))


class FakeResult:
    def __init__(self, profile: Profile | None) -> None:
        self.profile = profile

    def scalar_one_or_none(self) -> Profile | None:
        return self.profile


def make_profile(user_id: UUID) -> Profile:
    return Profile(
        user_id=user_id,
        display_name="Ada",
        current_level="junior",
        target_role="backend engineer",
        preferred_stack=["Python", "PostgreSQL"],
        communication_goal="Explain technical decisions clearly",
        feedback_preference="direct",
        onboarding_completed=False,
    )


@pytest.mark.asyncio
async def test_create_profile_persists_profile_with_session() -> None:
    session = RecordingSession()
    profile = make_profile(uuid4())

    created = await create_profile(cast(AsyncSession, session), profile)

    assert created is profile
    assert session.added == [profile]
    assert profile.onboarding_completed is False


@pytest.mark.asyncio
async def test_get_profile_by_user_id_returns_matching_profile() -> None:
    profile = make_profile(uuid4())
    session = RecordingSession(result=profile)

    retrieved = await get_profile_by_user_id(cast(AsyncSession, session), profile.user_id)

    assert retrieved is profile


def test_user_id_has_unique_database_constraint() -> None:
    table = cast(Table, Profile.__table__)
    constraints = cast(set[UniqueConstraint], table.constraints)
    assert any(constraint.name == "uq_profiles_user_id" for constraint in constraints)
