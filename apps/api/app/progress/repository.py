from uuid import UUID

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations.models import Conversation, Message
from app.session_summaries.models import SessionSummary


async def get_progress_rows(
    session: AsyncSession, user_id: UUID
) -> list[tuple[Conversation, int, str | None, bool]]:
    message_count = func.count(Message.id).label("message_count")
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
        .where(SessionSummary.conversation_id == Conversation.id)
        .correlate(Conversation)
    )
    summary_available = exists(summary_exists).label("summary_available")
    result = await session.execute(
        select(Conversation, message_count, first_user_content, summary_available)
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.user_id == user_id)
        .group_by(Conversation.id)
        .order_by(Conversation.updated_at.desc(), Conversation.created_at.desc())
    )
    rows: list[tuple[Conversation, int, str | None, bool]] = []
    for (
        conversation,
        message_count_value,
        first_user_content_value,
        summary_available_value,
    ) in result.all():
        rows.append(
            (
                conversation,
                int(message_count_value),
                first_user_content_value,
                summary_available_value,
            )
        )
    return rows
