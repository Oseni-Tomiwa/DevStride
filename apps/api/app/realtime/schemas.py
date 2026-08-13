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
