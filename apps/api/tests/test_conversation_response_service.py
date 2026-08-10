from collections.abc import AsyncIterator, Sequence
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.provider import (
    AIProviderError,
    GenerationResult,
    GenerationStreamChunk,
    ProviderMessage,
)
from app.conversations import repository
from app.conversations.models import Message
from app.conversations.response_service import (
    RECENT_MESSAGE_CONTEXT_LIMIT,
    AssistantGenerationError,
    StreamAssistantComplete,
    StreamAssistantDelta,
    StreamUserMessage,
    generate_response,
    retry_stream_response,
    stream_response,
)
from app.conversations.schemas import RespondRequest


class FakeProvider:
    def __init__(self, result: GenerationResult | None = None, error: Exception | None = None):
        self.result = result
        self.error = error
        self.messages: Sequence[ProviderMessage] = []

    async def generate(self, messages: Sequence[ProviderMessage]) -> GenerationResult:
        self.messages = messages
        if self.error:
            raise self.error
        assert self.result is not None
        return self.result

    async def stream(
        self, messages: Sequence[ProviderMessage]
    ) -> AsyncIterator[GenerationStreamChunk]:
        self.messages = messages
        if self.error:
            raise self.error
        assert self.result is not None
        yield GenerationStreamChunk(delta=self.result.text)
        yield GenerationStreamChunk(result=self.result)


def make_message(conversation_id: UUID, role: str, content: str) -> Message:
    return Message(conversation_id=conversation_id, role=role, content=content, metadata_={})


@pytest.mark.asyncio
async def test_generation_uses_bounded_chronological_context_and_persists_both_messages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conversation_id = uuid4()
    user_id = uuid4()
    recent_newest_first = [
        make_message(conversation_id, "user", f"message {index}")
        for index in range(RECENT_MESSAGE_CONTEXT_LIMIT - 1, -1, -1)
    ]
    provider = FakeProvider(
        GenerationResult(
            text="Assistant response",
            provider="openai",
            model="configured-model",
            input_tokens=10,
            output_tokens=5,
            latency_ms=42,
            provider_response_id="response-id",
        )
    )
    session = cast(AsyncSession, type("Session", (), {"commit": _commit})())
    added: list[Message] = []

    async def fake_get_conversation(*args: Any) -> object:
        return object()

    async def fake_create_message(_session: AsyncSession, message: Message) -> Message:
        added.append(message)
        return message

    async def fake_recent(*args: Any, **kwargs: Any) -> list[Message]:
        assert kwargs["limit"] == RECENT_MESSAGE_CONTEXT_LIMIT
        return recent_newest_first

    monkeypatch.setattr(
        "app.conversations.response_service.get_conversation", cast(Any, fake_get_conversation)
    )
    monkeypatch.setattr(repository, "create_message", cast(Any, fake_create_message))
    monkeypatch.setattr(repository, "get_recent_by_conversation_id", cast(Any, fake_recent))

    user_message, assistant_message = await generate_response(
        session,
        user_id,
        conversation_id,
        RespondRequest(content="new question"),
        provider,
    )

    assert user_message.role == "user"
    assert assistant_message.role == "assistant"
    assert assistant_message.provider == "openai"
    assert assistant_message.model == "configured-model"
    assert assistant_message.metadata_ == {"provider_response_id": "response-id"}
    assert [item.content for item in provider.messages] == [
        f"message {index}" for index in range(RECENT_MESSAGE_CONTEXT_LIMIT)
    ]
    assert added == [user_message, assistant_message]


async def _commit(_session: AsyncSession) -> None:
    return None


