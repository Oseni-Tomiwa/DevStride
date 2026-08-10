import logging
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.prompts import SYSTEM_INSTRUCTION
from app.ai.provider import (
    AIProvider,
    AIProviderError,
    GenerationResult,
    ProviderMessage,
)
from app.conversations import repository
from app.conversations.models import Conversation, Message
from app.conversations.schemas import RespondRequest
from app.conversations.service import get_conversation, get_retry_message
from app.interviews.prompts import build_interview_instruction
from app.memory.service import memory_context, retrieve_for_prompt
from app.mentor.prompts import build_mentor_instruction
from app.profiles import repository as profile_repository
from app.session_summaries.service import (
    SessionSummaryGenerationError,
    generate_summary,
)

logger = logging.getLogger(__name__)
RECENT_MESSAGE_CONTEXT_LIMIT = 20
FINAL_ASSESSMENT_REQUEST_PREFIX = "End the interview and provide my final practice assessment"
MENTOR_SESSION_END_REQUEST_PREFIX = "End the mentor session and provide my practice summary"


class AssistantGenerationDisabledError(Exception):
    pass


class AssistantGenerationError(Exception):
    pass


class MentorProfileRequiredError(Exception):
    pass


class InterviewProfileRequiredError(Exception):
    pass


class InterviewStartNotAllowedError(Exception):
    pass


@dataclass(frozen=True)
class StreamUserMessage:
    message: Message


@dataclass(frozen=True)
class StreamAssistantDelta:
    delta: str


@dataclass(frozen=True)
class StreamAssistantComplete:
    message: Message


@dataclass(frozen=True)
class StreamInterviewPending:
    """Signals that another request owns the in-progress interview kickoff."""


StreamEvent = (
    StreamUserMessage | StreamAssistantDelta | StreamAssistantComplete | StreamInterviewPending
)


def _is_final_assessment_request(content: str) -> bool:
    return content.strip().startswith(FINAL_ASSESSMENT_REQUEST_PREFIX)


def _is_mentor_session_end_request(content: str) -> bool:
    return content.strip().startswith(MENTOR_SESSION_END_REQUEST_PREFIX)


def _mark_interview_completed(conversation: Conversation, assistant_message: Message) -> None:
    metadata = dict(conversation.metadata_ or {})
    metadata["interview_completed"] = True
    metadata["final_assessment_message_id"] = str(assistant_message.id)
    conversation.metadata_ = metadata


async def _maybe_generate_session_summary(
    session: AsyncSession,
    user_id: UUID,
    conversation: Conversation,
    trigger_content: str,
    provider: AIProvider | None,
) -> None:
    should_summarize = (
        conversation.mode == "interview" and _is_final_assessment_request(trigger_content)
    ) or (conversation.mode == "mentor" and _is_mentor_session_end_request(trigger_content))
    if not should_summarize:
        return
    try:
        await generate_summary(session, user_id, conversation.id, provider)
    except SessionSummaryGenerationError:
        logger.warning(
            "Session summary remains unavailable",
            extra={"mode": conversation.mode},
        )
        return
    if conversation.mode == "mentor":
        metadata = dict(conversation.metadata_ or {})
        metadata["mentor_completed"] = True
        conversation.metadata_ = metadata
        await session.commit()


def _provider_messages(messages: Sequence[Message]) -> list[ProviderMessage]:
    return [ProviderMessage(role=message.role, content=message.content) for message in messages]


