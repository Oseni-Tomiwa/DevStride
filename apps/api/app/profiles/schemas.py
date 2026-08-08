from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CurrentLevel(StrEnum):
    BEGINNER = "beginner"
    JUNIOR = "junior"
    MID_LEVEL = "mid_level"
    SENIOR = "senior"


class TargetRole(StrEnum):
    BACKEND_ENGINEER = "backend_engineer"
    FRONTEND_ENGINEER = "frontend_engineer"
    FULLSTACK_ENGINEER = "fullstack_engineer"
    CLOUD_ENGINEER = "cloud_engineer"
    DEVOPS_ENGINEER = "devops_engineer"
    AI_ENGINEER = "ai_engineer"


class CommunicationGoal(StrEnum):
    TECHNICAL_INTERVIEWS = "technical_interviews"
    BEHAVIORAL_INTERVIEWS = "behavioral_interviews"
    GROUP_DISCUSSIONS = "group_discussions"
    WORKPLACE_COMMUNICATION = "workplace_communication"
    PUBLIC_SPEAKING = "public_speaking"
    ALL = "all"


class FeedbackPreference(StrEnum):
    SUPPORTIVE = "supportive"
    DIRECT = "direct"
    STRICT = "strict"
    BALANCED = "balanced"


class ProfileFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(max_length=100)
    current_level: CurrentLevel
    target_role: TargetRole
    preferred_stack: list[str] = Field(min_length=1)
    communication_goal: CommunicationGoal
    feedback_preference: FeedbackPreference

    @field_validator("display_name")
    @classmethod
    def display_name_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("display_name must not be blank")
        return value

    @field_validator("preferred_stack")
    @classmethod
    def stack_entries_must_not_be_blank(cls, value: list[str]) -> list[str]:
        if any(not item.strip() for item in value):
            raise ValueError("preferred_stack entries must not be blank")
        return value


class OnboardingRequest(ProfileFields):
    pass


class ProfilePatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, max_length=100)
    current_level: CurrentLevel | None = None
    target_role: TargetRole | None = None
    preferred_stack: list[str] | None = Field(default=None, min_length=1)
    communication_goal: CommunicationGoal | None = None
    feedback_preference: FeedbackPreference | None = None

    @field_validator(
        "display_name",
        "current_level",
        "target_role",
        "preferred_stack",
        "communication_goal",
        "feedback_preference",
        mode="before",
    )
    @classmethod
    def explicitly_provided_values_must_not_be_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("profile fields cannot be null")
        return value

    @field_validator("display_name")
    @classmethod
    def patch_display_name_must_not_be_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("display_name must not be blank")
        return value

    @field_validator("preferred_stack")
    @classmethod
    def patch_stack_entries_must_not_be_blank(cls, value: list[str] | None) -> list[str] | None:
        if value is not None and any(not item.strip() for item in value):
            raise ValueError("preferred_stack entries must not be blank")
        return value


class ProfileResponse(ProfileFields):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    onboarding_completed: bool
    created_at: datetime
    updated_at: datetime