@pytest.mark.asyncio
async def test_provider_failure_preserves_user_message_without_assistant(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conversation_id = uuid4()
    provider = FakeProvider(error=AIProviderError("private details"))
    added: list[Message] = []

    async def fake_get_conversation(*args: Any) -> object:
        return object()

    async def fake_create_message(_session: AsyncSession, message: Message) -> Message:
        added.append(message)
        return message

    async def fake_recent(*args: Any, **kwargs: Any) -> list[Message]:
        del args, kwargs
        return added

    monkeypatch.setattr(
        "app.conversations.response_service.get_conversation", cast(Any, fake_get_conversation)
    )
    monkeypatch.setattr(repository, "create_message", cast(Any, fake_create_message))
    monkeypatch.setattr(repository, "get_recent_by_conversation_id", cast(Any, fake_recent))

    with pytest.raises(AssistantGenerationError):
        await generate_response(
            cast(AsyncSession, type("Session", (), {"commit": _commit})()),
            uuid4(),
            conversation_id,
            RespondRequest(content="new question"),
            provider,
        )

    assert len(added) == 1
    assert added[0].role == "user"


@pytest.mark.asyncio
async def test_streaming_uses_bounded_context_and_persists_one_assistant(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conversation_id = uuid4()
    user_id = uuid4()
    provider = FakeProvider(
        GenerationResult(
            text="Assistant response",
            provider="openai",
            model="configured-model",
            input_tokens=10,
            output_tokens=5,
            latency_ms=42,
            provider_response_id="response-id",
        )
    )
    session = cast(AsyncSession, type("Session", (), {"commit": _commit})())
    added: list[Message] = []

    async def fake_get_conversation(*args: Any) -> object:
        return object()

    async def fake_create_message(_session: AsyncSession, message: Message) -> Message:
        added.append(message)
        return message

    async def fake_recent(*args: Any, **kwargs: Any) -> list[Message]:
        assert kwargs["limit"] == RECENT_MESSAGE_CONTEXT_LIMIT
        return []

    monkeypatch.setattr(
        "app.conversations.response_service.get_conversation", cast(Any, fake_get_conversation)
    )
    monkeypatch.setattr(repository, "create_message", cast(Any, fake_create_message))
    monkeypatch.setattr(repository, "get_recent_by_conversation_id", cast(Any, fake_recent))

    events = [
        event
        async for event in stream_response(
            session, user_id, conversation_id, RespondRequest(content="new question"), provider
        )
    ]

    assert isinstance(events[0], StreamUserMessage)
    assert [event.delta for event in events if isinstance(event, StreamAssistantDelta)] == [
        "Assistant response"
    ]
    complete = next(event for event in events if isinstance(event, StreamAssistantComplete))
    assert complete.message.role == "assistant"
    assert complete.message.metadata_ == {"provider_response_id": "response-id"}
    assert [message.role for message in added] == ["user", "assistant"]


@pytest.mark.asyncio
async def test_streaming_provider_failure_keeps_user_without_assistant(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conversation_id = uuid4()
    provider = FakeProvider(error=AIProviderError("private details"))
    added: list[Message] = []

    async def fake_get_conversation(*args: Any) -> object:
        return object()

    async def fake_create_message(_session: AsyncSession, message: Message) -> Message:
        added.append(message)
        return message

    async def fake_recent(*args: Any, **kwargs: Any) -> list[Message]:
        del args, kwargs
        return added

    monkeypatch.setattr(
        "app.conversations.response_service.get_conversation", cast(Any, fake_get_conversation)
    )
    monkeypatch.setattr(repository, "create_message", cast(Any, fake_create_message))
    monkeypatch.setattr(repository, "get_recent_by_conversation_id", cast(Any, fake_recent))

    with pytest.raises(AssistantGenerationError):
        [
            event
            async for event in stream_response(
                cast(AsyncSession, type("Session", (), {"commit": _commit})()),
                uuid4(),
                conversation_id,
                RespondRequest(content="new question"),
                provider,
            )
        ]

    assert [message.role for message in added] == ["user"]


@pytest.mark.asyncio
async def test_retry_stream_reuses_user_message_and_persists_one_assistant(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conversation_id = uuid4()
    user_message = make_message(conversation_id, "user", "Retry this")
    provider = FakeProvider(
        GenerationResult(
            text="Recovered response",
            provider="openai",
            model="configured-model",
            latency_ms=21,
        )
    )
    added: list[Message] = []

    async def fake_retry_message(*args: Any, **kwargs: Any) -> Message:
        del args, kwargs
        return user_message

    async def fake_create_message(_session: AsyncSession, message: Message) -> Message:
        added.append(message)
        return message

    async def fake_recent(*args: Any, **kwargs: Any) -> list[Message]:
        del args, kwargs
        return [user_message]

    monkeypatch.setattr("app.conversations.response_service.get_retry_message", fake_retry_message)
    monkeypatch.setattr(repository, "create_message", fake_create_message)
    monkeypatch.setattr(repository, "get_recent_by_conversation_id", fake_recent)

    events = [
        event
        async for event in retry_stream_response(
            cast(AsyncSession, type("Session", (), {"commit": _commit})()),
            uuid4(),
            conversation_id,
            uuid4(),
            provider,
        )
    ]

    assert isinstance(events[0], StreamUserMessage)
    complete = next(event for event in events if isinstance(event, StreamAssistantComplete))
    assert complete.message.role == "assistant"
    assert [message.role for message in added] == ["assistant"]
