from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.conversations.models import Conversation
from app.database.session import get_db_session
from app.main import app
from app.progress import repository
from app.progress import routes as progress_routes
from app.progress.service import get_progress_summary

client = TestClient(app)
USER_ID = uuid4()


@pytest.mark.asyncio
async def test_progress_summary_counts_modes_and_preserves_interview_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime.now(UTC)
    completed = Conversation(
        id=uuid4(),
        user_id=USER_ID,
        title="Technical interview",
        mode="interview",
        metadata_={
            "interview_type": "technical",
            "interview_focus": "databases",
            "interview_started": True,
            "interview_completed": True,
            "final_assessment_message_id": str(uuid4()),
        },
    )
    completed.updated_at = now
    mentor = Conversation(
        id=uuid4(), user_id=USER_ID, title="Mentor session", mode="mentor", metadata_={}
    )
    mentor.updated_at = now - timedelta(minutes=1)
    general = Conversation(
        id=uuid4(), user_id=USER_ID, title="New conversation", mode="general", metadata_={}
    )
    general.updated_at = now - timedelta(minutes=2)

    async def fake_rows(
        session: AsyncSession, user_id: Any
    ) -> list[tuple[Conversation, int, str | None, bool]]:
        del session, user_id
        return [(completed, 4, None, True), (mentor, 2, None, False), (general, 0, None, False)]

    monkeypatch.setattr(repository, "get_progress_rows", fake_rows)

    summary = await get_progress_summary(cast(AsyncSession, object()), USER_ID)

    assert summary.total_sessions == 3
    assert summary.mentor_sessions == 1
    assert summary.interview_sessions == 1
    assert summary.general_sessions == 1
    assert [item.id for item in summary.recent_sessions] == [completed.id, mentor.id, general.id]
    assert summary.recent_sessions[0].title == "Technical Interview — Databases"
    assert summary.recent_sessions[0].has_final_assessment is True
    assert summary.recent_sessions[0].interview_completed is True
    assert summary.recent_sessions[0].summary_available is True
    assert summary.recent_sessions[2].has_messages is False


def test_progress_requires_authentication() -> None:
    response = cast(Response, client.get("/api/v1/progress"))  # pyright: ignore[reportUnknownMemberType]
    assert response.status_code == 401


def test_progress_is_scoped_to_authenticated_user() -> None:
    current_user = CurrentUser(id=USER_ID, email="user@example.com")

    async def override_db() -> AsyncIterator[AsyncSession]:
        yield cast(AsyncSession, object())

    async def fake_summary(session: AsyncSession, user_id: Any) -> dict[str, object]:
        del session
        assert user_id == current_user.id
        return {
            "total_sessions": 0,
            "mentor_sessions": 0,
            "interview_sessions": 0,
            "general_sessions": 0,
            "recent_sessions": [],
        }

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db_session] = override_db
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(progress_routes, "get_progress_summary", fake_summary)
    try:
        response = cast(Response, client.get("/api/v1/progress"))  # pyright: ignore[reportUnknownMemberType]
    finally:
        app.dependency_overrides.clear()
        monkeypatch.undo()

    assert response.status_code == 200
    assert response.json()["total_sessions"] == 0