async def start_interview_response(
    session: AsyncSession,
    user_id: UUID,
    conversation_id: UUID,
    provider: AIProvider | None,
) -> AsyncIterator[StreamEvent]:
    """Generate the first interviewer question without creating a fake user turn."""
    conversation = await repository.get_by_id_and_user_id_for_update(
        session, conversation_id, user_id
    )
    if conversation is None:
        raise InterviewStartNotAllowedError
    if conversation.mode != "interview":
        raise InterviewStartNotAllowedError

    messages = await repository.list_by_conversation_id(session, conversation_id)
    existing_assistant = next(
        (message for message in messages if message.role == "assistant"), None
    )
    if existing_assistant is not None:
        yield StreamAssistantComplete(existing_assistant)
        return

    metadata = dict(conversation.metadata_ or {})
    if metadata.get("interview_kickoff_started"):
        yield StreamInterviewPending()
        return
    if provider is None:
        raise AssistantGenerationDisabledError

    instruction = await system_instruction(session, user_id, conversation)
    metadata["interview_kickoff_started"] = True
    conversation.metadata_ = metadata
    await session.commit()

    chunks: list[str] = []
    final_result: GenerationResult | None = None
    try:
        async for chunk in provider.stream([], system_instruction=instruction):
            if chunk.delta:
                chunks.append(chunk.delta)
                yield StreamAssistantDelta(chunk.delta)
            if chunk.result is not None:
                final_result = chunk.result
    except AIProviderError as exc:
        metadata.pop("interview_kickoff_started", None)
        conversation.metadata_ = metadata
        await session.commit()
        logger.warning(
            "AI interview kickoff failed",
            extra={"provider": provider.__class__.__name__, "error_type": type(exc).__name__},
        )
        raise AssistantGenerationError from exc
    except Exception as exc:
        metadata.pop("interview_kickoff_started", None)
        conversation.metadata_ = metadata
        await session.commit()
        logger.warning(
            "AI interview kickoff failed",
            extra={"provider": provider.__class__.__name__, "error_type": type(exc).__name__},
        )
        raise AssistantGenerationError from exc

    if final_result is None:
        metadata.pop("interview_kickoff_started", None)
        conversation.metadata_ = metadata
        await session.commit()
        raise AssistantGenerationError

    text = "".join(chunks).strip() or final_result.text.strip()
    if not text:
        metadata.pop("interview_kickoff_started", None)
        conversation.metadata_ = metadata
        await session.commit()
        raise AssistantGenerationError

    message_metadata = {}
    if final_result.provider_response_id:
        message_metadata["provider_response_id"] = final_result.provider_response_id
    assistant_message = Message(
        conversation_id=conversation_id,
        role="assistant",
        content=text,
        provider=final_result.provider,
        model=final_result.model,
        input_tokens=final_result.input_tokens,
        output_tokens=final_result.output_tokens,
        latency_ms=final_result.latency_ms,
        metadata_=message_metadata,
    )
    await repository.create_message(session, assistant_message)
    repository.touch_conversation_activity(conversation)
    metadata.pop("interview_kickoff_started", None)
    metadata["interview_started"] = True
    conversation.metadata_ = metadata
    await session.commit()
    yield StreamAssistantComplete(assistant_message)


async def system_instruction(
    session: AsyncSession, user_id: UUID, conversation: Conversation
) -> str:
    mode = conversation.mode
    if mode not in {"mentor", "interview"}:
        return SYSTEM_INSTRUCTION
    profile = await profile_repository.get_profile_by_user_id(session, user_id)
    if profile is None:
        if mode == "interview":
            raise InterviewProfileRequiredError
        raise MentorProfileRequiredError
    if mode == "interview":
        try:
            memories = await retrieve_for_prompt(session, user_id)
        except Exception:
            memories = []
        return build_interview_instruction(
            profile, conversation.metadata_ or {}, memory_context(memories)
        )
    try:
        memories = await retrieve_for_prompt(session, user_id)
    except Exception:
        memories = []
    return build_mentor_instruction(profile, memory_context(memories))


async def generate_response(
    session: AsyncSession,
    user_id: UUID,
    conversation_id: UUID,
    data: RespondRequest,
    provider: AIProvider | None,
) -> tuple[Message, Message]:
    conversation = await get_conversation(session, user_id, conversation_id)
    if provider is None:
        raise AssistantGenerationDisabledError
    instruction = await system_instruction(session, user_id, conversation)

    user_message = Message(
        conversation_id=conversation_id,
        role="user",
        content=data.content,
    )
    await repository.create_message(session, user_message)
    repository.touch_conversation_activity(conversation)
    await session.commit()

    recent_messages = await repository.get_recent_by_conversation_id(
        session, conversation_id, limit=RECENT_MESSAGE_CONTEXT_LIMIT
    )
    context = _provider_messages(list(reversed(recent_messages)))
    try:
        result = await provider.generate(context, system_instruction=instruction)
    except AIProviderError as exc:
        logger.warning(
            "AI generation failed",
            extra={"provider": provider.__class__.__name__, "error_type": type(exc).__name__},
        )
        raise AssistantGenerationError from exc
    except Exception as exc:
        logger.warning(
            "AI generation failed",
            extra={"provider": provider.__class__.__name__, "error_type": type(exc).__name__},
        )
        raise AssistantGenerationError from exc

    metadata = {}
    if result.provider_response_id:
        metadata["provider_response_id"] = result.provider_response_id
    assistant_message = Message(
        conversation_id=conversation_id,
        role="assistant",
        content=result.text,
        provider=result.provider,
        model=result.model,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        latency_ms=result.latency_ms,
        metadata_=metadata,
    )
    await repository.create_message(session, assistant_message)
    if conversation.mode == "interview" and _is_final_assessment_request(data.content):
        _mark_interview_completed(conversation, assistant_message)
    repository.touch_conversation_activity(conversation)
    await session.commit()
    await _maybe_generate_session_summary(session, user_id, conversation, data.content, provider)
    return user_message, assistant_message


