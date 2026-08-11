from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

ProgressMode = Literal["general", "mentor", "interview", "team"]
StructuredProgressMode = Literal["mentor", "interview", "team"]
RecommendationActivity = Literal["continue", "mentor", "interview", "team"]


class ProgressSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    mode: ProgressMode
    interview_type: str | None
    interview_focus: str | None
    team_scenario: str | None
    updated_at: datetime
    message_count: int
    has_messages: bool
    interview_started: bool
    interview_completed: bool
    has_final_assessment: bool
    summary_available: bool
    user_turns: int
    practiced: bool
    structured_completed: bool


class ModeBreakdownResponse(BaseModel):
    general: int
    mentor: int
    interview: int
    team: int


class ProgressActivityResponse(BaseModel):
    practiced_sessions: int
    completed_sessions: int
    user_turns: int
    practiced_sessions_last_30_days: int
    mode_breakdown: ModeBreakdownResponse


class ContinuePracticeResponse(BaseModel):
    conversation_id: UUID
    title: str
    mode: ProgressMode
    last_activity_at: datetime
    interview_type: str | None = None
    interview_focus: str | None = None
    team_scenario: str | None = None


class CurrentFocusResponse(BaseModel):
    basis: Literal["saved_goal", "saved_weakness", "communication_goal"]
    label: str


class ProgressEvidenceResponse(BaseModel):
    text: str
    occurrences: int
    latest_at: datetime
    modes: list[StructuredProgressMode]
    conversation_id: UUID


class RatingHistoryResponse(BaseModel):
    conversation_id: UUID
    observed_at: datetime
    interview_type: str | None
    interview_focus: str | None
    correctness: int | None
    clarity: int | None
    depth: int | None
    reasoning: int | None


class RecommendationActionResponse(BaseModel):
    kind: Literal["continue_conversation", "start_practice"]
    mode: ProgressMode
    conversation_id: UUID | None = None
    interview_type: str | None = None
    interview_focus: str | None = None
    team_scenario: str | None = None


class ProgressRecommendationResponse(BaseModel):
    activity: RecommendationActivity
    title: str
    reason: str
    evidence: list[str]
    action: RecommendationActionResponse


class ProgressSummaryResponse(BaseModel):
    # Existing compatibility fields continue to count created conversations.
    total_sessions: int
    mentor_sessions: int
    interview_sessions: int
    general_sessions: int
    team_sessions: int
    recent_sessions: list[ProgressSessionResponse]

    # Additive Progress Intelligence v1 fields.
    activity: ProgressActivityResponse
    continue_practice: ContinuePracticeResponse | None
    current_focus: CurrentFocusResponse | None
    recent_strength: ProgressEvidenceResponse | None
    recent_weakness: ProgressEvidenceResponse | None
    recurring_strengths: list[ProgressEvidenceResponse]
    recurring_weaknesses: list[ProgressEvidenceResponse]
    rating_history: list[RatingHistoryResponse]
    recommendation: ProgressRecommendationResponse
