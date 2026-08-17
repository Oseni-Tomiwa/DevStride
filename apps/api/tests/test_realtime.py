import json
from collections.abc import AsyncIterator, Generator
from email import policy
from email.parser import BytesParser
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.rate_limit import get_ai_rate_limiter
from app.ai.realtime import RealtimeInitializationError, create_realtime_call
from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.conversations.models import Conversation
from app.conversations.service import ConversationNotFoundError
from app.core.config import settings
from app.database.session import get_db_session
from app.goals.context import GoalContext
from app.main import app

client = TestClient(app)
USER_ID = UUID("12345678-1234-5678-1234-567812345678")
SDP_OFFER = (
    "v=0\r\n"
    "o=- 46117327 2 IN IP4 127.0.0.1\r\n"
    "s=-\r\n"
    "t=0 0\r\n"
    "a=group:BUNDLE 0 1\r\n"
    "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
    "c=IN IP4 0.0.0.0\r\n"
    "a=mid:0\r\n"
    "a=sendrecv\r\n"
)


@pytest.fixture(autouse=True)
def reset_realtime_limits() -> Generator[None, None, None]:
    get_ai_rate_limiter().clear()
    yield
    get_ai_rate_limiter().clear()


def make_interview(user_id: UUID = USER_ID, mode: str = "interview") -> Conversation:
    return Conversation(
        id=uuid4(),
        user_id=user_id,
        title="Interview",
        mode=mode,
        metadata_={
            "interview_type": "technical",
            "interview_focus": "apis",
            "interview_transport": "live_voice",
        },
    )


def make_mentor(user_id: UUID = USER_ID, transport: str = "live_voice") -> Conversation:
    return Conversation(
        id=uuid4(),
        user_id=user_id,
        title="Mentor session",
        mode="mentor",
        metadata_={"mentor_transport": transport},
    )


@pytest.fixture
def authenticated_client() -> Generator[CurrentUser, None, None]:
    async def override_db() -> AsyncIterator[AsyncSession]:
        yield cast(AsyncSession, SimpleNamespace(commit=AsyncMock()))

    user = CurrentUser(id=USER_ID, email="voice@example.com")
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db_session] = override_db
    yield user
    app.dependency_overrides.clear()


def post_session(payload: dict[str, object]) -> Response:
    return cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/realtime/sessions", json=payload
        ),
    )


def test_realtime_session_requires_authentication() -> None:
    response = post_session({"conversation_id": str(uuid4())})
    assert response.status_code == 401


def test_realtime_session_rejects_invalid_conversation_id(
    authenticated_client: CurrentUser,
) -> None:
    del authenticated_client
    response = post_session({"conversation_id": "not-a-uuid"})
    assert response.status_code == 422


def test_realtime_session_is_disabled_safely(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    original = settings.live_interview_enabled
    settings.live_interview_enabled = False
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(make_interview()))
    try:
        response = post_session({"conversation_id": str(uuid4())})
    finally:
        settings.live_interview_enabled = original
    assert response.status_code == 503


@pytest.mark.parametrize("field", ["user_id", "provider", "model", "prompt", "sdp_offer"])
def test_realtime_request_rejects_client_owned_configuration(
    field: str, authenticated_client: CurrentUser
) -> None:
    del authenticated_client
    response = post_session({"conversation_id": str(uuid4()), field: "override"})
    assert response.status_code == 422


