from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.conversations.schemas import (
    InterviewFocus,
    InterviewType,
    TeamDifficulty,
    TeamScenario,
)

GoalType = Literal[
    "interview_preparation",
    "technical_growth",
    "communication",
    "custom",
]
GoalStatus = Literal["active", "completed", "archived"]
MutableGoalStatus = Literal["active", "completed"]
FocusAreaStatus = Literal["active", "completed", "archived"]
MutableFocusAreaStatus = Literal["active", "completed"]
PracticeMode = Literal["mentor", "interview", "team"]


def _clean_required(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("value must not be blank")
    return cleaned


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


class MentorPracticeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")


class InterviewPracticeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    interview_type: InterviewType
    interview_focus: InterviewFocus | None = None

    @model_validator(mode="after")
    def behavioral_interview_has_no_technical_focus(self) -> "InterviewPracticeConfig":
        if self.interview_type == "behavioral" and self.interview_focus is not None:
            raise ValueError("interview_focus is only valid for technical interviews")
        return self


class TeamPracticeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    team_scenario: TeamScenario
    team_difficulty: TeamDifficulty


class FocusAreaInputBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(max_length=120)
    description: str | None = Field(default=None, max_length=500)

    _clean_title = field_validator("title")(_clean_required)
    _clean_description = field_validator("description")(_clean_optional)


class MentorFocusAreaInput(FocusAreaInputBase):
    practice_mode: Literal["mentor"]
    practice_config: MentorPracticeConfig = Field(default_factory=MentorPracticeConfig)


class InterviewFocusAreaInput(FocusAreaInputBase):
    practice_mode: Literal["interview"]
    practice_config: InterviewPracticeConfig


class TeamFocusAreaInput(FocusAreaInputBase):
    practice_mode: Literal["team"]
    practice_config: TeamPracticeConfig


FocusAreaCreateRequest = Annotated[
    MentorFocusAreaInput | InterviewFocusAreaInput | TeamFocusAreaInput,
    Field(discriminator="practice_mode"),
]


class GoalCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    goal_type: GoalType
    focus_areas: list[FocusAreaCreateRequest] = Field(min_length=1, max_length=6)

    _clean_title = field_validator("title")(_clean_required)
    _clean_description = field_validator("description")(_clean_optional)


class GoalPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    goal_type: GoalType | None = None
    status: MutableGoalStatus | None = None

    @field_validator("title", "goal_type", "status", mode="before")
    @classmethod
    def supplied_non_nullable_fields_cannot_be_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("field cannot be null")
        return value

    _clean_title = field_validator("title")(_clean_required)
    _clean_description = field_validator("description")(_clean_optional)


class FocusAreaPracticeBase(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MentorFocusAreaPractice(FocusAreaPracticeBase):
    practice_mode: Literal["mentor"]
    practice_config: MentorPracticeConfig = Field(default_factory=MentorPracticeConfig)


class InterviewFocusAreaPractice(FocusAreaPracticeBase):
    practice_mode: Literal["interview"]
    practice_config: InterviewPracticeConfig


class TeamFocusAreaPractice(FocusAreaPracticeBase):
    practice_mode: Literal["team"]
    practice_config: TeamPracticeConfig


FocusAreaPractice = Annotated[
    MentorFocusAreaPractice | InterviewFocusAreaPractice | TeamFocusAreaPractice,
    Field(discriminator="practice_mode"),
]


class FocusAreaPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    status: MutableFocusAreaStatus | None = None
    practice: FocusAreaPractice | None = None

    @field_validator("title", "status", "practice", mode="before")
    @classmethod
    def supplied_non_nullable_fields_cannot_be_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("field cannot be null")
        return value

    _clean_title = field_validator("title")(_clean_required)
    _clean_description = field_validator("description")(_clean_optional)


class FocusAreaOrderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    focus_area_ids: list[UUID] = Field(min_length=1, max_length=6)

    @field_validator("focus_area_ids")
    @classmethod
    def focus_area_ids_are_unique(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("focus_area_ids must be unique")
        return value


class FocusAreaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    goal_id: UUID
    title: str
    description: str | None
    practice_mode: PracticeMode
    practice_config: dict[str, object]
    position: int
    status: FocusAreaStatus
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class GoalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str | None
    goal_type: GoalType
    status: GoalStatus
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    focus_areas: list[FocusAreaResponse]
