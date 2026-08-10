from typing import Any, cast
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations.models import Conversation, Message


async def create_conversation(session: AsyncSession, conversation: Conversation) -> Conversation:
    session.add(conversation)
    await session.flush()
    await session.refresh(conversation)
    return conversation


async def get_by_id_and_user_id(
    session: AsyncSession, conversation_id: UUID, user_id: UUID
) -> Conversation | None:
    result = await session.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_by_id_and_user_id_for_update(
    session: AsyncSession, conversation_id: UUID, user_id: UUID
) -> Conversation | None:
    result = await session.execute(
        select(Conversation)
        .where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
        )
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def list_by_user_id(session: AsyncSession, user_id: UUID) -> list[Conversation]:
    result = await session.execute(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.updated_at.desc(), Conversation.created_at.desc())
    )
    return list(result.scalars().all())


async def first_user_message_by_conversation_id(
    session: AsyncSession, conversation_id: UUID
) -> Message | None:
    result = await session.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id, Message.role == "user")
        .order_by(Message.created_at.asc(), Message.id.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def update_title(
    session: AsyncSession, conversation: Conversation, title: str
) -> Conversation:
    conversation.title = title
    await session.flush()
    await session.refresh(conversation)
    return conversation


async def delete_by_id_and_user_id(
    session: AsyncSession, conversation_id: UUID, user_id: UUID
) -> bool:
    result = cast(
        CursorResult[Any],
        await session.execute(
            delete(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
            )
        ),
    )
    return result.rowcount > 0


async def create_message(session: AsyncSession, message: Message) -> Message:
    session.add(message)
    await session.flush()
    await session.refresh(message)
    return message


async def get_message_by_id_and_conversation_id(
    session: AsyncSession, message_id: UUID, conversation_id: UUID
) -> Message | None:
    result = await session.execute(
        select(Message).where(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
        )
    )
    return result.scalar_one_or_none()


async def has_assistant_after_message(session: AsyncSession, message: Message) -> bool:
    result = await session.execute(
        select(Message.id)
        .where(
            Message.conversation_id == message.conversation_id,
            Message.role == "assistant",
            (
                (Message.created_at > message.created_at)
                | ((Message.created_at == message.created_at) & (Message.id > message.id))
            ),
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def list_by_conversation_id(session: AsyncSession, conversation_id: UUID) -> list[Message]:
    result = await session.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
    )
    return list(result.scalars().all())


async def get_recent_by_conversation_id(
    session: AsyncSession, conversation_id: UUID, limit: int = 20
) -> list[Message]:
    result = await session.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all())
