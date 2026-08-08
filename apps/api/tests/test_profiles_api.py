from collections.abc import AsyncIterator, Generator, Mapping
from datetime import UTC, datetime
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.database.session import get_db_session
from app.main import app
from app.profiles.models import Profile
from app.profiles.service import DuplicateOnboardingError, ProfileNotFoundError

client = TestClient(app)
USER_ID = UUID("12345678-1234-5678-1234-567812345678")


def make_profile(user_id: UUID = USER_ID) -> Profile:
    now = datetime.now(UTC)
    profile = Profile(
        id=uuid4(),
        user_id=user_id,
        display_name="Ada",
        current_level="junior",
        target_role="backend_engineer",
        preferred_stack=["Python", "PostgreSQL"],
        communication_goal="technical_interviews",
        feedback_preference="direct",
        onboarding_completed=True,
    )
    profile.created_at = now
    profile.updated_at = now
    return profile


@pytest.fixture
def authenticated_client() -> Generator[tuple[TestClient, CurrentUser], None, None]:
    current_user = CurrentUser(id=USER_ID, email="ada@example.com")

    async def override_db() -> AsyncIterator[AsyncSession]:
        yield cast(AsyncSession, object())

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db_session] = override_db
    yield client, current_user
    app.dependency_overrides.clear()


def get_profile_request() -> Response:
    return cast(Response, client.get("/api/v1/profile/me"))  # pyright: ignore[reportUnknownMemberType]


def post_onboarding(payload: Mapping[str, object]) -> Response:
    return cast(
        Response,
        client.post("/api/v1/onboarding", json=payload),  # pyright: ignore[reportUnknownMemberType]
    )


def patch_profile(payload: Mapping[str, object]) -> Response:
    return cast(
        Response,
        client.patch("/api/v1/profile/me", json=payload),  # pyright: ignore[reportUnknownMemberType]
    )


def test_unauthenticated_profile_get_returns_401() -> None:
    response = get_profile_request()

    assert response.status_code == 401


def test_profile_missing_returns_404(
    authenticated_client: tuple[TestClient, CurrentUser], monkeypatch: pytest.MonkeyPatch
) -> None:
    _, current_user = authenticated_client
    get_profile = AsyncMock(side_effect=ProfileNotFoundError)
    monkeypatch.setattr("app.profiles.routes.get_profile", get_profile)

    response = get_profile_request()

    assert response.status_code == 404
    assert get_profile.await_args is not None
    assert get_profile.await_args.args[1] == current_user.id


def test_authenticated_get_uses_verified_user_id(
    authenticated_client: tuple[TestClient, CurrentUser], monkeypatch: pytest.MonkeyPatch
) -> None:
    _, current_user = authenticated_client
    profile = make_profile(current_user.id)
    get_profile = AsyncMock(return_value=profile)
    monkeypatch.setattr("app.profiles.routes.get_profile", get_profile)

    response = get_profile_request()

    assert response.status_code == 200
    assert response.json()["user_id"] == str(current_user.id)
    assert get_profile.await_args is not None
    assert get_profile.await_args.args[1] == current_user.id


def test_onboarding_creates_profile_for_verified_user(
    authenticated_client: tuple[TestClient, CurrentUser], monkeypatch: pytest.MonkeyPatch
) -> None:
    _, current_user = authenticated_client
    profile = make_profile(current_user.id)
    create_profile = AsyncMock(return_value=profile)
    monkeypatch.setattr("app.profiles.routes.create_onboarding_profile", create_profile)
    payload = {
        "display_name": "Ada",
        "current_level": "junior",
        "target_role": "backend_engineer",
        "preferred_stack": ["Python"],
        "communication_goal": "technical_interviews",
        "feedback_preference": "direct",
    }

    response = post_onboarding(payload)

    assert response.status_code == 201
    assert create_profile.await_args is not None
    assert create_profile.await_args.args[1] == current_user.id
    assert create_profile.await_args.args[2].display_name == "Ada"


def test_onboarding_rejects_user_id_in_body(
    authenticated_client: tuple[TestClient, CurrentUser],
) -> None:
    payload = {
        "user_id": str(uuid4()),
        "display_name": "Ada",
        "current_level": "junior",
        "target_role": "backend_engineer",
        "preferred_stack": ["Python"],
        "communication_goal": "technical_interviews",
        "feedback_preference": "direct",
    }

    response = post_onboarding(payload)

    assert response.status_code == 422


def test_duplicate_onboarding_returns_409(
    authenticated_client: tuple[TestClient, CurrentUser], monkeypatch: pytest.MonkeyPatch
) -> None:
    create_profile = AsyncMock(side_effect=DuplicateOnboardingError)
    monkeypatch.setattr("app.profiles.routes.create_onboarding_profile", create_profile)
    payload = {
        "display_name": "Ada",
        "current_level": "junior",
        "target_role": "backend_engineer",
        "preferred_stack": ["Python"],
        "communication_goal": "technical_interviews",
        "feedback_preference": "direct",
    }

    response = post_onboarding(payload)

    assert response.status_code == 409


def test_invalid_enum_and_blank_stack_are_rejected(
    authenticated_client: tuple[TestClient, CurrentUser],
) -> None:
    payload = {
        "display_name": "Ada",
        "current_level": "expert",
        "target_role": "backend_engineer",
        "preferred_stack": ["Python", "  "],
        "communication_goal": "technical_interviews",
        "feedback_preference": "direct",
    }

    response = post_onboarding(payload)

    assert response.status_code == 422


def test_patch_updates_only_explicit_allowed_fields(
    authenticated_client: tuple[TestClient, CurrentUser], monkeypatch: pytest.MonkeyPatch
) -> None:
    _, current_user = authenticated_client
    profile = make_profile(current_user.id)
    update_profile = AsyncMock(return_value=profile)
    monkeypatch.setattr("app.profiles.routes.update_profile", update_profile)

    response = patch_profile({"display_name": "Grace"})

    assert response.status_code == 200
    assert update_profile.await_args is not None
    assert update_profile.await_args.args[1] == current_user.id
    assert update_profile.await_args.args[2].model_dump(exclude_unset=True) == {
        "display_name": "Grace"
    }


def test_patch_cannot_modify_ownership(
    authenticated_client: tuple[TestClient, CurrentUser],
) -> None:
    response = patch_profile({"user_id": str(uuid4()), "display_name": "Grace"})

    assert response.status_code == 422


def test_patch_missing_profile_returns_404(
    authenticated_client: tuple[TestClient, CurrentUser], monkeypatch: pytest.MonkeyPatch
) -> None:
    update_profile = AsyncMock(side_effect=ProfileNotFoundError)
    monkeypatch.setattr("app.profiles.routes.update_profile", update_profile)

    response = patch_profile({"display_name": "Grace"})

    assert response.status_code == 404
