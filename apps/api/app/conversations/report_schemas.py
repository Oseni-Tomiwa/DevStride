from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.progress.schemas import ProgressRecommendationResponse
from app.realtime.schemas import LiveAnalyticsResponse
from app.session_summaries.schemas import SessionSummaryResponse


class ReportContextResponse(BaseModel):
    title: str
    status: Literal["active", "completed", "archived"]


class PracticeReportResponse(BaseModel):
    conversation_id: UUID
    mode: Literal["mentor", "interview", "team"]
    transport: str | None
    completion_status: Literal["completed", "in_progress"]
    completed_at: datetime | None
    goal: ReportContextResponse | None
    focus: ReportContextResponse | None
    evidence_status: Literal["available", "insufficient", "unavailable"]
    summary: SessionSummaryResponse | None
    analytics: LiveAnalyticsResponse | None
    recommendation: ProgressRecommendationResponse | None
