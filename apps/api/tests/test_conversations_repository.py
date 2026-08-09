from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from sqlalchemy import Result, Table
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations.models import Conversation, Message
from app.conversations.repository import (
    create_conversation,
    create_message,
    delete_by_id_and_user_id,
    get_by_id_and_user_id,
    list_by_conversation_id,
)


class RecordingSession:
    def __init__(
        self,
        result: Conversation | list[Message] | None = None,
        rowcount: int = 0,
    ) -> None:
        self.added: list[Conversation | Message] = []
        self.result = result
        self.rowcount = rowcount

    def add(self, instance: Conversation | Message) -> None:
        self.added.append(instance)

    async def flush(self) -> None:
        return None

    async def refresh(self, instance: Conversation | Message) -> None:
        return None

    async def execute(self, statement: Any) -> Result[Any]:
        del statement
        return cast(Result[Any], FakeResult(self.result, self.rowcount))


class FakeResult:
    def __init__(self, result: Conversation | list[Message] | None, rowcount: int) -> None:
        self.result = result
        self.rowcount = rowcount

    def scalar_one_or_none(self) -> Conversation | None:
        return self.result if isinstance(self.result, Conversation) else None

    def scalars(self) -> "FakeResult":
        return self

    def all(self) -> list[Message]:
        return self.result if isinstance(self.result, list) else []


def make_conversation() -> Conversation:
    return Conversation(user_id=uuid4(), title="Practice session")


def make_message(conversation_id: UUID) -> Message:
    return Message(conversation_id=conversation_id, role="user", content="Hello")


@pytest.mark.asyncio
async def test_create_conversation_adds_to_session() -> None:
    session = RecordingSession()
    conversation = make_conversation()

    created = await create_conversation(cast(AsyncSession, session), conversation)

    assert created is conversation
    assert session.added == [conversation]


@pytest.mark.asyncio
async def test_create_message_adds_to_session() -> None:
    session = RecordingSession()
    message = make_message(uuid4())

    created = await create_message(cast(AsyncSession, session), message)

    assert created is message
    assert session.added == [message]


@pytest.mark.asyncio
async def test_get_conversation_is_repository_operation() -> None:
    conversation = make_conversation()
    session = RecordingSession(result=conversation)

    result = await get_by_id_and_user_id(
        cast(AsyncSession, session), conversation.id, conversation.user_id
    )

    assert result is conversation


@pytest.mark.asyncio
async def test_list_messages_returns_repository_result() -> None:
    messages = [make_message(uuid4()), make_message(uuid4())]
    session = RecordingSession(result=messages)

    result = await list_by_conversation_id(cast(AsyncSession, session), uuid4())

    assert result == messages


@pytest.mark.asyncio
async def test_delete_returns_database_rowcount() -> None:
    session = RecordingSession(rowcount=1)

    deleted = await delete_by_id_and_user_id(cast(AsyncSession, session), uuid4(), uuid4())

    assert deleted is True


def test_messages_have_cascade_foreign_key_and_indexes() -> None:
    table = cast(Table, Message.__table__)
    foreign_keys = table.foreign_key_constraints
    indexes = table.indexes

    assert any(foreign_key.ondelete == "CASCADE" for foreign_key in foreign_keys)
    assert any(index.name == "ix_messages_conversation_id" for index in indexes)
