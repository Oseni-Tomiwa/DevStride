from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MESSAGE_CONTENT_MAX_LENGTH = 20_000
ConversationMode = Literal["general", "mentor", "interview"]
InterviewType = Literal["technical", "behavioral"]
InterviewFocus = Literal[
    "general_backend",
    "apis",
    "databases",
    "javascript_node",
    "python",
    "system_design",
]


class ConversationCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(max_length=200)
    mode: ConversationMode = "general"
    persona: str | None = None
    interview_type: InterviewType | None = None
    interview_focus: InterviewFocus | None = None

    @model_validator(mode="after")
    def validate_interview_configuration(self) -> ConversationCreateRequest:
        if self.mode == "interview" and self.interview_type is None:
            raise ValueError("interview_type is required for interview conversations")
        if self.mode != "interview" and (
            self.interview_type is not None or self.interview_focus is not None
        ):
            raise ValueError("interview configuration is only valid for interview conversations")
        if self.interview_type == "behavioral" and self.interview_focus is not None:
            raise ValueError("interview_focus is only valid for technical interviews")
        return self

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title must not be blank")
        return value

    @field_validator("mode")
    @classmethod
    def mode_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("mode must not be blank")
        return value


class ConversationPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(max_length=200)

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title must not be blank")
        return value


class MessageCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(max_length=MESSAGE_CONTENT_MAX_LENGTH)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("content must not be blank")
        return value


class RespondRequest(MessageCreateRequest):
    """Client input for one persisted user message plus one AI response."""


class RespondResponse(BaseModel):
    user_message: MessageResponse
    assistant_message: MessageResponse


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    mode: str
    persona: str | None
    status: str
    metadata: dict[str, Any] = Field(validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conversation_id: UUID
    role: str
    content: str
    provider: str | None
    model: str | None
    input_tokens: int | None
    output_tokens: int | None
    latency_ms: int | None
    metadata: dict[str, Any] = Field(validation_alias="metadata_")
    created_at: datetime
