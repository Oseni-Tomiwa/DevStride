from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RealtimeSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conversation_id: UUID


class RealtimeSessionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_secret: str
    expires_at: int | None
    model: str


class RealtimeTranscriptTurnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(min_length=1, max_length=200)
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20_000)
    final: Literal[True]

    @field_validator("event_id", "content")
    @classmethod
    def values_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("value must not be blank")
        return value


class RealtimeTranscriptTurnResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: str


RealtimeEventType = Literal[
    "session_connected",
    "candidate_speech_started",
    "candidate_speech_finalized",
    "interviewer_speech_started",
    "interviewer_speech_finalized",
    "interruption",
    "reconnect",
    "mute",
    "unmute",
    "session_ended",
]


class RealtimeAnalyticsEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(min_length=1, max_length=200)
    event_type: RealtimeEventType
    occurred_at: datetime

    @field_validator("event_id")
    @classmethod
    def event_id_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("event_id must not be blank")
        return value


class LiveAnalyticsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    conversation_id: UUID
    candidate_speaking_ms: int | None
    interviewer_speaking_ms: int | None
    candidate_talk_share: float | None
    candidate_turn_count: int
    interviewer_turn_count: int
    average_candidate_response_ms: int | None
    longest_candidate_response_ms: int | None
    average_response_latency_ms: int | None
    interruption_count: int
    reconnect_count: int
    mute_count: int
    session_duration_ms: int | None
    finalized_word_count: int
    approximate_wpm: float | None
    filler_word_count: int
    filler_words_per_100: float | None
