from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

SummaryMode = Literal["mentor", "interview", "team"]


def _clean_items(value: list[str]) -> list[str]:
    cleaned = [item.strip() for item in value]
    if any(not item for item in cleaned):
        raise ValueError("summary items must not be blank")
    return cleaned


class SessionSummaryContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(min_length=1, max_length=2_000)
    topics_covered: list[str] = Field(default_factory=list, max_length=20)
    strengths: list[str] = Field(default_factory=list, max_length=20)
    weaknesses: list[str] = Field(default_factory=list, max_length=20)
    recommended_next_steps: list[str] = Field(default_factory=list, max_length=20)
    concepts_practiced: list[str] | None = Field(default=None, max_length=20)
    exercises_completed: list[str] | None = Field(default=None, max_length=20)
    correctness_rating: int | None = Field(default=None, ge=1, le=5)
    clarity_rating: int | None = Field(default=None, ge=1, le=5)
    depth_rating: int | None = Field(default=None, ge=1, le=5)
    reasoning_rating: int | None = Field(default=None, ge=1, le=5)

    @field_validator(
        "topics_covered",
        "strengths",
        "weaknesses",
        "recommended_next_steps",
        "concepts_practiced",
        "exercises_completed",
    )
    @classmethod
    def items_must_be_clean(cls, value: list[str] | None) -> list[str] | None:
        return _clean_items(value) if value is not None else None


class SessionSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conversation_id: UUID
    session_mode: SummaryMode
    summary: str
    topics_covered: list[str]
    strengths: list[str]
    weaknesses: list[str]
    recommended_next_steps: list[str]
    concepts_practiced: list[str] | None
    exercises_completed: list[str] | None
    correctness_rating: int | None
    clarity_rating: int | None
    depth_rating: int | None
    reasoning_rating: int | None
    created_at: datetime
    updated_at: datetime
