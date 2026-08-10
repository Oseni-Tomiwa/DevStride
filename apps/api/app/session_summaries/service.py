import logging
from collections.abc import Sequence
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.provider import AIProvider, AIProviderError, ProviderMessage
from app.conversations import repository as conversation_repository
from app.session_summaries import repository
from app.session_summaries.models import SessionSummary
from app.session_summaries.prompts import build_summary_instruction
from app.session_summaries.schemas import SessionSummaryContent

logger = logging.getLogger(__name__)
SUMMARY_MESSAGE_LIMIT = 40


class SessionSummaryNotAllowedError(Exception):
    pass


class SessionSummaryNotFoundError(Exception):
    pass


class SessionSummaryGenerationError(Exception):
    pass


def _provider_messages(messages: Sequence[object]) -> list[ProviderMessage]:
    return [
        ProviderMessage(role=message.role, content=message.content)  # type: ignore[attr-defined]
        for message in messages
    ]


async def get_summary(
    session: AsyncSession, user_id: UUID, conversation_id: UUID
) -> SessionSummary:
    conversation = await conversation_repository.get_by_id_and_user_id(
        session, conversation_id, user_id
    )
    if conversation is None or conversation.mode not in {"mentor", "interview"}:
        raise SessionSummaryNotFoundError
    summary = await repository.get_by_conversation_id_and_user_id(session, conversation_id, user_id)
    if summary is None:
        raise SessionSummaryNotFoundError
    return summary


async def generate_summary(
    session: AsyncSession,
    user_id: UUID,
    conversation_id: UUID,
    provider: AIProvider | None,
) -> SessionSummary:
    conversation = await conversation_repository.get_by_id_and_user_id_for_update(
        session, conversation_id, user_id
    )
    if conversation is None or conversation.mode not in {"mentor", "interview"}:
        raise SessionSummaryNotAllowedError

    existing = await repository.get_by_conversation_id_and_user_id(
        session, conversation_id, user_id
    )
    if existing is not None:
        return existing
    if provider is None:
        raise SessionSummaryGenerationError

    messages = await conversation_repository.get_recent_by_conversation_id(
        session, conversation_id, limit=SUMMARY_MESSAGE_LIMIT
    )
    if not messages:
        raise SessionSummaryGenerationError
    try:
        content, _result = await provider.generate_structured(
            list(reversed(_provider_messages(messages))),
            system_instruction=build_summary_instruction(conversation),
            response_model=SessionSummaryContent,
        )
    except (AIProviderError, ValueError, TypeError) as exc:
        logger.warning(
            "Session summary generation failed",
            extra={"mode": conversation.mode, "error_type": type(exc).__name__},
        )
        raise SessionSummaryGenerationError from exc

    summary = SessionSummary(
        conversation_id=conversation.id,
        user_id=user_id,
        session_mode=conversation.mode,
        **content.model_dump(),
    )
    try:
        await repository.create(session, summary)
        await session.commit()
    except Exception as exc:
        await session.rollback()
        logger.warning(
            "Session summary persistence failed",
            extra={"mode": conversation.mode, "error_type": type(exc).__name__},
        )
        raise SessionSummaryGenerationError from exc
    return summary
