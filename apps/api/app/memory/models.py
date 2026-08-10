from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, Float, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class MemoryRecord(TimestampMixin, Base):
    __tablename__ = "memory_records"
    __table_args__ = (
        CheckConstraint(
            "category IN ('goal', 'preference', 'project', 'skill', 'weakness', 'achievement')",
            name="ck_memory_records_category",
        ),
        CheckConstraint("importance BETWEEN 1 AND 5", name="ck_memory_records_importance"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_memory_records_confidence"),
        CheckConstraint("status IN ('active', 'archived')", name="ck_memory_records_status"),
        CheckConstraint("length(trim(content)) > 0", name="ck_memory_records_content"),
    )
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    importance: Mapped[int] = mapped_column(Integer, nullable=False, default=3, server_default="3")
    confidence: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.8, server_default="0.8"
    )
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default="active"
    )
    last_reinforced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reinforcement_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
