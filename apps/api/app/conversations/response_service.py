import logging
from collections.abc import Sequence
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.provider import AIProvider, AIProviderError, ProviderMessage
from app.conversations import repository
from app.conversations.models import Message
from app.conversations.schemas import RespondRequest
from app.conversations.service import get_conversation

logger = logging.getLogger(__name__)
RECENT_MESSAGE_CONTEXT_LIMIT = 20


class AssistantGenerationDisabledError(Exception):
    pass


class AssistantGenerationError(Exception):
    pass


def _provider_messages(messages: Sequence[Message]) -> list[ProviderMessage]:
    return [ProviderMessage(role=message.role, content=message.content) for message in messages]


async def generate_response(
    session: AsyncSession,
    user_id: UUID,
    conversation_id: UUID,
    data: RespondRequest,
    provider: AIProvider | None,
) -> tuple[Message, Message]:
    await get_conversation(session, user_id, conversation_id)
    if provider is None:
        raise AssistantGenerationDisabledError

    user_message = Message(
        conversation_id=conversation_id,
        role="user",
        content=data.content,
    )
    await repository.create_message(session, user_message)
    await session.commit()

    recent_messages = await repository.get_recent_by_conversation_id(
        session, conversation_id, limit=RECENT_MESSAGE_CONTEXT_LIMIT
    )
    context = _provider_messages(list(reversed(recent_messages)))
    try:
        result = await provider.generate(context)
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
    await session.commit()
    return user_message, assistant_message
