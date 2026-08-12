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
from app.goals.plan_preview import build_plan_preview
from app.goals.schemas import (
    FocusAreaCreateRequest,
    GoalCreateRequest,
    PlanPreviewRequest,
    PlanPreviewResponse,
)
from app.goals.service import ActiveGoalConflictError, GoalNotFoundError, preview_plan
from app.main import app
from app.memory.models import MemoryRecord
from app.profiles.models import Profile

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


def make_profile(
    *,
    target_role: str = "backend_engineer",
    preferred_stack: list[str] | None = None,
    communication_goal: str = "technical_interviews",
) -> Profile:
    return Profile(
        user_id=USER_ID,
        display_name="Goal User",
        current_level="junior",
        target_role=target_role,
        preferred_stack=preferred_stack or ["Python"],
        communication_goal=communication_goal,
        feedback_preference="balanced",
        onboarding_completed=True,
    )


def make_memory(category: str, content: str, *, status: str = "active") -> MemoryRecord:
    return MemoryRecord(
        user_id=USER_ID,
        category=category,
        content=content,
        importance=5,
        confidence=1.0,
        source_type="manual",
        status=status,
    )


def preview_request(goal_type: str = "interview_preparation") -> PlanPreviewRequest:
    return PlanPreviewRequest.model_validate(
        {
            "title": "Prepare for my next role",
            "description": "Build a consistent practice plan.",
            "goal_type": goal_type,
        }
    )


def nested_keys(value: object) -> set[str]:
    if isinstance(value, dict):
        mapping = cast(dict[str, object], value)
        return set(mapping).union(*(nested_keys(item) for item in mapping.values()))
    if isinstance(value, list):
        items = cast(list[object], value)
        result: set[str] = set()
        for item in items:
            result.update(nested_keys(item))
        return result
    return set()


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


def test_unauthenticated_plan_preview_returns_401() -> None:
    response = cast(
        Response,
        client.post(
            "/api/v1/goals/plan-preview",
            json=preview_request().model_dump(),
        ),
    )

    assert response.status_code == 401


