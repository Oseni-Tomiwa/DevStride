from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

MemoryCategory = Literal["goal", "preference", "project", "skill", "weakness", "achievement"]


class MemoryCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: MemoryCategory
    content: str = Field(min_length=1, max_length=1000)

    @field_validator("content")
    @classmethod
    def content_is_clean(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("content must not be blank")
        return value


class MemoryPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: MemoryCategory | None = None
    content: str | None = Field(default=None, min_length=1, max_length=1000)
    importance: int | None = Field(default=None, ge=1, le=5)

    @field_validator("content")
    @classmethod
    def optional_content_is_clean(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("content must not be blank")
        return value


class MemoryCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: MemoryCategory
    content: str = Field(min_length=1, max_length=1000)
    importance: int = Field(ge=1, le=5)
    confidence: float = Field(ge=0, le=1)


class MemoryCandidateBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidates: list[MemoryCandidate] = Field(
        default_factory=lambda: list[MemoryCandidate](), max_length=10
    )


class MemoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    category: MemoryCategory
    content: str
    importance: int
    confidence: float
    source_type: str
    source_id: UUID | None
    status: Literal["active", "archived"]
    last_reinforced_at: datetime | None
    reinforcement_count: int
    created_at: datetime
    updated_at: datetime
