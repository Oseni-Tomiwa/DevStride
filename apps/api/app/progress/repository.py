from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations.models import Conversation, Message


async def get_progress_rows(
    session: AsyncSession, user_id: UUID
) -> list[tuple[Conversation, int, str | None]]:
    message_count = func.count(Message.id).label("message_count")
    first_user_content = (
        select(Message.content)
        .where(Message.conversation_id == Conversation.id, Message.role == "user")
        .order_by(Message.created_at.asc(), Message.id.asc())
        .limit(1)
        .scalar_subquery()
        .label("first_user_content")
    )
    result = await session.execute(
        select(Conversation, message_count, first_user_content)
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.user_id == user_id)
        .group_by(Conversation.id)
        .order_by(Conversation.updated_at.desc(), Conversation.created_at.desc())
    )
    return [
        (conversation, int(message_count_value), first_user_content_value)
        for conversation, message_count_value, first_user_content_value in result.all()
    ]
