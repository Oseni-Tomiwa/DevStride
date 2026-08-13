from typing import Annotated, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.dependencies import get_ai_provider
from app.ai.provider import AIProvider
from app.ai.rate_limit import require_realtime_rate_limit
from app.ai.realtime import (
    RealtimeInitializationError,
    create_realtime_call,
    create_realtime_client_secret,
)
from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.conversations import repository as conversation_repository
from app.conversations.models import Message
from app.conversations.response_service import (
    AssistantGenerationDisabledError,
    AssistantGenerationError,
    InterviewStartNotAllowedError,
    complete_live_interview,
)
from app.conversations.service import ConversationNotFoundError, get_conversation
from app.core.config import settings
from app.database.session import get_db_session
from app.goals.repository import get_focus_by_id_owned
from app.interviews.prompts import build_interview_instruction
from app.profiles.service import ProfileNotFoundError, get_profile
from app.realtime.analytics import compute_live_analytics, get_live_analytics, now_utc
from app.realtime.repository import create_or_get_event
from app.realtime.schemas import (
    LiveAnalyticsResponse,
    RealtimeAnalyticsEventRequest,
    RealtimeSessionRequest,
    RealtimeSessionResponse,
    RealtimeTranscriptTurnRequest,
    RealtimeTranscriptTurnResponse,
)

router = APIRouter(prefix="/api/v1/realtime", tags=["realtime"])
Session = Annotated[AsyncSession, Depends(get_db_session)]
AuthenticatedUser = Annotated[CurrentUser, Depends(get_current_user)]
RealtimeRateLimit = Annotated[None, Depends(require_realtime_rate_limit)]
TranscriptRateLimit = Annotated[None, Depends(require_realtime_rate_limit)]


async def _owned_live_conversation(
    session: AsyncSession,
    user_id: UUID,
    conversation_id: UUID,
    *,
    allow_completed: bool = False,
):
    if not settings.live_interview_enabled:
        raise HTTPException(status_code=503, detail="Realtime Practice is currently disabled")
    try:
        conversation = await get_conversation(session, user_id, conversation_id)
    except ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation not found") from None
    if conversation.mode != "interview":
        raise HTTPException(status_code=409, detail="Realtime Practice requires Interview Mode")
    metadata = conversation.metadata_ or {}
    if metadata.get("interview_transport", "text") != "live_voice":
        raise HTTPException(
            status_code=409, detail="This interview is configured for text practice"
        )
    if conversation.status not in {None, "active"} or (
        metadata.get("interview_completed") and not allow_completed
    ):
        raise HTTPException(status_code=409, detail="This interview is no longer available")
    if (
        conversation.focus_area_id is not None
        and await get_focus_by_id_owned(session, user_id, conversation.focus_area_id) is None
    ):
        raise HTTPException(status_code=409, detail="This practice focus is no longer available")
    return conversation


@router.post("/sessions", response_model=RealtimeSessionResponse)
async def create_session(
    data: RealtimeSessionRequest,
    session: Session,
    current_user: AuthenticatedUser,
    _rate_limit: RealtimeRateLimit,
) -> RealtimeSessionResponse:
    if not settings.live_interview_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Realtime Practice is currently disabled",
        )
    try:
        conversation = await get_conversation(session, current_user.id, data.conversation_id)
    except ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation not found") from None
    if conversation.mode != "interview":
        raise HTTPException(
            status_code=409,
            detail="Realtime Practice is only available for Interview Mode conversations",
        )
    metadata = conversation.metadata_
    if metadata.get("interview_transport", "text") != "live_voice":
        raise HTTPException(
            status_code=409,
            detail="This interview is configured for text practice",
        )
    if conversation.status not in {None, "active"} or metadata.get("interview_completed"):
        raise HTTPException(status_code=409, detail="This interview is no longer available")
    if conversation.focus_area_id is not None:
        focus = await get_focus_by_id_owned(session, current_user.id, conversation.focus_area_id)
        if focus is None:
            raise HTTPException(
                status_code=409, detail="This practice focus is no longer available"
            )
    try:
        profile = await get_profile(session, current_user.id)
    except ProfileNotFoundError:
        raise HTTPException(
            status_code=409,
            detail="Complete onboarding before using Realtime Practice",
        ) from None
    if settings.openai_api_key is None:
        raise HTTPException(
            status_code=503,
            detail="Realtime Practice is currently unavailable",
        )

    instructions = (
        build_interview_instruction(profile, metadata, saved_memory="")
        + """

Realtime voice behavior:
- Speak as the interviewer, not as a tutor.
- When the realtime session starts without a candidate turn, greet the candidate
  briefly and ask the first interview question immediately.
- Ask one question at a time and wait for the candidate to finish speaking.
- Use realistic, concise follow-ups and do not reveal hidden evaluation.
- Do not provide answers during the interview.
- If the candidate explicitly ends the interview, acknowledge that request briefly.
"""
    )
    try:
        client_secret, expires_at = await create_realtime_client_secret(
            settings.openai_api_key,
            settings.live_interview_model,
            instructions,
        )
    except RealtimeInitializationError:
        raise HTTPException(
            status_code=502,
            detail="Realtime Practice could not be connected",
        ) from None
    return RealtimeSessionResponse(
        client_secret=client_secret,
        expires_at=expires_at,
        model=settings.live_interview_model,
    )


