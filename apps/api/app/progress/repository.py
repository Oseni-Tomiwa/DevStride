from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations.models import Conversation, Message
from app.memory.models import MemoryRecord
from app.session_summaries.models import SessionSummary


@dataclass(frozen=True)
class ProgressRow:
    conversation: Conversation
    message_count: int
    user_turns: int
    first_user_content: str | None
    last_user_message_at: datetime | None
    summary_available: bool


@dataclass(frozen=True)
class SummaryEvidenceRow:
    summary: SessionSummary
    conversation: Conversation


async def get_progress_rows(session: AsyncSession, user_id: UUID) -> list[ProgressRow]:
    message_count = func.count(Message.id).label("message_count")
    user_turns = func.count(Message.id).filter(Message.role == "user").label("user_turns")
    last_user_message_at = (
        func.max(Message.created_at).filter(Message.role == "user").label("last_user_message_at")
    )
    first_user_content = (
        select(Message.content)
        .select_from(Message)
        .where(Message.conversation_id == Conversation.id, Message.role == "user")
        .order_by(Message.created_at.asc(), Message.id.asc())
        .limit(1)
        .correlate(Conversation)
        .scalar_subquery()
        .label("first_user_content")
    )
    summary_exists = (
        select(SessionSummary.id)
        .select_from(SessionSummary)
        .where(
            SessionSummary.conversation_id == Conversation.id,
            SessionSummary.user_id == user_id,
        )
        .correlate(Conversation)
    )
    summary_available = exists(summary_exists).label("summary_available")
    result = await session.execute(
        select(
            Conversation,
            message_count,
            user_turns,
            first_user_content,
            last_user_message_at,
            summary_available,
        )
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.user_id == user_id)
        .group_by(Conversation.id)
        .order_by(Conversation.updated_at.desc(), Conversation.created_at.desc())
    )
    rows: list[ProgressRow] = []
    for (
        conversation,
        message_count_value,
        user_turns_value,
        first_user_content_value,
        last_user_message_at_value,
        summary_available_value,
    ) in result.all():
        rows.append(
            ProgressRow(
                conversation=conversation,
                message_count=int(message_count_value),
                user_turns=int(user_turns_value),
                first_user_content=first_user_content_value,
                last_user_message_at=last_user_message_at_value,
                summary_available=bool(summary_available_value),
            )
        )
    return rows


async def get_recent_summary_evidence(
    session: AsyncSession, user_id: UUID, limit: int = 20
) -> list[SummaryEvidenceRow]:
    user_message_exists = exists(
        select(Message.id)
        .select_from(Message)
        .where(
            Message.conversation_id == Conversation.id,
            Message.role == "user",
        )
        .correlate(Conversation)
    )
    result = await session.execute(
        select(SessionSummary, Conversation)
        .join(Conversation, Conversation.id == SessionSummary.conversation_id)
        .where(
            SessionSummary.user_id == user_id,
            Conversation.user_id == user_id,
            user_message_exists,
        )
        .order_by(
            SessionSummary.updated_at.desc(),
            SessionSummary.created_at.desc(),
            SessionSummary.id.asc(),
        )
        .limit(limit)
    )
    return [
        SummaryEvidenceRow(summary=summary, conversation=conversation)
        for summary, conversation in result.all()
    ]


async def get_active_focus_memories(session: AsyncSession, user_id: UUID) -> list[MemoryRecord]:
    result = await session.execute(
        select(MemoryRecord)
        .where(
            MemoryRecord.user_id == user_id,
            MemoryRecord.status == "active",
            MemoryRecord.category.in_(("goal", "weakness")),
        )
        .order_by(
            MemoryRecord.importance.desc(),
            MemoryRecord.updated_at.desc(),
            MemoryRecord.id.asc(),
        )
    )
    return list(result.scalars().all())
