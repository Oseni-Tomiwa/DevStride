from collections.abc import AsyncIterator, Sequence
from typing import Any, cast
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from pydantic import ValidationError
from sqlalchemy import Table
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.provider import (
    GenerationResult,
    GenerationStreamChunk,
    ProviderMessage,
    StructuredModel,
)
from app.conversations.models import Conversation, Message
from app.main import app
from app.session_summaries import repository
from app.session_summaries.models import SessionSummary
from app.session_summaries.schemas import SessionSummaryContent
from app.session_summaries.service import (
    SessionSummaryGenerationError,
    SessionSummaryNotAllowedError,
    generate_summary,
)

client = TestClient(app)


class StructuredProvider:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.calls = 0

    async def generate_structured(
        self,
        messages: Sequence[ProviderMessage],
        *,
        system_instruction: str,
        response_model: type[StructuredModel],
    ) -> tuple[StructuredModel, GenerationResult]:
        del messages, system_instruction
        self.calls += 1
        if self.error:
            raise self.error
        return response_model(
            summary="This session showed careful API reasoning.",
            topics_covered=["APIs"],
            strengths=["Explained trade-offs clearly"],
            weaknesses=["Could practice failure handling"],
            recommended_next_steps=["Practice one API design exercise"],
            concepts_practiced=["HTTP semantics"],
            exercises_completed=["API design walkthrough"],
        ), GenerationResult(text="", provider="openai", model="model")

    async def generate(
        self, messages: Sequence[ProviderMessage], *, system_instruction: str
    ) -> GenerationResult:
        del messages, system_instruction
        raise NotImplementedError

    async def stream(
        self, messages: Sequence[ProviderMessage], *, system_instruction: str
    ) -> AsyncIterator[GenerationStreamChunk]:
        del messages, system_instruction
        raise NotImplementedError
        yield GenerationStreamChunk()


class SummarySession:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


def mentor_conversation(user_id: Any) -> Conversation:
    return Conversation(
        id=uuid4(), user_id=user_id, title="Mentor session", mode="mentor", metadata_={}
    )


