from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import JSON, Boolean, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class Profile(TimestampMixin, Base):
    __tablename__ = "profiles"
    __table_args__ = (UniqueConstraint("user_id", name="uq_profiles_user_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    current_level: Mapped[str] = mapped_column(String, nullable=False)
    target_role: Mapped[str] = mapped_column(String, nullable=False)
    preferred_stack: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    communication_goal: Mapped[str] = mapped_column(String, nullable=False)
    feedback_preference: Mapped[str] = mapped_column(String, nullable=False)
    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
