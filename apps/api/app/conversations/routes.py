import json
from collections.abc import AsyncIterator
from typing import Annotated, Any, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.dependencies import get_ai_provider
from app.ai.provider import AIProvider
from app.ai.rate_limit import require_ai_rate_limit
from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.conversations.report import PracticeReportNotFoundError, get_practice_report
from app.conversations.report_schemas import PracticeReportResponse, ReportContextResponse
from app.conversations.response_service import (
    AssistantGenerationDisabledError,
    AssistantGenerationError,
    InterviewProfileRequiredError,
    InterviewStartNotAllowedError,
    MentorProfileRequiredError,
    StreamAssistantComplete,
    StreamAssistantDelta,
    StreamInterviewPending,
    StreamTeamPending,
    StreamUserMessage,
    TeamProfileRequiredError,
    TeamStartNotAllowedError,
    generate_response,
    retry_stream_response,
    start_interview_response,
    start_team_response,
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
    RetryMessageNotFoundError,
    RetryNotAllowedError,
    add_user_message,
    conversation_display_title,
    create_conversation,
    delete_conversation,
    get_conversation,
    get_retry_message,
    list_conversation_messages,
    list_conversations,
    rename_conversation,
)
from app.database.session import get_db_session
from app.progress.schemas import ProgressRecommendationResponse

router = APIRouter(prefix="/api/v1/conversations", tags=["conversations"])
Session = Annotated[AsyncSession, Depends(get_db_session)]
AuthenticatedUser = Annotated[CurrentUser, Depends(get_current_user)]
Provider = Annotated[AIProvider | None, Depends(get_ai_provider)]
RespondRateLimit = Annotated[None, Depends(require_ai_rate_limit("respond"))]
StreamRateLimit = Annotated[None, Depends(require_ai_rate_limit("stream"))]
RetryRateLimit = Annotated[None, Depends(require_ai_rate_limit("retry"))]
KickoffRateLimit = Annotated[None, Depends(require_ai_rate_limit("kickoff"))]


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
    responses: list[ConversationResponse] = []
    for conversation in conversations:
        response = ConversationResponse.model_validate(conversation)
        response.title = await conversation_display_title(session, conversation)
        responses.append(response)
    return responses


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
    response = ConversationResponse.model_validate(conversation)
    response.title = await conversation_display_title(session, conversation)
    return response


@router.get("/{conversation_id}/report", response_model=PracticeReportResponse)
async def get_report(
    conversation_id: UUID,
    session: Session,
    current_user: AuthenticatedUser,
) -> PracticeReportResponse:
    try:
        report = await get_practice_report(session, current_user.id, conversation_id)
    except PracticeReportNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Practice report not found"
        ) from None
    return PracticeReportResponse(
        conversation_id=report.conversation_id,
        mode=cast(Literal["mentor", "interview", "team"], report.mode),
        transport=report.transport,
        completion_status=cast(Literal["completed", "in_progress"], report.completion_status),
        completed_at=report.completed_at,
        goal=(
            ReportContextResponse(
                title=report.goal.title,
                status=cast(Literal["active", "completed", "archived"], report.goal.status),
            )
            if report.goal
            else None
        ),
        focus=(
            ReportContextResponse(
                title=report.focus.title,
                status=cast(Literal["active", "completed", "archived"], report.focus.status),
            )
            if report.focus
            else None
        ),
        evidence_status=cast(
            Literal["available", "insufficient", "unavailable"], report.evidence_status
        ),
        summary=report.summary,
        analytics=report.analytics,
        recommendation=cast(ProgressRecommendationResponse | None, report.recommendation),
    )


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


