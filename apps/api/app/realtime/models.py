from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class RealtimeSessionEvent(Base):
    __tablename__ = "realtime_session_events"
    __table_args__ = (
        UniqueConstraint("conversation_id", "event_id", name="uq_realtime_event_per_conversation"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    event_id: Mapped[str] = mapped_column(String(200), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class RealtimeSessionAnalytics(TimestampMixin, Base):
    __tablename__ = "realtime_session_analytics"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    candidate_speaking_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    interviewer_speaking_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    candidate_talk_share: Mapped[float | None] = mapped_column(Float, nullable=True)
    candidate_turn_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    interviewer_turn_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    average_candidate_response_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    longest_candidate_response_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    average_response_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    interruption_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reconnect_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    mute_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    session_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    finalized_word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    approximate_wpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    filler_word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    filler_words_per_100: Mapped[float | None] = mapped_column(Float, nullable=True)
