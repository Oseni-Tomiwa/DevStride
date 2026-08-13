"""Add normalized realtime events and live interview analytics.

Revision ID: 0008
Revises: 0007
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "realtime_session_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.String(length=200), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "conversation_id", "event_id", name="uq_realtime_event_per_conversation"
        ),
    )
    op.create_index(
        "ix_realtime_session_events_conversation_id", "realtime_session_events", ["conversation_id"]
    )
    op.create_index("ix_realtime_session_events_user_id", "realtime_session_events", ["user_id"])
    op.create_table(
        "realtime_session_analytics",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("candidate_speaking_ms", sa.Integer(), nullable=True),
        sa.Column("interviewer_speaking_ms", sa.Integer(), nullable=True),
        sa.Column("candidate_talk_share", sa.Float(), nullable=True),
        sa.Column("candidate_turn_count", sa.Integer(), nullable=False),
        sa.Column("interviewer_turn_count", sa.Integer(), nullable=False),
        sa.Column("average_candidate_response_ms", sa.Integer(), nullable=True),
        sa.Column("longest_candidate_response_ms", sa.Integer(), nullable=True),
        sa.Column("average_response_latency_ms", sa.Integer(), nullable=True),
        sa.Column("interruption_count", sa.Integer(), nullable=False),
        sa.Column("reconnect_count", sa.Integer(), nullable=False),
        sa.Column("mute_count", sa.Integer(), nullable=False),
        sa.Column("session_duration_ms", sa.Integer(), nullable=True),
        sa.Column("finalized_word_count", sa.Integer(), nullable=False),
        sa.Column("approximate_wpm", sa.Float(), nullable=True),
        sa.Column("filler_word_count", sa.Integer(), nullable=False),
        sa.Column("filler_words_per_100", sa.Float(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id", name="uq_realtime_analytics_conversation"),
    )
    op.create_index(
        "ix_realtime_session_analytics_user_id", "realtime_session_analytics", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_realtime_session_analytics_user_id", table_name="realtime_session_analytics")
    op.drop_table("realtime_session_analytics")
    op.drop_index("ix_realtime_session_events_user_id", table_name="realtime_session_events")
    op.drop_index(
        "ix_realtime_session_events_conversation_id", table_name="realtime_session_events"
    )
    op.drop_table("realtime_session_events")
