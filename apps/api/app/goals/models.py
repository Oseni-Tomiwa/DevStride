from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin


class Goal(TimestampMixin, Base):
    __tablename__ = "goals"
    __table_args__ = (
        CheckConstraint(
            "goal_type IN ('interview_preparation', 'technical_growth', 'communication', 'custom')",
            name="ck_goals_type",
        ),
        CheckConstraint(
            "status IN ('active', 'completed', 'archived')",
            name="ck_goals_status",
        ),
        CheckConstraint("length(trim(title)) > 0", name="ck_goals_title"),
        CheckConstraint(
            "(status != 'active' OR completed_at IS NULL) AND "
            "(status != 'completed' OR completed_at IS NOT NULL)",
            name="ck_goals_completed_at_status",
        ),
        Index("ix_goals_user_status", "user_id", "status"),
        Index(
            "uq_goals_one_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    goal_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default="active"
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    focus_areas: Mapped[list[GoalFocusArea]] = relationship(
        back_populates="goal",
        cascade="all, delete-orphan",
        order_by=lambda: (
            GoalFocusArea.position,
            GoalFocusArea.created_at,
            GoalFocusArea.id,
        ),
    )


class GoalFocusArea(TimestampMixin, Base):
    __tablename__ = "goal_focus_areas"
    __table_args__ = (
        CheckConstraint("length(trim(title)) > 0", name="ck_goal_focus_areas_title"),
        CheckConstraint(
            "practice_mode IN ('mentor', 'interview', 'team')",
            name="ck_goal_focus_areas_practice_mode",
        ),
        CheckConstraint(
            "status IN ('active', 'completed', 'archived')",
            name="ck_goal_focus_areas_status",
        ),
        CheckConstraint("position >= 0", name="ck_goal_focus_areas_position"),
        CheckConstraint(
            "(status != 'active' OR completed_at IS NULL) AND "
            "(status != 'completed' OR completed_at IS NOT NULL)",
            name="ck_goal_focus_areas_completed_at_status",
        ),
        Index(
            "ix_goal_focus_areas_goal_status_position",
            "goal_id",
            "status",
            "position",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    goal_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("goals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    practice_mode: Mapped[str] = mapped_column(String(16), nullable=False)
    practice_config: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict, server_default=text("'{}'::json")
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default="active"
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    goal: Mapped[Goal] = relationship(back_populates="focus_areas")