@pytest.mark.asyncio
async def test_mentor_summary_generation_persists_structured_content(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    conversation = mentor_conversation(user_id)
    provider = StructuredProvider()
    raw_session = SummarySession()
    session = cast(AsyncSession, raw_session)
    created: list[SessionSummary] = []

    async def owned(*args: Any) -> Conversation:
        del args
        return conversation

    async def no_existing(*args: Any) -> None:
        del args
        return None

    async def recent(*args: Any, **kwargs: Any) -> list[Message]:
        del args, kwargs
        return [Message(conversation_id=conversation.id, role="user", content="Explain APIs")]

    async def create(*args: Any) -> SessionSummary:
        summary = args[1]
        created.append(summary)
        return summary

    monkeypatch.setattr(
        "app.session_summaries.service.conversation_repository.get_by_id_and_user_id_for_update",
        owned,
    )
    monkeypatch.setattr(repository, "get_by_conversation_id_and_user_id", no_existing)
    monkeypatch.setattr(
        "app.session_summaries.service.conversation_repository.get_recent_by_conversation_id",
        recent,
    )
    monkeypatch.setattr(repository, "create", create)

    summary = await generate_summary(session, user_id, conversation.id, provider)

    assert summary.session_mode == "mentor"
    assert summary.topics_covered == ["APIs"]
    assert summary.concepts_practiced == ["HTTP semantics"]
    assert created == [summary]
    assert raw_session.commits == 1


@pytest.mark.asyncio
async def test_summary_is_idempotent_and_does_not_call_provider_again(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    conversation = mentor_conversation(user_id)
    existing = SessionSummary(
        id=uuid4(),
        conversation_id=conversation.id,
        user_id=user_id,
        session_mode="mentor",
        summary="Existing",
        topics_covered=[],
        strengths=[],
        weaknesses=[],
        recommended_next_steps=[],
    )
    provider = StructuredProvider()

    async def owned(*args: Any) -> Conversation:
        del args
        return conversation

    async def found(*args: Any) -> SessionSummary:
        del args
        return existing

    monkeypatch.setattr(
        "app.session_summaries.service.conversation_repository.get_by_id_and_user_id_for_update",
        owned,
    )
    monkeypatch.setattr(repository, "get_by_conversation_id_and_user_id", found)

    result = await generate_summary(
        cast(AsyncSession, SummarySession()), user_id, conversation.id, provider
    )

    assert result is existing
    assert provider.calls == 0


@pytest.mark.asyncio
async def test_failed_summary_generation_creates_no_row_and_can_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    conversation = mentor_conversation(user_id)
    existing: SessionSummary | None = None
    created: list[SessionSummary] = []

    async def owned(*args: Any) -> Conversation:
        del args
        return conversation

    async def find(*args: Any) -> SessionSummary | None:
        del args
        return existing

    async def recent(*args: Any, **kwargs: Any) -> list[Message]:
        del args, kwargs
        return [Message(conversation_id=conversation.id, role="user", content="Practice")]

    async def create(*args: Any) -> SessionSummary:
        nonlocal existing
        summary = cast(SessionSummary, args[1])
        existing = summary
        created.append(summary)
        return summary

    monkeypatch.setattr(
        "app.session_summaries.service.conversation_repository.get_by_id_and_user_id_for_update",
        owned,
    )
    monkeypatch.setattr(repository, "get_by_conversation_id_and_user_id", find)
    monkeypatch.setattr(
        "app.session_summaries.service.conversation_repository.get_recent_by_conversation_id",
        recent,
    )
    monkeypatch.setattr(repository, "create", create)

    with pytest.raises(SessionSummaryGenerationError):
        await generate_summary(
            cast(AsyncSession, SummarySession()),
            user_id,
            conversation.id,
            StructuredProvider(error=ValueError("invalid structured output")),
        )
    assert created == []

    result = await generate_summary(
        cast(AsyncSession, SummarySession()), user_id, conversation.id, StructuredProvider()
    )
    assert result is existing
    assert len(created) == 1


@pytest.mark.asyncio
async def test_general_conversation_is_rejected_and_ownership_is_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    general = Conversation(id=uuid4(), user_id=user_id, title="General", mode="general")

    async def owned(*args: Any) -> Conversation:
        del args
        return general

    monkeypatch.setattr(
        "app.session_summaries.service.conversation_repository.get_by_id_and_user_id_for_update",
        owned,
    )
    with pytest.raises(SessionSummaryNotAllowedError):
        await generate_summary(
            cast(AsyncSession, SummarySession()), user_id, general.id, StructuredProvider()
        )

    async def unowned(*args: Any) -> None:
        del args
        return None

    monkeypatch.setattr(
        "app.session_summaries.service.conversation_repository.get_by_id_and_user_id_for_update",
        unowned,
    )
    with pytest.raises(SessionSummaryNotAllowedError):
        await generate_summary(
            cast(AsyncSession, SummarySession()), user_id, uuid4(), StructuredProvider()
        )


def test_summary_content_validates_rating_range_and_blank_items() -> None:
    with pytest.raises(ValidationError):
        SessionSummaryContent(summary="Summary", correctness_rating=6)
    with pytest.raises(ValidationError):
        SessionSummaryContent(summary="Summary", strengths=[" "])


def test_summary_requires_authentication() -> None:
    response = cast(
        Response,
        client.get(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/conversations/{uuid4()}/summary"
        ),
    )
    assert response.status_code == 401


def test_summary_cascades_from_conversation() -> None:
    foreign_keys = cast(Table, SessionSummary.__table__).foreign_key_constraints
    assert any(foreign_key.ondelete == "CASCADE" for foreign_key in foreign_keys)