async def stream_response(
    session: AsyncSession,
    user_id: UUID,
    conversation_id: UUID,
    data: RespondRequest,
    provider: AIProvider | None,
) -> AsyncIterator[StreamEvent]:
    """Persist the user turn, stream normalized deltas, then persist one assistant turn."""
    conversation = await get_conversation(session, user_id, conversation_id)
    instruction = await system_instruction(session, user_id, conversation)

    user_message = Message(
        conversation_id=conversation_id,
        role="user",
        content=data.content,
    )
    await repository.create_message(session, user_message)
    repository.touch_conversation_activity(conversation)
    await session.commit()
    yield StreamUserMessage(user_message)

    if provider is None:
        raise AssistantGenerationDisabledError

    recent_messages = await repository.get_recent_by_conversation_id(
        session, conversation_id, limit=RECENT_MESSAGE_CONTEXT_LIMIT
    )
    context = _provider_messages(list(reversed(recent_messages)))
    chunks: list[str] = []
    final_result: GenerationResult | None = None
    try:
        async for chunk in provider.stream(context, system_instruction=instruction):
            if chunk.delta:
                chunks.append(chunk.delta)
                yield StreamAssistantDelta(chunk.delta)
            if chunk.result is not None:
                final_result = chunk.result
    except AIProviderError as exc:
        logger.warning(
            "AI streaming failed",
            extra={"provider": provider.__class__.__name__, "error_type": type(exc).__name__},
        )
        raise AssistantGenerationError from exc
    except Exception as exc:
        logger.warning(
            "AI streaming failed",
            extra={"provider": provider.__class__.__name__, "error_type": type(exc).__name__},
        )
        raise AssistantGenerationError from exc

    if final_result is None:
        raise AssistantGenerationError

    text = "".join(chunks).strip() or final_result.text.strip()
    if not text:
        raise AssistantGenerationError

    metadata = {}
    if final_result.provider_response_id:
        metadata["provider_response_id"] = final_result.provider_response_id
    assistant_message = Message(
        conversation_id=conversation_id,
        role="assistant",
        content=text,
        provider=final_result.provider,
        model=final_result.model,
        input_tokens=final_result.input_tokens,
        output_tokens=final_result.output_tokens,
        latency_ms=final_result.latency_ms,
        metadata_=metadata,
    )
    await repository.create_message(session, assistant_message)
    if conversation.mode == "interview" and _is_final_assessment_request(data.content):
        _mark_interview_completed(conversation, assistant_message)
    repository.touch_conversation_activity(conversation)
    await session.commit()
    await _maybe_generate_session_summary(session, user_id, conversation, data.content, provider)
    yield StreamAssistantComplete(assistant_message)


async def retry_stream_response(
    session: AsyncSession,
    user_id: UUID,
    conversation_id: UUID,
    message_id: UUID,
    provider: AIProvider | None,
) -> AsyncIterator[StreamEvent]:
    """Regenerate for an existing user message without inserting another user row."""
    user_message = await get_retry_message(session, user_id, conversation_id, message_id)
    yield StreamUserMessage(user_message)

    if provider is None:
        raise AssistantGenerationDisabledError

    conversation = await get_conversation(session, user_id, conversation_id)
    instruction = await system_instruction(session, user_id, conversation)
    recent_messages = await repository.get_recent_by_conversation_id(
        session, conversation_id, limit=RECENT_MESSAGE_CONTEXT_LIMIT
    )
    context = _provider_messages(list(reversed(recent_messages)))
    chunks: list[str] = []
    final_result: GenerationResult | None = None
    try:
        async for chunk in provider.stream(context, system_instruction=instruction):
            if chunk.delta:
                chunks.append(chunk.delta)
                yield StreamAssistantDelta(chunk.delta)
            if chunk.result is not None:
                final_result = chunk.result
    except AIProviderError as exc:
        logger.warning(
            "AI streaming retry failed",
            extra={"provider": provider.__class__.__name__, "error_type": type(exc).__name__},
        )
        raise AssistantGenerationError from exc
    except Exception as exc:
        logger.warning(
            "AI streaming retry failed",
            extra={"provider": provider.__class__.__name__, "error_type": type(exc).__name__},
        )
        raise AssistantGenerationError from exc

    if final_result is None:
        raise AssistantGenerationError

    text = "".join(chunks).strip() or final_result.text.strip()
    if not text:
        raise AssistantGenerationError

    metadata = {}
    if final_result.provider_response_id:
        metadata["provider_response_id"] = final_result.provider_response_id
    assistant_message = Message(
        conversation_id=conversation_id,
        role="assistant",
        content=text,
        provider=final_result.provider,
        model=final_result.model,
        input_tokens=final_result.input_tokens,
        output_tokens=final_result.output_tokens,
        latency_ms=final_result.latency_ms,
        metadata_=metadata,
    )
    await repository.create_message(session, assistant_message)
    if conversation.mode == "interview" and _is_final_assessment_request(user_message.content):
        _mark_interview_completed(conversation, assistant_message)
    repository.touch_conversation_activity(conversation)
    await session.commit()
    await _maybe_generate_session_summary(
        session, user_id, conversation, user_message.content, provider
    )
    yield StreamAssistantComplete(assistant_message)
