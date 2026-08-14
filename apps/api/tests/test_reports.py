from collections.abc import AsyncIterator, Generator
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.conversations import routes
from app.conversations.models import Conversation
from app.conversations.report import (
    PracticeReport,
    PracticeReportNotFoundError,
    ReportFocusContext,
    ReportGoalContext,
)
from app.conversations.report_schemas import PracticeReportResponse
from app.database.session import get_db_session
from app.main import app
from app.progress.schemas import ProgressRecommendationResponse, RecommendationActionResponse
from app.session_summaries.schemas import SessionSummaryResponse


def _summary(conversation_id: UUID) -> SessionSummaryResponse:
    now = datetime.now(UTC)
    return SessionSummaryResponse(
        id=uuid4(),
        conversation_id=conversation_id,
        session_mode="interview",
        summary="A grounded interview report.",
        topics_covered=["API design"],
        strengths=["Clear trade-offs"],
        weaknesses=["Explain failure handling"],
        recommended_next_steps=["Practice failure handling"],
        concepts_practiced=None,
        exercises_completed=None,
        correctness_rating=4,
        clarity_rating=3,
        depth_rating=3,
        reasoning_rating=4,
        created_at=now,
        updated_at=now,
    )


def _recommendation():
    return ProgressRecommendationResponse(
        activity="mentor",
        title="Reinforce failure handling",
        reason="Recent Interview evidence shows this area needs reinforcement.",
        evidence=["Observed in linked practice."],
        action=RecommendationActionResponse(
            kind="start_practice",
            mode="mentor",
            goal_id=None,
            focus_area_id=None,
        ),
    )


@pytest.fixture
def authenticated_client() -> Generator[tuple[Any, UUID], None, None]:
    user_id = uuid4()
    current_user = CurrentUser(id=user_id, email="user@example.com")

    async def override_db() -> AsyncIterator[object]:
        yield object()

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db_session] = override_db
    yield TestClient(app), user_id
    app.dependency_overrides.clear()


def test_report_endpoint_returns_safe_composed_report(
    authenticated_client: tuple[Any, UUID], monkeypatch: MonkeyPatch
) -> None:
    client, user_id = authenticated_client
    conversation = Conversation(
        id=uuid4(),
        user_id=user_id,
        title="Interview",
        mode="interview",
        metadata_={"interview_transport": "text"},
    )
    report = PracticeReport(
        conversation=conversation,
        summary=_summary(conversation.id),
        analytics=None,
        goal=ReportGoalContext(title="Backend readiness", status="active"),
        focus=ReportFocusContext(title="API design", status="active"),
        evidence_status="available",
        recommendation=_recommendation(),
        completed_at=datetime.now(UTC),
    )
    get_report = AsyncMock(return_value=report)
    monkeypatch.setattr(routes, "get_practice_report", get_report)

    response: Any = client.get(f"/api/v1/conversations/{conversation.id}/report")

    assert response.status_code == 200
    body: Any = response.json()
    assert body["mode"] == "interview"
    assert body["summary"]["strengths"] == ["Clear trade-offs"]
    assert body["goal"] == {"title": "Backend readiness", "status": "active"}
    assert body["focus"] == {"title": "API design", "status": "active"}
    assert body["recommendation"]["reason"] == _recommendation().reason
    get_report.assert_awaited_once()


def test_report_endpoint_returns_not_found_for_unowned_or_inapplicable_report(
    authenticated_client: tuple[Any, UUID], monkeypatch: MonkeyPatch
) -> None:
    client, _user_id = authenticated_client
    monkeypatch.setattr(
        routes,
        "get_practice_report",
        AsyncMock(side_effect=PracticeReportNotFoundError),
    )

    response: Any = client.get(f"/api/v1/conversations/{uuid4()}/report")

    assert response.status_code == 404
    assert "report" in response.json()["detail"].lower()


def test_report_response_contract_does_not_include_ownership_or_provider_fields():
    fields = PracticeReportResponse.model_fields
    assert "user_id" not in fields
    assert "provider" not in fields
    assert "prompt" not in fields