@router.post("/sessions/{conversation_id}/connect")
async def connect_session(
    conversation_id: UUID,
    request: Request,
    session: Session,
    current_user: AuthenticatedUser,
    _rate_limit: RealtimeRateLimit,
) -> Response:
    conversation = await _owned_live_conversation(session, current_user.id, conversation_id)
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    offer_sdp = await request.body()
    if content_type != "application/sdp" or len(offer_sdp) > 200_000:
        raise HTTPException(status_code=415, detail="A valid SDP offer is required")
    try:
        offer = offer_sdp.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=415, detail="A valid SDP offer is required") from None
    if not offer or not offer.startswith("v=0"):
        raise HTTPException(status_code=400, detail="A valid SDP offer is required")
    try:
        profile = await get_profile(session, current_user.id)
    except ProfileNotFoundError:
        raise HTTPException(
            status_code=409, detail="Complete onboarding before using Realtime Practice"
        ) from None
    if settings.openai_api_key is None:
        raise HTTPException(status_code=503, detail="Realtime Practice is currently unavailable")
    instructions = (
        build_interview_instruction(profile, conversation.metadata_, saved_memory="")
        + """

Realtime voice behavior:
- Speak as the interviewer, not as a tutor.
- When the realtime session starts without a candidate turn, greet the candidate
  briefly and ask the first interview question immediately.
- Ask one question at a time and wait for the candidate to finish speaking.
- Use realistic, concise follow-ups and do not reveal hidden evaluation.
- Do not provide answers during the interview.
- If the candidate explicitly ends the interview, acknowledge that request briefly.
"""
    )
    try:
        answer = await create_realtime_call(
            settings.openai_api_key,
            offer,
            settings.live_interview_model,
            instructions,
        )
    except RealtimeInitializationError:
        raise HTTPException(
            status_code=502, detail="Realtime Practice could not be connected"
        ) from None
    return Response(content=answer, status_code=201, media_type="application/sdp")


@router.post(
    "/sessions/{conversation_id}/transcript-turns",
    response_model=RealtimeTranscriptTurnResponse,
    status_code=status.HTTP_201_CREATED,
)
async def persist_transcript_turn(
    conversation_id: UUID,
    data: RealtimeTranscriptTurnRequest,
    session: Session,
    current_user: AuthenticatedUser,
    _rate_limit: TranscriptRateLimit,
) -> RealtimeTranscriptTurnResponse:
    await _owned_live_conversation(session, current_user.id, conversation_id)
    message = Message(
        conversation_id=conversation_id,
        role=data.role,
        content=data.content,
        provider_event_id=data.event_id,
        metadata_={},
    )
    message = await conversation_repository.create_or_get_transcript_message(session, message)
    conversation = await get_conversation(session, current_user.id, conversation_id)
    conversation_repository.touch_conversation_activity(conversation)
    await session.commit()
    return RealtimeTranscriptTurnResponse(
        id=str(message.id),
        conversation_id=str(message.conversation_id),
        role=cast(Literal["user", "assistant"], message.role),
        content=message.content,
        created_at=message.created_at.isoformat(),
    )


@router.post(
    "/sessions/{conversation_id}/analytics-events",
    status_code=status.HTTP_201_CREATED,
)
async def persist_analytics_event(
    conversation_id: UUID,
    data: RealtimeAnalyticsEventRequest,
    session: Session,
    current_user: AuthenticatedUser,
    _rate_limit: TranscriptRateLimit,
) -> dict[str, str]:
    await _owned_live_conversation(session, current_user.id, conversation_id)
    await create_or_get_event(
        session,
        conversation_id=conversation_id,
        user_id=current_user.id,
        event_id=data.event_id,
        event_type=data.event_type,
        occurred_at=data.occurred_at,
    )
    await session.commit()
    return {"status": "recorded"}


@router.get(
    "/sessions/{conversation_id}/analytics",
    response_model=LiveAnalyticsResponse,
)
async def get_analytics(
    conversation_id: UUID,
    session: Session,
    current_user: AuthenticatedUser,
) -> LiveAnalyticsResponse:
    await _owned_live_conversation(session, current_user.id, conversation_id, allow_completed=True)
    analytics = await get_live_analytics(session, current_user.id, conversation_id)
    if analytics is None:
        raise HTTPException(status_code=404, detail="Live analytics not available")
    return LiveAnalyticsResponse.model_validate(analytics)


@router.post(
    "/sessions/{conversation_id}/end",
    response_model=RealtimeTranscriptTurnResponse,
)
async def end_live_interview(
    conversation_id: UUID,
    session: Session,
    current_user: AuthenticatedUser,
    provider: Annotated[AIProvider | None, Depends(get_ai_provider)],
) -> RealtimeTranscriptTurnResponse:
    await _owned_live_conversation(session, current_user.id, conversation_id, allow_completed=True)
    try:
        message = await complete_live_interview(session, current_user.id, conversation_id, provider)
    except AssistantGenerationDisabledError:
        raise HTTPException(
            status_code=503, detail="Assistant generation is currently disabled"
        ) from None
    except (AssistantGenerationError, InterviewStartNotAllowedError):
        raise HTTPException(
            status_code=409, detail="The interview could not be completed"
        ) from None
    await create_or_get_event(
        session,
        conversation_id=conversation_id,
        user_id=current_user.id,
        event_id=f"server-session-ended-{conversation_id}",
        event_type="session_ended",
        occurred_at=now_utc(),
    )
    await session.commit()
    await compute_live_analytics(session, current_user.id, conversation_id)
    return RealtimeTranscriptTurnResponse(
        id=str(message.id),
        conversation_id=str(message.conversation_id),
        role="assistant",
        content=message.content,
        created_at=message.created_at.isoformat(),
    )
