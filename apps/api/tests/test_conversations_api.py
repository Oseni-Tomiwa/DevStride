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
from app.conversations.models import Conversation, Message
from app.conversations.service import ConversationNotFoundError
from app.database.session import get_db_session
from app.main import app

client = TestClient(app)
USER_ID = UUID("12345678-1234-5678-1234-567812345678")


def make_conversation(user_id: UUID = USER_ID) -> Conversation:
    now = datetime.now(UTC)
    conversation = Conversation(
        id=uuid4(),
        user_id=user_id,
        title="Practice session",
        mode="general",
        persona=None,
        status="active",
        metadata_={},
    )
    conversation.created_at = now
    conversation.updated_at = now
    return conversation


def make_message(conversation_id: UUID) -> Message:
    message = Message(
        id=uuid4(),
        conversation_id=conversation_id,
        role="user",
        content="Help me practise.",
        metadata_={},
    )
    message.created_at = datetime.now(UTC)
    return message


@pytest.fixture
def authenticated_client() -> Generator[tuple[TestClient, CurrentUser], None, None]:
    current_user = CurrentUser(id=USER_ID, email="ada@example.com")

    async def override_db() -> AsyncIterator[AsyncSession]:
        yield cast(AsyncSession, object())

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db_session] = override_db
    yield client, current_user
    app.dependency_overrides.clear()


def post_conversation(payload: Mapping[str, object]) -> Response:
    return cast(
        Response,
        client.post("/api/v1/conversations", json=payload),  # pyright: ignore[reportUnknownMemberType]
    )


def get_conversations() -> Response:
    return cast(
        Response,
        client.get("/api/v1/conversations"),  # pyright: ignore[reportUnknownMemberType]
    )


def get_conversation(conversation_id: UUID) -> Response:
    return cast(
        Response,
        client.get(f"/api/v1/conversations/{conversation_id}"),  # pyright: ignore[reportUnknownMemberType]
    )


def patch_conversation(conversation_id: UUID, payload: Mapping[str, object]) -> Response:
    return cast(
        Response,
        client.patch(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/conversations/{conversation_id}",
            json=payload,
        ),  # pyright: ignore[reportUnknownMemberType]
    )


def delete_conversation(conversation_id: UUID) -> Response:
    return cast(
        Response,
        client.delete(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/conversations/{conversation_id}"
        ),  # pyright: ignore[reportUnknownMemberType]
    )


def post_message(conversation_id: UUID, payload: Mapping[str, object]) -> Response:
    return cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/conversations/{conversation_id}/messages",
            json=payload,
        ),  # pyright: ignore[reportUnknownMemberType]
    )


def get_messages(conversation_id: UUID) -> Response:
    return cast(
        Response,
        client.get(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/conversations/{conversation_id}/messages"
        ),  # pyright: ignore[reportUnknownMemberType]
    )


def test_unauthenticated_conversation_list_returns_401() -> None:
    response = get_conversations()

    assert response.status_code == 401


def test_user_creates_owned_conversation(
    authenticated_client: tuple[TestClient, CurrentUser],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, current_user = authenticated_client
    conversation = make_conversation(current_user.id)
    create = AsyncMock(return_value=conversation)
    monkeypatch.setattr("app.conversations.routes.create_conversation", create)

    response = post_conversation({"title": "Practice session"})

    assert response.status_code == 201
    assert response.json()["id"] == str(conversation.id)
    assert create.await_args is not None
    assert create.await_args.args[1] == current_user.id
    assert create.await_args.args[2].title == "Practice session"


def test_list_returns_only_current_users_conversations(
    authenticated_client: tuple[TestClient, CurrentUser],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, current_user = authenticated_client
    conversations = [make_conversation(current_user.id), make_conversation(current_user.id)]
    list_all = AsyncMock(return_value=conversations)
    monkeypatch.setattr("app.conversations.routes.list_conversations", list_all)

    response = get_conversations()

    assert response.status_code == 200
    assert len(response.json()) == 2
    assert list_all.await_args is not None
    assert list_all.await_args.args[1] == current_user.id


def test_user_cannot_read_another_users_conversation(
    authenticated_client: tuple[TestClient, CurrentUser],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_one = AsyncMock(side_effect=ConversationNotFoundError)
    monkeypatch.setattr("app.conversations.routes.get_conversation", get_one)

    response = get_conversation(uuid4())

    assert response.status_code == 404


def test_user_cannot_rename_or_delete_another_users_conversation(
    authenticated_client: tuple[TestClient, CurrentUser],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    not_found = AsyncMock(side_effect=ConversationNotFoundError)
    monkeypatch.setattr("app.conversations.routes.rename_conversation", not_found)
    rename_response = patch_conversation(uuid4(), {"title": "Changed"})

    monkeypatch.setattr(
        "app.conversations.routes.delete_conversation",
        AsyncMock(side_effect=ConversationNotFoundError),
    )
    delete_response = delete_conversation(uuid4())

    assert rename_response.status_code == 404
    assert delete_response.status_code == 404


def test_owner_can_delete_conversation(
    authenticated_client: tuple[TestClient, CurrentUser],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    delete = AsyncMock()
    monkeypatch.setattr("app.conversations.routes.delete_conversation", delete)

    response = delete_conversation(uuid4())

    assert response.status_code == 204
    assert response.content == b""


def test_user_can_create_message_and_role_is_forced_to_user(
    authenticated_client: tuple[TestClient, CurrentUser],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conversation_id = uuid4()
    message = make_message(conversation_id)
    create = AsyncMock(return_value=message)
    monkeypatch.setattr("app.conversations.routes.add_user_message", create)

    response = post_message(conversation_id, {"content": "Help me practise."})

    assert response.status_code == 201
    assert response.json()["role"] == "user"
    assert create.await_args is not None
    assert create.await_args.args[1] == USER_ID
    assert create.await_args.args[2] == conversation_id
    assert create.await_args.args[3].content == "Help me practise."


@pytest.mark.parametrize("role", ["assistant", "system"])
def test_client_cannot_submit_message_role(
    authenticated_client: tuple[TestClient, CurrentUser], role: str
) -> None:
    response = post_message(uuid4(), {"content": "No role override", "role": role})

    assert response.status_code == 422


def test_client_cannot_submit_message_provider_metadata(
    authenticated_client: tuple[TestClient, CurrentUser],
) -> None:
    response = post_message(
        uuid4(),
        {
            "content": "No provider metadata",
            "provider": "unknown",
            "model": "unknown",
            "input_tokens": 1,
        },
    )

    assert response.status_code == 422


def test_blank_message_is_rejected(
    authenticated_client: tuple[TestClient, CurrentUser],
) -> None:
    response = post_message(uuid4(), {"content": "  "})

    assert response.status_code == 422


def test_user_cannot_create_message_in_another_users_conversation(
    authenticated_client: tuple[TestClient, CurrentUser],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    add_message = AsyncMock(side_effect=ConversationNotFoundError)
    monkeypatch.setattr("app.conversations.routes.add_user_message", add_message)

    response = post_message(uuid4(), {"content": "Not mine"})

    assert response.status_code == 404


def test_messages_are_returned_chronologically(
    authenticated_client: tuple[TestClient, CurrentUser],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conversation_id = uuid4()
    messages = [make_message(conversation_id), make_message(conversation_id)]
    list_messages = AsyncMock(return_value=messages)
    monkeypatch.setattr("app.conversations.routes.list_conversation_messages", list_messages)

    response = get_messages(conversation_id)

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [str(item.id) for item in messages]
