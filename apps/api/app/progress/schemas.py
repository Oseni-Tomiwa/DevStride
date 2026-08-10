from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

ProgressMode = Literal["general", "mentor", "interview"]


class ProgressSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    mode: ProgressMode
    interview_type: str | None
    interview_focus: str | None
    updated_at: datetime
    message_count: int
    has_messages: bool
    interview_started: bool
    interview_completed: bool
    has_final_assessment: bool
    summary_available: bool


class ProgressSummaryResponse(BaseModel):
    total_sessions: int
    mentor_sessions: int
    interview_sessions: int
    general_sessions: int
    recent_sessions: list[ProgressSessionResponse]