def test_realtime_session_rejects_unowned_conversation(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    monkeypatch.setattr("app.realtime.routes.settings.live_interview_enabled", True)

    async def missing(*args: object, **kwargs: object) -> Conversation:
        del args, kwargs
        raise ConversationNotFoundError

    monkeypatch.setattr("app.realtime.routes.get_conversation", missing)
    response = post_session({"conversation_id": str(uuid4())})
    assert response.status_code == 404


def test_realtime_session_rejects_non_interview_mode(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_interview(mode="general")
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    monkeypatch.setattr("app.realtime.routes.settings.live_interview_enabled", False)
    response = post_session({"conversation_id": str(conversation.id)})
    assert response.status_code == 400


def test_realtime_session_rejects_text_interview(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_interview()
    conversation.metadata_["interview_transport"] = "text"
    monkeypatch.setattr("app.realtime.routes.settings.live_interview_enabled", True)
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    response = post_session({"conversation_id": str(conversation.id)})
    assert response.status_code == 409


def test_video_interview_requires_its_feature_flag(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_interview()
    conversation.metadata_["interview_transport"] = "video"
    monkeypatch.setattr("app.realtime.routes.settings.live_interview_enabled", True)
    monkeypatch.setattr("app.realtime.routes.settings.video_interview_enabled", False)
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    response = post_session({"conversation_id": str(conversation.id)})
    assert response.status_code == 503


def test_realtime_session_rejects_completed_interview(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_interview()
    conversation.metadata_["interview_completed"] = True
    monkeypatch.setattr("app.realtime.routes.settings.live_interview_enabled", True)
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    response = post_session({"conversation_id": str(conversation.id)})
    assert response.status_code == 409


def test_realtime_session_rejects_unavailable_goal_focus(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_interview()
    conversation.focus_area_id = uuid4()
    monkeypatch.setattr("app.realtime.routes.settings.live_interview_enabled", True)
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))

    async def missing_focus(*args: object, **kwargs: object) -> None:
        del args, kwargs
        return None

    monkeypatch.setattr("app.realtime.routes.get_focus_by_id_owned", missing_focus)
    response = post_session({"conversation_id": str(conversation.id)})
    assert response.status_code == 409


def test_realtime_session_returns_only_short_lived_client_secret(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_interview()
    monkeypatch.setattr("app.realtime.routes.settings.live_interview_enabled", True)
    monkeypatch.setattr("app.realtime.routes.settings.openai_api_key", "server-only-key")
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    monkeypatch.setattr("app.realtime.routes.get_profile", _profile)
    calls: list[tuple[str, str, str]] = []

    async def fake_secret(api_key: str, model: str, instructions: str) -> tuple[str, int | None]:
        calls.append((api_key, model, instructions))
        return "ek_temporary", 123

    monkeypatch.setattr("app.realtime.routes.create_realtime_client_secret", fake_secret)
    response = post_session({"conversation_id": str(conversation.id)})
    assert response.status_code == 200
    assert response.json() == {
        "client_secret": "ek_temporary",
        "expires_at": 123,
        "model": settings.live_interview_model,
    }
    assert calls[0][0] == "server-only-key"
    assert "Type: Technical" in calls[0][2]
    assert "server-only-key" not in response.text


def test_live_mentor_bootstrap_uses_mentor_instructions(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_mentor()
    monkeypatch.setattr("app.realtime.routes.settings.live_mentor_enabled", True)
    monkeypatch.setattr("app.realtime.routes.settings.openai_api_key", "server-only-key")
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    monkeypatch.setattr("app.realtime.routes.get_profile", _profile)
    calls: list[str] = []

    async def fake_secret(api_key: str, model: str, instructions: str) -> tuple[str, int | None]:
        assert api_key == "server-only-key"
        calls.append(instructions)
        return "ek_temporary", 123

    monkeypatch.setattr("app.realtime.routes.create_realtime_client_secret", fake_secret)
    response = post_session({"conversation_id": str(conversation.id)})
    assert response.status_code == 200
    assert response.json()["model"] == settings.live_mentor_model
    assert "Live Mentor voice behavior" in calls[0]
    assert "You are a professional DevStride software-engineering interviewer." not in calls[0]


def test_live_mentor_text_transport_is_rejected(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_mentor(transport="text")
    monkeypatch.setattr("app.realtime.routes.settings.live_mentor_enabled", True)
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    response = post_session({"conversation_id": str(conversation.id)})
    assert response.status_code == 409


def test_realtime_connect_negotiates_sdp_server_side(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_interview()
    conversation.focus_area_id = uuid4()
    monkeypatch.setattr("app.realtime.routes.settings.live_interview_enabled", True)
    monkeypatch.setattr("app.realtime.routes.settings.openai_api_key", "server-only-key")
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    monkeypatch.setattr(
        "app.realtime.routes.get_focus_by_id_owned",
        _returning(SimpleNamespace(status="active")),
    )
    monkeypatch.setattr(
        "app.realtime.routes.resolve_conversation_goal_context",
        _returning(
            GoalContext(
                goal_title="Improve API design",
                goal_description="Build stronger backend explanations.",
                focus_title="Explain trade-offs",
                focus_description="Practice concise technical reasoning.",
            )
        ),
    )
    monkeypatch.setattr("app.realtime.routes.get_profile", _profile)
    captured: list[tuple[str, str, str, str]] = []

    async def fake_call(api_key: str, offer: str, model: str, instructions: str) -> bytes:
        captured.append((api_key, offer, model, instructions))
        return (
            b"v=0\r\no=- answer\r\na=ice-ufrag:abc123\r\na=ice-pwd:def456\r\n"
            b"a=fingerprint:sha-256 AA:BB:CC\r\na=setup:active\r\n"
        )

    monkeypatch.setattr("app.realtime.routes.create_realtime_call", fake_call)
    response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/realtime/sessions/{conversation.id}/connect",
            content=SDP_OFFER,
            headers={"Content-Type": "application/sdp"},
        ),
    )
    assert response.status_code == 201
    expected_answer = (
        b"v=0\r\no=- answer\r\na=ice-ufrag:abc123\r\na=ice-pwd:def456\r\n"
        b"a=fingerprint:sha-256 AA:BB:CC\r\na=setup:active\r\n"
    )
    assert response.content == expected_answer
    assert b"a=ice-pwd:" in response.content
    assert b"a=ice-pwd\\:" not in response.content
    assert response.headers["content-type"].startswith("application/sdp")
    assert captured[0][0] == "server-only-key"
    assert captured[0][1] == SDP_OFFER
    assert "ask the first interview question immediately" in captured[0][3]
    assert "Improve API design" in captured[0][3]
    assert "server-only-key" not in response.text


def test_live_mentor_connect_marks_kickoff_started(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_mentor()
    conversation.focus_area_id = uuid4()
    monkeypatch.setattr("app.realtime.routes.settings.live_mentor_enabled", True)
    monkeypatch.setattr("app.realtime.routes.settings.openai_api_key", "server-only-key")
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    monkeypatch.setattr(
        "app.realtime.routes.get_focus_by_id_owned",
        _returning(SimpleNamespace(status="active")),
    )
    monkeypatch.setattr(
        "app.realtime.routes.resolve_conversation_goal_context",
        _returning(
            GoalContext(
                goal_title="Lead technical discussions",
                goal_description=None,
                focus_title="Clarify decisions",
                focus_description=None,
            )
        ),
    )
    monkeypatch.setattr("app.realtime.routes.get_profile", _profile)

    async def fake_call(api_key: str, offer: str, model: str, instructions: str) -> bytes:
        assert (api_key, offer, model) == (
            "server-only-key",
            SDP_OFFER,
            settings.live_mentor_model,
        )
        assert "Live Mentor voice behavior" in instructions
        assert "Lead technical discussions" in instructions
        return b"v=0\r\no=- answer\r\n"

    monkeypatch.setattr("app.realtime.routes.create_realtime_call", fake_call)
    response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/realtime/sessions/{conversation.id}/connect",
            content=SDP_OFFER,
            headers={"Content-Type": "application/sdp"},
        ),
    )
    assert response.status_code == 201
    assert conversation.metadata_["mentor_started"] is True


def test_live_mentor_connect_is_disabled_before_provider_access(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_mentor()
    monkeypatch.setattr("app.realtime.routes.settings.live_mentor_enabled", False)
    monkeypatch.setattr("app.realtime.routes.settings.openai_api_key", None)
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/realtime/sessions/{conversation.id}/connect",
            content=SDP_OFFER,
            headers={"Content-Type": "application/sdp"},
        ),
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "Live Mentor is currently disabled"
    assert "server-only-key" not in response.text


def test_live_mentor_connect_rejects_missing_provider_configuration(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_mentor()
    monkeypatch.setattr("app.realtime.routes.settings.live_mentor_enabled", True)
    monkeypatch.setattr("app.realtime.routes.settings.openai_api_key", None)
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/realtime/sessions/{conversation.id}/connect",
            content=SDP_OFFER,
            headers={"Content-Type": "application/sdp"},
        ),
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "Live Mentor is currently unavailable"
    assert "server-only-key" not in response.text


@pytest.mark.parametrize("body", [b"", b"   \n\t"])
def test_realtime_connect_rejects_empty_sdp(
    body: bytes, authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_interview()
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    monkeypatch.setattr("app.realtime.routes.settings.live_interview_enabled", False)
    monkeypatch.setattr("app.realtime.routes.settings.openai_api_key", None)
    response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/realtime/sessions/{conversation.id}/connect",
            content=body,
            headers={"Content-Type": "application/sdp"},
        ),
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "A valid SDP offer is required"


def test_realtime_invalid_requests_do_not_require_provider_configuration(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_interview(mode="general")
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    monkeypatch.setattr("app.realtime.routes.settings.live_interview_enabled", False)
    monkeypatch.setattr("app.realtime.routes.settings.openai_api_key", None)

    response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/realtime/sessions/{conversation.id}/connect",
            content=b"",
            headers={"Content-Type": "application/sdp"},
        ),
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Realtime Practice requires Interview Mode"


def test_realtime_analytics_event_requires_live_voice_and_ownership(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_interview()
    monkeypatch.setattr("app.realtime.routes.settings.live_interview_enabled", False)
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/realtime/sessions/{conversation.id}/analytics-events",
            json={
                "event_id": "event-1",
                "event_type": "session_connected",
                "occurred_at": "2026-01-01T00:00:00Z",
            },
        ),
    )
    assert response.status_code == 503

    monkeypatch.setattr("app.realtime.routes.settings.live_interview_enabled", True)
    conversation.metadata_["interview_transport"] = "text"
    response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/realtime/sessions/{conversation.id}/analytics-events",
            json={
                "event_id": "event-1",
                "event_type": "session_connected",
                "occurred_at": "2026-01-01T00:00:00Z",
            },
        ),
    )
    assert response.status_code == 409


def test_realtime_provider_failure_is_generic(
    authenticated_client: CurrentUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    del authenticated_client
    conversation = make_interview()
    monkeypatch.setattr("app.realtime.routes.settings.live_interview_enabled", True)
    monkeypatch.setattr("app.realtime.routes.settings.openai_api_key", "server-only-key")
    monkeypatch.setattr("app.realtime.routes.get_conversation", _returning(conversation))
    monkeypatch.setattr("app.realtime.routes.get_profile", _profile)

    async def failed(*args: object, **kwargs: object) -> tuple[str, int | None]:
        del args, kwargs
        raise RealtimeInitializationError

    monkeypatch.setattr("app.realtime.routes.create_realtime_client_secret", failed)
    response = post_session({"conversation_id": str(conversation.id)})
    assert response.status_code == 502
    assert response.json()["detail"] == "Realtime Practice could not be connected"


@pytest.mark.asyncio
async def test_realtime_call_uses_server_side_multipart_sdp_and_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class FakeClient:
        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            del args

        def build_request(self, method: str, url: str, **kwargs: object) -> httpx.Request:
            return httpx.Request(method, url, **cast(Any, kwargs))

        async def send(self, request: httpx.Request) -> httpx.Response:
            encoded_body = request.read()
            captured.update(
                {
                    "url": str(request.url),
                    "headers": request.headers,
                    "body": encoded_body,
                }
            )
            return httpx.Response(
                201,
                content=(
                    b"v=0\r\no=- answer\r\na=ice-ufrag:abc123\r\na=ice-pwd:def456\r\n"
                    b"a=fingerprint:sha-256 AA:BB:CC\r\na=setup:active\r\n"
                ),
                headers={"content-type": "application/sdp"},
            )

    def fake_client(**kwargs: object) -> FakeClient:
        del kwargs
        return FakeClient()

    monkeypatch.setattr("app.ai.realtime.httpx.AsyncClient", fake_client)
    answer = await create_realtime_call("server-key", SDP_OFFER, "gpt-realtime", "instructions")

    expected_answer = (
        b"v=0\r\no=- answer\r\na=ice-ufrag:abc123\r\na=ice-pwd:def456\r\n"
        b"a=fingerprint:sha-256 AA:BB:CC\r\na=setup:active\r\n"
    )
    assert answer == expected_answer
    assert captured["url"] == "https://api.openai.com/v1/realtime/calls"
    headers = cast(httpx.Headers, captured["headers"])
    assert headers["authorization"] == "Bearer server-key"
    content_type = headers["content-type"]
    assert content_type.startswith("multipart/form-data; boundary=")
    body = cast(bytes, captured["body"])
    body_text = body.decode("utf-8")
    assert 'Content-Disposition: form-data; name="sdp"' in body_text
    assert 'Content-Disposition: form-data; name="session"' in body_text
    assert "Content-Type: application/sdp" in body_text
    assert "Content-Type: application/json" in body_text
    assert 'filename="offer.sdp"' not in body_text

    multipart = BytesParser(policy=policy.default).parsebytes(
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + body
    )
    parts = {
        part.get_param("name", header="content-disposition"): part
        for part in multipart.iter_parts()
    }
    sdp_part = parts["sdp"]
    session_part = parts["session"]
    assert sdp_part.get_content_type() == "application/sdp"
    sdp_payload = cast(bytes, sdp_part.get_payload(decode=True))
    assert sdp_payload == SDP_OFFER.encode("utf-8")
    assert sdp_payload.splitlines()[0] == b"v=0"
    assert sdp_payload.splitlines()[-1] == b"a=sendrecv"
    assert sdp_payload.endswith(b"\r\n")
    assert session_part.get_content_type() == "application/json"
    assert json.loads(session_part.get_content()) == {
        "type": "realtime",
        "model": "gpt-realtime",
        "instructions": "instructions",
        "output_modalities": ["audio"],
        "audio": {
            "input": {
                "turn_detection": {
                    "type": "semantic_vad",
                    "eagerness": "low",
                    "create_response": False,
                    "interrupt_response": True,
                },
                "transcription": {"model": "gpt-4o-mini-transcribe"},
            }
        },
    }


@pytest.mark.asyncio
async def test_realtime_call_logs_safe_provider_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeClient:
        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            del args

        def build_request(self, method: str, url: str, **kwargs: object) -> httpx.Request:
            return httpx.Request(method, url, **cast(Any, kwargs))

        async def send(self, request: httpx.Request) -> httpx.Response:
            del request
            return httpx.Response(400, text='{"error":"Bearer ek_secret_value"}')

    def fake_client(**kwargs: object) -> FakeClient:
        del kwargs
        return FakeClient()

    warnings: list[object] = []

    def capture_warning(*args: object, **kwargs: object) -> None:
        warnings.extend(args)
        warnings.extend(kwargs.values())

    monkeypatch.setattr("app.ai.realtime.httpx.AsyncClient", fake_client)
    monkeypatch.setattr("app.ai.realtime.logger.warning", capture_warning)
    with pytest.raises(RealtimeInitializationError):
        await create_realtime_call("server-key", SDP_OFFER, "gpt-realtime", "instructions")
    log_text = " ".join(str(value) for value in warnings)
    assert "400" in log_text
    assert "ek_secret_value" not in log_text
    assert "missing_error_object" in log_text


@pytest.mark.asyncio
@pytest.mark.parametrize("offer", ["", "  \n\t", "not-sdp"])
async def test_realtime_call_rejects_invalid_sdp_before_provider(
    offer: str,
) -> None:
    with pytest.raises(RealtimeInitializationError):
        await create_realtime_call("server-key", offer, "gpt-realtime", "instructions")


def _returning(value: Any) -> Any:
    async def result(*args: object, **kwargs: object) -> Conversation:
        del args, kwargs
        return value

    return result


async def _profile(*args: object, **kwargs: object) -> Any:
    del args, kwargs
    return SimpleNamespace(
        current_level="senior",
        target_role="backend_engineer",
        preferred_stack=["Python"],
        communication_goal="technical_interviews",
        feedback_preference="balanced",
    )
