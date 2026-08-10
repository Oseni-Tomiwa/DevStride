from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, CheckConstraint, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class SessionSummary(TimestampMixin, Base):
    __tablename__ = "session_summaries"
    __table_args__ = (
        CheckConstraint(
            "session_mode IN ('mentor', 'interview', 'team')",
            name="ck_session_summaries_supported_mode",
        ),
        CheckConstraint(
            "correctness_rating IS NULL OR correctness_rating BETWEEN 1 AND 5",
            name="ck_session_summaries_correctness_rating",
        ),
        CheckConstraint(
            "clarity_rating IS NULL OR clarity_rating BETWEEN 1 AND 5",
            name="ck_session_summaries_clarity_rating",
        ),
        CheckConstraint(
            "depth_rating IS NULL OR depth_rating BETWEEN 1 AND 5",
            name="ck_session_summaries_depth_rating",
        ),
        CheckConstraint(
            "reasoning_rating IS NULL OR reasoning_rating BETWEEN 1 AND 5",
            name="ck_session_summaries_reasoning_rating",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    session_mode: Mapped[str] = mapped_column(String, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    topics_covered: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    strengths: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    weaknesses: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    recommended_next_steps: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    concepts_practiced: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    exercises_completed: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    correctness_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    clarity_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    depth_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reasoning_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)

    def as_data(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "user_id": self.user_id,
            "session_mode": self.session_mode,
            "summary": self.summary,
            "topics_covered": self.topics_covered,
            "strengths": self.strengths,
            "weaknesses": self.weaknesses,
            "recommended_next_steps": self.recommended_next_steps,
            "concepts_practiced": self.concepts_practiced,
            "exercises_completed": self.exercises_completed,
            "correctness_rating": self.correctness_rating,
            "clarity_rating": self.clarity_rating,
            "depth_rating": self.depth_rating,
            "reasoning_rating": self.reasoning_rating,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