@router.post(
    "/{conversation_id}/interview-start",
    response_class=StreamingResponse,
)
async def interview_start(
    conversation_id: UUID,
    session: Session,
    current_user: AuthenticatedUser,
    provider: Provider,
    _rate_limit: KickoffRateLimit,
) -> StreamingResponse:
    try:
        conversation = await get_conversation(session, current_user.id, conversation_id)
    except ConversationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        ) from None
    if conversation.mode != "interview":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Interview start is only available for Interview Mode conversations",
        )

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for event in start_interview_response(
                session, current_user.id, conversation_id, provider
            ):
                if isinstance(event, StreamAssistantDelta):
                    yield _sse_event("assistant_delta", {"delta": event.delta})
                elif isinstance(event, StreamInterviewPending):
                    yield _sse_event("interview_pending", {})
                elif isinstance(event, StreamAssistantComplete):
                    payload = MessageResponse.model_validate(event.message).model_dump(mode="json")
                    yield _sse_event("assistant_complete", payload)
        except InterviewStartNotAllowedError:
            yield _sse_event(
                "error",
                {
                    "code": "interview_start_not_allowed",
                    "message": "Interview start is not available",
                },
            )
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
        except InterviewProfileRequiredError:
            yield _sse_event(
                "error",
                {
                    "code": "interview_profile_required",
                    "message": "Complete onboarding before using Interview Mode",
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


@router.post(
    "/{conversation_id}/team-start",
    response_class=StreamingResponse,
)
async def team_start(
    conversation_id: UUID,
    session: Session,
    current_user: AuthenticatedUser,
    provider: Provider,
    _rate_limit: KickoffRateLimit,
) -> StreamingResponse:
    try:
        conversation = await get_conversation(session, current_user.id, conversation_id)
    except ConversationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        ) from None
    if conversation.mode != "team":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Team Practice start is only available for team conversations",
        )

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for event in start_team_response(
                session, current_user.id, conversation_id, provider
            ):
                if isinstance(event, StreamAssistantDelta):
                    yield _sse_event("assistant_delta", {"delta": event.delta})
                elif isinstance(event, StreamTeamPending):
                    yield _sse_event("team_pending", {})
                elif isinstance(event, StreamAssistantComplete):
                    payload = MessageResponse.model_validate(event.message).model_dump(mode="json")
                    yield _sse_event("assistant_complete", payload)
        except TeamStartNotAllowedError:
            yield _sse_event(
                "error",
                {"code": "team_start_not_allowed", "message": "Team Practice is not available"},
            )
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
        except TeamProfileRequiredError:
            yield _sse_event(
                "error",
                {
                    "code": "team_profile_required",
                    "message": "Complete onboarding before using Team Practice",
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
    _rate_limit: RespondRateLimit,
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
    except (MentorProfileRequiredError, InterviewProfileRequiredError, TeamProfileRequiredError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Complete onboarding before using this practice mode",
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
    _rate_limit: StreamRateLimit,
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
                elif isinstance(event, StreamAssistantComplete):
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
        except (
            MentorProfileRequiredError,
            InterviewProfileRequiredError,
            TeamProfileRequiredError,
        ):
            yield _sse_event(
                "error",
                {
                    "code": "profile_required",
                    "message": "Complete onboarding before using this practice mode",
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


@router.post(
    "/{conversation_id}/messages/{message_id}/retry",
    response_class=StreamingResponse,
)
async def retry_stream(
    conversation_id: UUID,
    message_id: UUID,
    session: Session,
    current_user: AuthenticatedUser,
    provider: Provider,
    _rate_limit: RetryRateLimit,
) -> StreamingResponse:
    try:
        await get_retry_message(session, current_user.id, conversation_id, message_id)
    except (ConversationNotFoundError, RetryMessageNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Message not found"
        ) from None
    except RetryNotAllowedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This message cannot be retried",
        ) from None

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for event in retry_stream_response(
                session, current_user.id, conversation_id, message_id, provider
            ):
                if isinstance(event, StreamUserMessage):
                    payload: dict[str, Any] = MessageResponse.model_validate(
                        event.message
                    ).model_dump(mode="json")
                    yield _sse_event("user_message", payload)
                elif isinstance(event, StreamAssistantDelta):
                    yield _sse_event("assistant_delta", {"delta": event.delta})
                elif isinstance(event, StreamAssistantComplete):
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
        except (
            MentorProfileRequiredError,
            InterviewProfileRequiredError,
            TeamProfileRequiredError,
        ):
            yield _sse_event(
                "error",
                {
                    "code": "profile_required",
                    "message": "Complete onboarding before using this practice mode",
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
