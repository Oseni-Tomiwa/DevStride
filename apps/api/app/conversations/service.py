from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations import repository
from app.conversations.models import Conversation, Message
from app.conversations.schemas import (
    ConversationCreateRequest,
    ConversationPatchRequest,
    MessageCreateRequest,
)


class ConversationNotFoundError(Exception):
    pass


async def create_conversation(
    session: AsyncSession, user_id: UUID, data: ConversationCreateRequest
) -> Conversation:
    conversation = Conversation(user_id=user_id, **data.model_dump())
    await repository.create_conversation(session, conversation)
    await session.commit()
    return conversation


async def get_conversation(
    session: AsyncSession, user_id: UUID, conversation_id: UUID
) -> Conversation:
    conversation = await repository.get_by_id_and_user_id(session, conversation_id, user_id)
    if conversation is None:
        raise ConversationNotFoundError
    return conversation


async def list_conversations(session: AsyncSession, user_id: UUID) -> list[Conversation]:
    return await repository.list_by_user_id(session, user_id)


async def rename_conversation(
    session: AsyncSession,
    user_id: UUID,
    conversation_id: UUID,
    data: ConversationPatchRequest,
) -> Conversation:
    conversation = await get_conversation(session, user_id, conversation_id)
    await repository.update_title(session, conversation, data.title)
    await session.commit()
    return conversation


async def delete_conversation(session: AsyncSession, user_id: UUID, conversation_id: UUID) -> None:
    await get_conversation(session, user_id, conversation_id)
    deleted = await repository.delete_by_id_and_user_id(session, conversation_id, user_id)
    if not deleted:
        raise ConversationNotFoundError
    await session.commit()


async def add_user_message(
    session: AsyncSession,
    user_id: UUID,
    conversation_id: UUID,
    data: MessageCreateRequest,
) -> Message:
    await get_conversation(session, user_id, conversation_id)
    message = Message(
        conversation_id=conversation_id,
        role="user",
        content=data.content,
    )
    await repository.create_message(session, message)
    await session.commit()
    return message


async def list_conversation_messages(
    session: AsyncSession, user_id: UUID, conversation_id: UUID
) -> list[Message]:
    await get_conversation(session, user_id, conversation_id)
    return await repository.list_by_conversation_id(session, conversation_id)