def test_plan_preview_uses_verified_identity_without_ai_dependency(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    preview = build_plan_preview(preview_request(), make_profile(), [])
    service = AsyncMock(return_value=preview)
    monkeypatch.setattr("app.goals.routes.preview_plan", service)

    response = cast(
        Response,
        client.post(
            "/api/v1/goals/plan-preview",
            json=preview_request().model_dump(),
        ),
    )

    assert response.status_code == 200
    assert service.await_args is not None
    assert service.await_args.args[1] == authenticated_client.id
    assert "user_id" not in response.json()
    assert "provider" not in response.json()
    assert "prompt" not in response.json()


@pytest.mark.asyncio
async def test_preview_service_loads_only_owned_profile_and_active_memories(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    profile = make_profile()
    memories = [make_memory("goal", "Owned context")]
    get_profile = AsyncMock(return_value=profile)
    list_memories = AsyncMock(return_value=memories)
    monkeypatch.setattr("app.goals.service.profile_repository.get_profile_by_user_id", get_profile)
    monkeypatch.setattr("app.goals.service.memory_repository.list_owned", list_memories)
    session = cast(AsyncSession, object())

    result = await preview_plan(session, USER_ID, preview_request())

    get_profile.assert_awaited_once_with(session, USER_ID)
    list_memories.assert_awaited_once_with(session, USER_ID)
    assert result.memory_suggestions[0].source == "memory"


@pytest.mark.parametrize(
    "goal_type,expected_mode",
    [
        ("interview_preparation", "interview"),
        ("technical_growth", "mentor"),
        ("communication", "team"),
        ("custom", "mentor"),
    ],
)
def test_each_goal_type_has_a_small_stable_template(goal_type: str, expected_mode: str) -> None:
    preview = build_plan_preview(preview_request(goal_type), make_profile(), [])

    assert len(preview.template_suggestions) == 3
    assert preview.template_suggestions[0].practice_mode == expected_mode
    assert [item.suggested_position for item in preview.template_suggestions] == [0, 1, 2]
    assert all(item.source == "template" for item in preview.template_suggestions)


def test_profile_role_and_known_stack_personalize_interview_preview() -> None:
    preview = build_plan_preview(
        preview_request(),
        make_profile(target_role="cloud_engineer", preferred_stack=["PostgreSQL"]),
        [],
    )
    first = preview.template_suggestions[0]

    assert "database design" in first.title
    assert first.practice_config.model_dump() == {
        "interview_type": "technical",
        "interview_focus": "databases",
    }
    assert "cloud engineering" in (first.description or "")


def test_unknown_stack_falls_back_to_general_backend() -> None:
    preview = build_plan_preview(preview_request(), make_profile(preferred_stack=["Elixir"]), [])

    assert preview.template_suggestions[0].practice_config.model_dump() == {
        "interview_type": "technical",
        "interview_focus": "general_backend",
    }


def test_missing_profile_uses_safe_defaults() -> None:
    preview = build_plan_preview(preview_request(), None, [])

    first = preview.template_suggestions[0]
    assert first.practice_config.model_dump() == {
        "interview_type": "technical",
        "interview_focus": "general_backend",
    }
    assert "your target role" in (first.description or "")


def test_communication_goal_selects_supported_team_scenario() -> None:
    preview = build_plan_preview(
        preview_request("communication"),
        make_profile(communication_goal="group_discussions"),
        [],
    )

    assert preview.template_suggestions[0].practice_config.model_dump() == {
        "team_scenario": "architecture_discussion",
        "team_difficulty": "guided",
    }


def test_memory_suggestions_are_optional_separate_and_bounded() -> None:
    memories = [
        make_memory("goal", "Move toward a backend role"),
        make_memory("skill", "Python debugging"),
        make_memory("weakness", "Explaining database tradeoffs"),
        make_memory("preference", "Short sessions"),
        make_memory("goal", "Archived context", status="archived"),
        make_memory("skill", "Extra context"),
    ]
    preview = build_plan_preview(preview_request(), make_profile(), memories)

    assert len(preview.template_suggestions) == 3
    assert len(preview.memory_suggestions) == 3
    assert len(preview.template_suggestions) + len(preview.memory_suggestions) == 6
    assert [item.suggested_position for item in preview.memory_suggestions] == [3, 4, 5]
    assert all(item.source == "memory" for item in preview.memory_suggestions)
    assert all(
        "Optional suggestion" in (item.description or "") for item in preview.memory_suggestions
    )
    serialized = preview.model_dump()
    assert "Archived context" not in str(serialized)
    assert "Short sessions" not in str(serialized)
    assert nested_keys(serialized).isdisjoint(
        {"id", "user_id", "confidence", "source_type", "source_id"}
    )


def test_plan_preview_is_deterministic_and_configs_reuse_acceptance_contracts() -> None:
    request = preview_request("communication")
    profile = make_profile(communication_goal="workplace_communication")
    memories = [make_memory("weakness", "Concise status updates")]

    first = build_plan_preview(request, profile, memories)
    second = build_plan_preview(request, profile, memories)

    assert first.model_dump() == second.model_dump()
    suggestions = first.template_suggestions + first.memory_suggestions
    assert [item.suggested_position for item in suggestions] == list(range(len(suggestions)))
    adapter = TypeAdapter[FocusAreaCreateRequest](FocusAreaCreateRequest)
    for suggestion in suggestions:
        adapter.validate_python(
            {
                "title": suggestion.title,
                "description": suggestion.description,
                "practice_mode": suggestion.practice_mode,
                "practice_config": suggestion.practice_config.model_dump(),
            }
        )


def test_custom_goal_uses_explicit_title_without_inventing_specialization() -> None:
    preview = build_plan_preview(
        PlanPreviewRequest(
            title="Become more consistent",
            goal_type="custom",
        ),
        make_profile(preferred_stack=["Python"]),
        [],
    )
    serialized = str(preview.model_dump())

    assert "Become more consistent" in serialized
    assert "Python" not in serialized
    assert "API design" not in serialized


def test_plan_preview_rejects_invalid_goal_type_and_unsupported_fields(
    authenticated_client: CurrentUser,
) -> None:
    for extra in (
        {"goal_type": "unsupported"},
        {"user_id": str(uuid4())},
        {"provider": "x"},
        {"model": "x"},
        {"prompt": "x"},
        {"system_role": "x"},
    ):
        payload = preview_request().model_dump()
        payload.update(extra)
        response = cast(Response, client.post("/api/v1/goals/plan-preview", json=payload))
        assert response.status_code == 422


def test_plan_preview_response_contract_caps_suggestions() -> None:
    suggestion = build_plan_preview(preview_request(), make_profile(), []).template_suggestions[0]
    with pytest.raises(ValidationError):
        PlanPreviewResponse(
            template_suggestions=[suggestion] * 7,
            memory_suggestions=[],
        )
    with pytest.raises(ValidationError):
        PlanPreviewResponse(
            template_suggestions=[suggestion] * 4,
            memory_suggestions=[suggestion.model_copy(update={"source": "memory"})] * 3,
        )


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
