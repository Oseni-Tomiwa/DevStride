from collections.abc import AsyncIterator, Generator
from datetime import UTC, datetime
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.database.session import get_db_session
from app.goals.models import Goal, GoalFocusArea
from app.goals.schemas import FocusAreaCreateRequest, GoalCreateRequest
from app.goals.service import ActiveGoalConflictError, GoalNotFoundError
from app.main import app

client = TestClient(app)
USER_ID = UUID("12345678-1234-5678-1234-567812345678")


def goal_payload() -> dict[str, object]:
    return {
        "title": "Prepare for backend interviews",
        "description": "Build consistent interview practice.",
        "goal_type": "interview_preparation",
        "focus_areas": [
            {
                "title": "API design",
                "practice_mode": "interview",
                "practice_config": {
                    "interview_type": "technical",
                    "interview_focus": "apis",
                },
            }
        ],
    }


def make_goal(user_id: UUID = USER_ID) -> Goal:
    now = datetime.now(UTC)
    goal = Goal(
        id=uuid4(),
        user_id=user_id,
        title="Prepare for backend interviews",
        goal_type="interview_preparation",
        status="active",
    )
    goal.created_at = now
    goal.updated_at = now
    focus = GoalFocusArea(
        id=uuid4(),
        goal_id=goal.id,
        title="API design",
        practice_mode="interview",
        practice_config={"interview_type": "technical", "interview_focus": "apis"},
        position=0,
        status="active",
    )
    focus.created_at = now
    focus.updated_at = now
    goal.focus_areas = [focus]
    return goal


@pytest.fixture
def authenticated_client() -> Generator[CurrentUser, None, None]:
    current_user = CurrentUser(id=USER_ID, email="goals@example.com")

    async def override_db() -> AsyncIterator[AsyncSession]:
        yield cast(AsyncSession, object())

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db_session] = override_db
    yield current_user
    app.dependency_overrides.clear()


def test_unauthenticated_goals_access_returns_401() -> None:
    response = cast(Response, client.get("/api/v1/goals"))

    assert response.status_code == 401


def test_create_goal_uses_verified_identity(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    goal = make_goal(authenticated_client.id)
    create = AsyncMock(return_value=goal)
    monkeypatch.setattr("app.goals.routes.create_goal", create)

    response = cast(Response, client.post("/api/v1/goals", json=goal_payload()))

    assert response.status_code == 201
    assert "user_id" not in response.json()
    assert create.await_args is not None
    assert create.await_args.args[1] == authenticated_client.id


def test_second_active_goal_maps_to_409(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "app.goals.routes.create_goal", AsyncMock(side_effect=ActiveGoalConflictError)
    )

    response = cast(Response, client.post("/api/v1/goals", json=goal_payload()))

    assert response.status_code == 409


def test_cross_user_lookup_uses_ownership_safe_404(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    get = AsyncMock(side_effect=GoalNotFoundError)
    monkeypatch.setattr("app.goals.routes.get_goal", get)
    goal_id = uuid4()

    response = cast(Response, client.get(f"/api/v1/goals/{goal_id}"))

    assert response.status_code == 404
    assert get.await_args is not None
    assert get.await_args.args[1] == authenticated_client.id


@pytest.mark.parametrize(
    "focus",
    [
        {"title": "Mentor", "practice_mode": "mentor", "practice_config": {}},
        {
            "title": "Interview",
            "practice_mode": "interview",
            "practice_config": {"interview_type": "technical", "interview_focus": "apis"},
        },
        {
            "title": "Team",
            "practice_mode": "team",
            "practice_config": {
                "team_scenario": "code_review",
                "team_difficulty": "guided",
            },
        },
    ],
)
def test_supported_practice_configs_validate(focus: dict[str, object]) -> None:
    parsed = TypeAdapter[FocusAreaCreateRequest](FocusAreaCreateRequest).validate_python(focus)

    assert parsed.practice_mode in {"mentor", "interview", "team"}


@pytest.mark.parametrize(
    "focus",
    [
        {"title": "Bad mode", "practice_mode": "general", "practice_config": {}},
        {
            "title": "Mentor override",
            "practice_mode": "mentor",
            "practice_config": {"model": "override"},
        },
        {
            "title": "Behavioral mismatch",
            "practice_mode": "interview",
            "practice_config": {"interview_type": "behavioral", "interview_focus": "apis"},
        },
        {
            "title": "Team missing difficulty",
            "practice_mode": "team",
            "practice_config": {"team_scenario": "code_review"},
        },
    ],
)
def test_invalid_practice_configs_are_rejected(focus: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        TypeAdapter[FocusAreaCreateRequest](FocusAreaCreateRequest).validate_python(focus)


def test_goal_requires_one_to_six_focus_areas() -> None:
    payload = goal_payload()
    payload["focus_areas"] = []
    with pytest.raises(ValidationError):
        GoalCreateRequest.model_validate(payload)

    payload["focus_areas"] = [goal_payload()["focus_areas"][0]] * 7  # type: ignore[index]
    with pytest.raises(ValidationError):
        GoalCreateRequest.model_validate(payload)


def test_position_and_ownership_fields_are_not_accepted() -> None:
    payload = goal_payload()
    payload["user_id"] = str(uuid4())

    with pytest.raises(ValidationError):
        GoalCreateRequest.model_validate(payload)

    with pytest.raises(ValidationError):
        TypeAdapter[FocusAreaCreateRequest](FocusAreaCreateRequest).validate_python(
            {
                "title": "Injected position",
                "practice_mode": "mentor",
                "practice_config": {},
                "position": -1,
            }
        )


# pyright: reportUnknownMemberType=false
