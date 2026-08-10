from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.database.session import get_db_session
from app.progress.schemas import ProgressSummaryResponse
from app.progress.service import get_progress_summary

router = APIRouter(prefix="/api/v1/progress", tags=["progress"])
Session = Annotated[AsyncSession, Depends(get_db_session)]
AuthenticatedUser = Annotated[CurrentUser, Depends(get_current_user)]


@router.get("", response_model=ProgressSummaryResponse)
async def summary(session: Session, current_user: AuthenticatedUser) -> ProgressSummaryResponse:
    return await get_progress_summary(session, current_user.id)
