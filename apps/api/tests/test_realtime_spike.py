from collections.abc import AsyncIterator, Generator
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.conversations.models import Conversation
from app.conversations.service import ConversationNotFoundError
from app.core.config import settings
from app.database.session import get_db_session
from app.main import app

client = TestClient(app)
USER_ID = UUID("12345678-1234-5678-1234-567812345678")


def make_interview(user_id: UUID = USER_ID, mode: str = "interview") -> Conversation:
    return Conversation(
        id=uuid4(),
        user_id=user_id,
        title="Technical interview",
        mode=mode,
        metadata_={"interview_type": "technical", "interview_focus": "apis"},
    )


@pytest.fixture
def authenticated_client() -> Generator[CurrentUser, None, None]:
    async def override_db() -> AsyncIterator[AsyncSession]:
        yield cast(AsyncSession, object())

    current_user = CurrentUser(id=USER_ID, email="ada@example.com")
    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db_session] = override_db
    yield current_user
    app.dependency_overrides.clear()


def spike_payload(**extra: object) -> dict[str, object]:
    return {"sdp_offer": "v=0\no=- test-offer" + "x" * 30, **extra}


def post_spike(conversation_id: UUID, payload: dict[str, object]) -> Response:
    return cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/conversations/{conversation_id}/live-session/spike", json=payload
        ),
    )


def test_live_spike_requires_authentication() -> None:
    response = post_spike(uuid4(), spike_payload())
    assert response.status_code == 401


def test_live_spike_is_disabled_by_default(authenticated_client: CurrentUser) -> None:
    del authenticated_client
    original = settings.live_interview_enabled
    settings.live_interview_enabled = False
    try:
        response = post_spike(uuid4(), spike_payload())
    finally:
        settings.live_interview_enabled = original
    assert response.status_code == 503
    assert response.json()["detail"] == "Live Interview is currently disabled"


def test_live_spike_rejects_malformed_sdp(authenticated_client: CurrentUser) -> None:
    del authenticated_client
    response = post_spike(uuid4(), {"sdp_offer": "not-sdp"})
    assert response.status_code == 422


def test_live_spike_rejects_client_configuration_overrides(
    authenticated_client: CurrentUser,
) -> None:
    del authenticated_client
    response = post_spike(uuid4(), spike_payload(model="client-model", prompt="client prompt"))
    assert response.status_code == 422


def test_live_spike_rejects_unowned_conversation(
    authenticated_client: CurrentUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    del authenticated_client
    monkeypatch.setattr("app.conversations.routes.settings.live_interview_enabled", True)
    monkeypatch.setattr(
        "app.conversations.routes.get_conversation",
        cast(Any, _missing_conversation),
    )
    response = post_spike(uuid4(), spike_payload())
    assert response.status_code == 404


async def _missing_conversation(*args: object, **kwargs: object) -> Conversation:
    del args, kwargs
    raise ConversationNotFoundError


def test_live_spike_rejects_non_interview_conversation(
    authenticated_client: CurrentUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    del authenticated_client
    conversation = make_interview(mode="general")
    monkeypatch.setattr("app.conversations.routes.settings.live_interview_enabled", True)
    monkeypatch.setattr(
        "app.conversations.routes.get_conversation", cast(Any, AsyncMockResult(conversation))
    )
    response = post_spike(conversation.id, spike_payload())
    assert response.status_code == 409


class AsyncMockResult:
    def __init__(self, result: Conversation) -> None:
        self.result = result

    async def __call__(self, *args: object, **kwargs: object) -> Conversation:
        del args, kwargs
        return self.result


def test_live_spike_uses_server_owned_configuration(
    authenticated_client: CurrentUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    del authenticated_client
    conversation = make_interview()
    calls: list[tuple[str, str, str, str]] = []

    async def fake_profile(*args: object, **kwargs: object) -> Any:
        del args, kwargs
        return SimpleNamespace(
            current_level="senior",
            target_role="backend_engineer",
            preferred_stack=["Python"],
            communication_goal="technical_interviews",
            feedback_preference="balanced",
        )

    async def fake_realtime(
        api_key: str, model: str, instructions: str, offer: str
    ) -> tuple[UUID, str]:
        calls.append((api_key, model, instructions, offer))
        return UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), "v=0\no=- answer"

    monkeypatch.setattr("app.conversations.routes.settings.live_interview_enabled", True)
    monkeypatch.setattr("app.conversations.routes.settings.openai_api_key", "server-only-key")
    monkeypatch.setattr(
        "app.conversations.routes.get_conversation", cast(Any, AsyncMockResult(conversation))
    )
    monkeypatch.setattr("app.conversations.routes.get_profile", cast(Any, fake_profile))
    monkeypatch.setattr(
        "app.conversations.routes.create_realtime_session", cast(Any, fake_realtime)
    )

    response = post_spike(conversation.id, spike_payload())

    assert response.status_code == 200
    assert response.json()["status"] == "connected"
    assert calls[0][0] == "server-only-key"
    assert calls[0][1] == settings.live_interview_model
    assert "Type: Technical" in calls[0][2]
    assert "Voice-specific behavior" in calls[0][2]
    assert "server-only-key" not in response.text


def test_live_spike_maps_provider_failure_to_generic_error(
    authenticated_client: CurrentUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    del authenticated_client
    conversation = make_interview()
    monkeypatch.setattr("app.conversations.routes.settings.live_interview_enabled", True)
    monkeypatch.setattr("app.conversations.routes.settings.openai_api_key", "server-only-key")
    monkeypatch.setattr(
        "app.conversations.routes.get_conversation", cast(Any, AsyncMockResult(conversation))
    )
    monkeypatch.setattr("app.conversations.routes.get_profile", cast(Any, _profile))
    monkeypatch.setattr(
        "app.conversations.routes.create_realtime_session", cast(Any, _provider_failure)
    )
    response = post_spike(conversation.id, spike_payload())
    assert response.status_code == 502
    assert response.json()["detail"] == "Live Interview could not be connected"


async def _profile(*args: object, **kwargs: object) -> Any:
    del args, kwargs
    return SimpleNamespace(
        current_level="senior",
        target_role="backend_engineer",
        preferred_stack=["Python"],
        communication_goal="technical_interviews",
        feedback_preference="balanced",
    )


async def _provider_failure(*args: object, **kwargs: object) -> object:
    del args, kwargs
    from app.ai.realtime import RealtimeInitializationError

    raise RealtimeInitializationError
