from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations import repository
from app.conversations.models import Conversation, Message
from app.conversations.schemas import (
    ConversationCreateRequest,
    ConversationPatchRequest,
    MessageCreateRequest,
)
from app.conversations.title import DEFAULT_CONVERSATION_TITLE, derive_conversation_title


class ConversationNotFoundError(Exception):
    pass


class RetryMessageNotFoundError(Exception):
    pass


class RetryNotAllowedError(Exception):
    pass


async def create_conversation(
    session: AsyncSession,
    user_id: UUID,
    data: ConversationCreateRequest,
    *,
    focus_area_id: UUID | None = None,
) -> Conversation:
    conversation_data = data.model_dump(
        exclude={
            "interview_type",
            "interview_focus",
            "interview_transport",
            "mentor_transport",
            "team_scenario",
            "team_difficulty",
        }
    )
    if data.mode == "interview":
        conversation_data["metadata_"] = {
            "interview_type": data.interview_type,
            "interview_focus": data.interview_focus,
        }
        if data.interview_transport != "text":
            conversation_data["metadata_"]["interview_transport"] = data.interview_transport
    elif data.mode == "mentor" and data.mentor_transport == "live_voice":
        conversation_data["metadata_"] = {"mentor_transport": data.mentor_transport}
    elif data.mode == "team":
        conversation_data["metadata_"] = {
            "team_scenario": data.team_scenario,
            "team_difficulty": data.team_difficulty or "realistic",
        }
    conversation = Conversation(
        user_id=user_id,
        focus_area_id=focus_area_id,
        **conversation_data,
    )
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


async def conversation_display_title(session: AsyncSession, conversation: Conversation) -> str:
    if conversation.title != DEFAULT_CONVERSATION_TITLE:
        return conversation.title
    message = await repository.first_user_message_by_conversation_id(session, conversation.id)
    return derive_conversation_title(message.content) if message else conversation.title


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
    conversation = await get_conversation(session, user_id, conversation_id)
    message = Message(
        conversation_id=conversation_id,
        role="user",
        content=data.content,
    )
    await repository.create_message(session, message)
    repository.touch_conversation_activity(conversation)
    await session.commit()
    return message


async def get_retry_message(
    session: AsyncSession,
    user_id: UUID,
    conversation_id: UUID,
    message_id: UUID,
) -> Message:
    await get_conversation(session, user_id, conversation_id)
    message = await repository.get_message_by_id_and_conversation_id(
        session, message_id, conversation_id
    )
    if message is None:
        raise RetryMessageNotFoundError
    if message.role != "user" or await repository.has_assistant_after_message(session, message):
        raise RetryNotAllowedError
    return message


async def list_conversation_messages(
    session: AsyncSession, user_id: UUID, conversation_id: UUID
) -> list[Message]:
    await get_conversation(session, user_id, conversation_id)
    return await repository.list_by_conversation_id(session, conversation_id)
