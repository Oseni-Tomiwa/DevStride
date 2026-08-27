from typing import Annotated, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.concurrency import require_realtime_concurrency
from app.ai.dependencies import get_ai_provider
from app.ai.latency import get_or_create_trace
from app.ai.provider import AIProvider
from app.ai.rate_limit import consume_realtime_rate_limit
from app.ai.realtime import (
    RealtimeInitializationError,
    create_realtime_call,
    create_realtime_client_secret,
)
from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.conversations import repository as conversation_repository
from app.conversations.evidence import is_meaningful_user_content
from app.conversations.models import Conversation, Message
from app.conversations.response_service import (
    AssistantGenerationDisabledError,
    AssistantGenerationError,
    InterviewStartNotAllowedError,
    complete_live_interview,
)
from app.conversations.service import ConversationNotFoundError, get_conversation
from app.core.config import settings
from app.database.session import get_db_session
from app.goals.context import resolve_conversation_goal_context
from app.goals.repository import get_focus_by_id_owned
from app.interviews.prompts import build_interview_instruction
from app.memory.service import memory_context, retrieve_for_prompt
from app.mentor.prompts import build_mentor_instruction
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
from app.session_summaries.service import (
    SessionSummaryGenerationError,
    generate_summary,
)

router = APIRouter(prefix="/api/v1/realtime", tags=["realtime"])
Session = Annotated[AsyncSession, Depends(get_db_session)]
AuthenticatedUser = Annotated[CurrentUser, Depends(get_current_user)]
RealtimeConcurrency = Annotated[None, Depends(require_realtime_concurrency("realtime"))]


async def _owned_live_conversation(
    session: AsyncSession,
    user_id: UUID,
    conversation_id: UUID,
    *,
    mode: Literal["interview", "mentor"] | None = "interview",
    allow_completed: bool = False,
):
    try:
        conversation = await get_conversation(session, user_id, conversation_id)
    except ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation not found") from None
    resolved_mode = mode or conversation.mode
    if resolved_mode not in {"interview", "mentor"} or conversation.mode != resolved_mode:
        if mode is None and conversation.mode not in {"interview", "mentor"}:
            raise HTTPException(status_code=400, detail="Realtime Practice requires Interview Mode")
        label = "Interview Mode" if resolved_mode == "interview" else "Mentor Mode"
        raise HTTPException(status_code=400, detail=f"Live {label} requires {label}")
    metadata = conversation.metadata_ or {}
    transport_key = "interview_transport" if resolved_mode == "interview" else "mentor_transport"
    if metadata.get(transport_key, "text") not in {"live_voice", "video"}:
        raise HTTPException(
            status_code=409,
            detail=f"This {resolved_mode} conversation is configured for text practice",
        )
    completion_key = "interview_completed" if resolved_mode == "interview" else "mentor_completed"
    if conversation.status not in {None, "active"} or (
        metadata.get(completion_key) and not allow_completed
    ):
        raise HTTPException(
            status_code=409,
            detail=f"This {resolved_mode} session is no longer available",
        )
    if (
        conversation.focus_area_id is not None
        and await get_focus_by_id_owned(session, user_id, conversation.focus_area_id) is None
    ):
        raise HTTPException(status_code=409, detail="This practice focus is no longer available")
    return conversation


