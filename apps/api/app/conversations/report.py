from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations import repository as conversation_repository
from app.conversations.evidence import has_meaningful_user_evidence
from app.conversations.models import Conversation
from app.goals.models import Goal, GoalFocusArea
from app.progress import service as progress_service
from app.realtime.analytics import get_live_analytics
from app.realtime.schemas import LiveAnalyticsResponse
from app.session_summaries import repository as summary_repository
from app.session_summaries.schemas import SessionSummaryResponse


class PracticeReportNotFoundError(Exception):
    pass


class ReportGoalContext:
    def __init__(self, title: str, status: str) -> None:
        self.title = title
        self.status = status


class ReportFocusContext:
    def __init__(self, title: str, status: str) -> None:
        self.title = title
        self.status = status


class PracticeReport:
    def __init__(
        self,
        *,
        conversation: Conversation,
        summary: SessionSummaryResponse | None,
        analytics: LiveAnalyticsResponse | None,
        goal: ReportGoalContext | None,
        focus: ReportFocusContext | None,
        evidence_status: Literal["available", "insufficient", "unavailable"],
        recommendation: object | None,
        completed_at: datetime | None,
    ) -> None:
        self.conversation_id = conversation.id
        self.mode = conversation.mode
        self.transport = _transport(conversation)
        self.completion_status = "completed" if completed_at is not None else "in_progress"
        self.completed_at = completed_at
        self.goal = goal
        self.focus = focus
        self.evidence_status = evidence_status
        self.summary = summary
        self.analytics = analytics
        self.recommendation = recommendation


def _transport(conversation: Conversation) -> str | None:
    value = conversation.metadata_.get(
        "interview_transport" if conversation.mode == "interview" else "mentor_transport"
    )
    return value if isinstance(value, str) else None


async def _goal_context(
    session: AsyncSession, user_id: UUID, focus_area_id: UUID | None
) -> tuple[ReportGoalContext | None, ReportFocusContext | None]:
    if focus_area_id is None:
        return None, None
    result = await session.execute(
        select(Goal, GoalFocusArea)
        .join(GoalFocusArea, GoalFocusArea.goal_id == Goal.id)
        .where(
            GoalFocusArea.id == focus_area_id,
            Goal.user_id == user_id,
        )
    )
    row = result.one_or_none()
    if row is None:
        return None, None
    goal, focus = row
    return ReportGoalContext(goal.title, goal.status), ReportFocusContext(focus.title, focus.status)


async def get_practice_report(
    session: AsyncSession, user_id: UUID, conversation_id: UUID
) -> PracticeReport:
    conversation = await conversation_repository.get_by_id_and_user_id(
        session, conversation_id, user_id
    )
    if conversation is None or conversation.mode not in {"mentor", "interview", "team"}:
        raise PracticeReportNotFoundError

    messages = await conversation_repository.get_recent_by_conversation_id(
        session, conversation_id, limit=40
    )
    summary_model = await summary_repository.get_by_conversation_id_and_user_id(
        session, conversation_id, user_id
    )
    summary = SessionSummaryResponse.model_validate(summary_model) if summary_model else None
    analytics_model = None
    if conversation.mode == "interview" and _transport(conversation) == "live_voice":
        analytics_model = await get_live_analytics(session, user_id, conversation_id)
    analytics = LiveAnalyticsResponse.model_validate(analytics_model) if analytics_model else None

    meaningful = has_meaningful_user_evidence(messages)
    if not meaningful:
        evidence_status: Literal["available", "insufficient", "unavailable"] = "insufficient"
    elif summary is None:
        evidence_status = "unavailable"
    else:
        evidence_status = "available"

    completed_at = summary.updated_at if summary else None
    if completed_at is None and analytics is not None:
        completed_at = conversation.updated_at

    progress = await progress_service.get_progress_summary(session, user_id)
    goal, focus = await _goal_context(session, user_id, conversation.focus_area_id)
    return PracticeReport(
        conversation=conversation,
        summary=summary,
        analytics=analytics,
        goal=goal,
        focus=focus,
        evidence_status=evidence_status,
        recommendation=progress.recommendation,
        completed_at=completed_at,
    )
