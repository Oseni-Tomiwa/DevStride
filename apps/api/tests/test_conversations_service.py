from typing import cast
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations import repository
from app.conversations.models import Conversation
from app.conversations.schemas import ConversationCreateRequest
from app.conversations.service import create_conversation


async def _commit(_session: AsyncSession) -> None:
    return None


@pytest.mark.asyncio
async def test_interview_configuration_is_persisted_in_conversation_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created: list[Conversation] = []

    async def fake_create(_session: AsyncSession, conversation: Conversation) -> Conversation:
        created.append(conversation)
        return conversation

    monkeypatch.setattr(repository, "create_conversation", fake_create)
    session = cast(AsyncSession, type("Session", (), {"commit": _commit})())

    await create_conversation(
        session,
        uuid4(),
        ConversationCreateRequest(
            title="Technical interview",
            mode="interview",
            interview_type="technical",
            interview_focus="apis",
        ),
    )

    assert len(created) == 1
    assert created[0].metadata_ == {"interview_type": "technical", "interview_focus": "apis"}
    assert created[0].focus_area_id is None


@pytest.mark.asyncio
async def test_internal_conversation_creation_can_link_a_focus_area(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created: list[Conversation] = []

    async def fake_create(_session: AsyncSession, conversation: Conversation) -> Conversation:
        created.append(conversation)
        return conversation

    monkeypatch.setattr(repository, "create_conversation", fake_create)
    session = cast(AsyncSession, type("Session", (), {"commit": _commit})())
    focus_area_id = uuid4()

    await create_conversation(
        session,
        uuid4(),
        ConversationCreateRequest(title="Linked mentor practice", mode="mentor"),
        focus_area_id=focus_area_id,
    )

    assert created[0].focus_area_id == focus_area_id