async def _live_instructions(
    session: AsyncSession, user_id: UUID, conversation: Conversation, mode: str
) -> str:
    profile = await get_profile(session, user_id)
    goal_context = (
        await resolve_conversation_goal_context(session, user_id, conversation.id)
        if conversation.focus_area_id is not None
        else None
    )
    if mode == "mentor":
        try:
            memories = await retrieve_for_prompt(session, user_id)
        except Exception:
            memories = []
        return (
            build_mentor_instruction(profile, memory_context(memories), goal_context)
            + """

Live Mentor voice behavior:
- Speak as a patient, conversational mentor, not an interviewer.
- Greet the learner naturally, then ask what they want to work on unless the
  linked goal context gives a clear starting point.
- Explain concepts at the learner's level, ask clarifying questions, and offer
  examples or exercises when useful.
- Coach through reasoning without pretending to know facts not in the profile,
  conversation, goal, or approved memory context.
- Current explicit user input has priority over saved context.
"""
        )
    return (
        build_interview_instruction(
            profile,
            conversation.metadata_,
            saved_memory="",
            goal_context=goal_context,
        )
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


def _require_video_enabled() -> None:
    if not settings.video_interview_enabled:
        raise HTTPException(status_code=503, detail="Video Interview is currently disabled")


def _require_realtime_enabled() -> None:
    if not settings.live_interview_enabled:
        raise HTTPException(status_code=503, detail="Realtime Practice is currently disabled")


@router.post("/sessions", response_model=RealtimeSessionResponse)
async def create_session(
    data: RealtimeSessionRequest,
    session: Session,
    current_user: AuthenticatedUser,
    _concurrency: RealtimeConcurrency,
) -> RealtimeSessionResponse:
    try:
        conversation = await get_conversation(session, current_user.id, data.conversation_id)
    except ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation not found") from None
    if conversation.mode not in {"interview", "mentor"}:
        raise HTTPException(
            status_code=400,
            detail="Live voice is only available for Mentor Mode or Interview Mode conversations",
        )
    metadata = conversation.metadata_
    transport_key = (
        "interview_transport" if conversation.mode == "interview" else "mentor_transport"
    )
    transport = metadata.get(transport_key, "text")
    if transport not in {"live_voice", "video"}:
        raise HTTPException(
            status_code=409,
            detail=f"This {conversation.mode} conversation is configured for text practice",
        )
    completion_key = (
        "interview_completed" if conversation.mode == "interview" else "mentor_completed"
    )
    if conversation.status not in {None, "active"} or metadata.get(completion_key):
        raise HTTPException(
            status_code=409,
            detail=f"This {conversation.mode} session is no longer available",
        )
    if conversation.focus_area_id is not None:
        focus = await get_focus_by_id_owned(session, current_user.id, conversation.focus_area_id)
        if focus is None:
            raise HTTPException(
                status_code=409, detail="This practice focus is no longer available"
            )
    if conversation.mode == "mentor":
        if not settings.live_mentor_enabled:
            raise HTTPException(status_code=503, detail="Live Mentor is currently disabled")
        model = settings.live_mentor_model
    else:
        _require_realtime_enabled()
        if transport == "video":
            _require_video_enabled()
        model = settings.live_interview_model
    consume_realtime_rate_limit(current_user.id)
    if settings.openai_api_key is None:
        raise HTTPException(
            status_code=503,
            detail="Realtime Practice is currently unavailable",
        )

    try:
        instructions = await _live_instructions(
            session, current_user.id, conversation, conversation.mode
        )
    except ProfileNotFoundError:
        raise HTTPException(
            status_code=409,
            detail=f"Complete onboarding before using {conversation.mode.title()} Mode",
        ) from None
    try:
        client_secret, expires_at = await create_realtime_client_secret(
            settings.openai_api_key,
            model,
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
        model=model,
    )


@router.post("/sessions/{conversation_id}/connect")
async def connect_session(
    conversation_id: UUID,
    request: Request,
    session: Session,
    current_user: AuthenticatedUser,
    _concurrency: RealtimeConcurrency,
) -> Response:
    trace = get_or_create_trace("realtime", "connect")
    trace.mark("request_received")
    conversation = await _owned_live_conversation(
        session, current_user.id, conversation_id, mode=None
    )
    trace.mark("context_resolution_complete")
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
    mode = conversation.mode
    if mode == "mentor":
        if not settings.live_mentor_enabled:
            raise HTTPException(status_code=503, detail="Live Mentor is currently disabled")
        model = settings.live_mentor_model
    else:
        _require_realtime_enabled()
        if conversation.metadata_.get("interview_transport", "text") == "video":
            _require_video_enabled()
        model = settings.live_interview_model
    consume_realtime_rate_limit(current_user.id)
    if settings.openai_api_key is None:
        raise HTTPException(status_code=503, detail=f"Live {mode.title()} is currently unavailable")
    try:
        instructions = await _live_instructions(session, current_user.id, conversation, mode)
    except ProfileNotFoundError:
        raise HTTPException(
            status_code=409, detail=f"Complete onboarding before using {mode.title()} Mode"
        ) from None
    try:
        trace.mark("provider_request_started")
        answer = await create_realtime_call(
            settings.openai_api_key,
            offer,
            model,
            instructions,
        )
    except RealtimeInitializationError:
        raise HTTPException(
            status_code=502, detail="Realtime Practice could not be connected"
        ) from None
    trace.mark("provider_response_received")
    metadata = dict(conversation.metadata_ or {})
    if mode == "mentor" and not metadata.get("mentor_started"):
        metadata["mentor_started"] = True
        conversation.metadata_ = metadata
        await session.commit()
        trace.mark("persistence_complete")
    else:
        trace.mark("persistence_complete")
    trace.mark("response_returned")
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
) -> RealtimeTranscriptTurnResponse:
    await _owned_live_conversation(session, current_user.id, conversation_id, mode=None)
    if data.role == "user" and not is_meaningful_user_content(data.content):
        raise HTTPException(
            status_code=422,
            detail="A meaningful transcript turn is required",
        )
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
) -> dict[str, str]:
    await _owned_live_conversation(session, current_user.id, conversation_id)
    _require_realtime_enabled()
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
    _require_realtime_enabled()
    analytics = await get_live_analytics(session, current_user.id, conversation_id)
    if analytics is None:
        raise HTTPException(status_code=404, detail="Live analytics not available")
    return LiveAnalyticsResponse.model_validate(analytics)


@router.post(
    "/sessions/{conversation_id}/end",
)
async def end_live_interview(
    conversation_id: UUID,
    session: Session,
    current_user: AuthenticatedUser,
    provider: Annotated[AIProvider | None, Depends(get_ai_provider)],
) -> RealtimeTranscriptTurnResponse | dict[str, str]:
    conversation = await _owned_live_conversation(
        session, current_user.id, conversation_id, mode=None, allow_completed=True
    )
    if conversation.mode == "mentor":
        if not settings.live_mentor_enabled:
            raise HTTPException(status_code=503, detail="Live Mentor is currently disabled")
        try:
            summary = await generate_summary(session, current_user.id, conversation_id, provider)
        except SessionSummaryGenerationError:
            raise HTTPException(
                status_code=409, detail="Live Mentor could not be completed"
            ) from None
        metadata = dict(conversation.metadata_ or {})
        metadata["mentor_completed"] = True
        conversation.metadata_ = metadata
        await session.commit()
        return {"status": "ended", "summary_id": str(summary.id)}

    _require_realtime_enabled()
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
