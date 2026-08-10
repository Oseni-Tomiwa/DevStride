from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.dependencies import get_ai_provider
from app.ai.provider import AIProvider
from app.ai.rate_limit import require_ai_rate_limit
from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.database.session import get_db_session
from app.session_summaries.schemas import SessionSummaryResponse
from app.session_summaries.service import (
    SessionSummaryGenerationError,
    SessionSummaryNotAllowedError,
    SessionSummaryNotFoundError,
    generate_summary,
    get_summary,
)

router = APIRouter(prefix="/api/v1/conversations", tags=["session summaries"])
Session = Annotated[AsyncSession, Depends(get_db_session)]
AuthenticatedUser = Annotated[CurrentUser, Depends(get_current_user)]
Provider = Annotated[AIProvider | None, Depends(get_ai_provider)]
SummaryRateLimit = Annotated[None, Depends(require_ai_rate_limit("summary"))]


@router.get("/{conversation_id}/summary", response_model=SessionSummaryResponse)
async def get_one(
    conversation_id: UUID, session: Session, current_user: AuthenticatedUser
) -> SessionSummaryResponse:
    try:
        summary = await get_summary(session, current_user.id, conversation_id)
    except SessionSummaryNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Summary not found"
        ) from None
    return SessionSummaryResponse.model_validate(summary)


@router.post(
    "/{conversation_id}/summary",
    response_model=SessionSummaryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create(
    conversation_id: UUID,
    session: Session,
    current_user: AuthenticatedUser,
    provider: Provider,
    _rate_limit: SummaryRateLimit,
) -> SessionSummaryResponse:
    try:
        summary = await generate_summary(session, current_user.id, conversation_id, provider)
    except SessionSummaryNotAllowedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Summaries are only available for Mentor, Interview, and Team Practice sessions",
        ) from None
    except SessionSummaryGenerationError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The session summary could not be generated. Please try again.",
        ) from None
    return SessionSummaryResponse.model_validate(summary)
