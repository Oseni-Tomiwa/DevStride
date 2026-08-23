from uuid import UUID

from pydantic import BaseModel, Field


class CurrentUser(BaseModel):
    id: UUID
    email: str | None = None
    auth_time: int | None = Field(default=None, exclude=True)
