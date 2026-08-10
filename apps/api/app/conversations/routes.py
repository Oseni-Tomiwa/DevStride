import json
from collections.abc import AsyncIterator
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.dependencies import get_ai_provider
from app.ai.provider import AIProvider
from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.conversations.response_service import (
    AssistantGenerationDisabledError,
    AssistantGenerationError,
    StreamAssistantDelta,
    StreamUserMessage,
    generate_response,
    stream_response,
)
from app.conversations.schemas import (
    ConversationCreateRequest,
    ConversationPatchRequest,
    ConversationResponse,
    MessageCreateRequest,
    MessageResponse,
    RespondRequest,
    RespondResponse,
)
from app.conversations.service import (
    ConversationNotFoundError,
    add_user_message,
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversation_messages,
    list_conversations,
    rename_conversation,
)
from app.database.session import get_db_session

router = APIRouter(prefix="/api/v1/conversations", tags=["conversations"])
Session = Annotated[AsyncSession, Depends(get_db_session)]
AuthenticatedUser = Annotated[CurrentUser, Depends(get_current_user)]
Provider = Annotated[AIProvider | None, Depends(get_ai_provider)]


@router.post(
    "",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create(
    data: ConversationCreateRequest,
    session: Session,
    current_user: AuthenticatedUser,
) -> ConversationResponse:
    conversation = await create_conversation(session, current_user.id, data)
    return ConversationResponse.model_validate(conversation)


@router.get("", response_model=list[ConversationResponse])
async def list_all(session: Session, current_user: AuthenticatedUser) -> list[ConversationResponse]:
    conversations = await list_conversations(session, current_user.id)
    return [ConversationResponse.model_validate(item) for item in conversations]


@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_one(
    conversation_id: UUID,
    session: Session,
    current_user: AuthenticatedUser,
) -> ConversationResponse:
    try:
        conversation = await get_conversation(session, current_user.id, conversation_id)
    except ConversationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        ) from None
    return ConversationResponse.model_validate(conversation)


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def rename(
    conversation_id: UUID,
    data: ConversationPatchRequest,
    session: Session,
    current_user: AuthenticatedUser,
) -> ConversationResponse:
    try:
        conversation = await rename_conversation(session, current_user.id, conversation_id, data)
    except ConversationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        ) from None
    return ConversationResponse.model_validate(conversation)


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(
    conversation_id: UUID,
    session: Session,
    current_user: AuthenticatedUser,
) -> Response:
    try:
        await delete_conversation(session, current_user.id, conversation_id)
    except ConversationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        ) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_message(
    conversation_id: UUID,
    data: MessageCreateRequest,
    session: Session,
    current_user: AuthenticatedUser,
) -> MessageResponse:
    try:
        message = await add_user_message(session, current_user.id, conversation_id, data)
    except ConversationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        ) from None
    return MessageResponse.model_validate(message)


@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
async def list_messages(
    conversation_id: UUID,
    session: Session,
    current_user: AuthenticatedUser,
) -> list[MessageResponse]:
    try:
        messages = await list_conversation_messages(session, current_user.id, conversation_id)
    except ConversationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        ) from None
    return [MessageResponse.model_validate(item) for item in messages]


@router.post(
    "/{conversation_id}/respond",
    response_model=RespondResponse,
    status_code=status.HTTP_200_OK,
)
async def respond(
    conversation_id: UUID,
    data: RespondRequest,
    session: Session,
    current_user: AuthenticatedUser,
    provider: Provider,
) -> RespondResponse:
    try:
        user_message, assistant_message = await generate_response(
            session, current_user.id, conversation_id, data, provider
        )
    except ConversationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        ) from None
    except AssistantGenerationDisabledError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Assistant generation is currently disabled",
        ) from None
    except AssistantGenerationError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Assistant generation failed. Please try again.",
        ) from None

    return RespondResponse(
        user_message=MessageResponse.model_validate(user_message),
        assistant_message=MessageResponse.model_validate(assistant_message),
    )


@router.post(
    "/{conversation_id}/stream",
    response_class=StreamingResponse,
)
async def stream(
    conversation_id: UUID,
    data: RespondRequest,
    session: Session,
    current_user: AuthenticatedUser,
    provider: Provider,
) -> StreamingResponse:
    # Validate ownership before opening the response so unowned conversations
    # receive a normal HTTP 404 rather than an SSE error after status 200.
    try:
        await get_conversation(session, current_user.id, conversation_id)
    except ConversationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        ) from None

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for event in stream_response(
                session, current_user.id, conversation_id, data, provider
            ):
                if isinstance(event, StreamUserMessage):
                    payload: dict[str, Any] = MessageResponse.model_validate(
                        event.message
                    ).model_dump(mode="json")
                    yield _sse_event("user_message", payload)
                elif isinstance(event, StreamAssistantDelta):
                    yield _sse_event("assistant_delta", {"delta": event.delta})
                else:
                    payload = MessageResponse.model_validate(event.message).model_dump(mode="json")
                    yield _sse_event("assistant_complete", payload)
        except AssistantGenerationDisabledError:
            yield _sse_event(
                "error",
                {
                    "code": "generation_disabled",
                    "message": "Assistant generation is currently disabled",
                },
            )
        except AssistantGenerationError:
            yield _sse_event(
                "error",
                {
                    "code": "generation_failed",
                    "message": "Assistant generation failed. Please try again.",
                },
            )
        finally:
            yield _sse_event("done", {})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sse_event(event: str, data: dict[str, Any]) -> str:
    """Serialize the stream contract: user_message, assistant_delta,
    assistant_complete, error, and the terminal done event.
    """
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"
