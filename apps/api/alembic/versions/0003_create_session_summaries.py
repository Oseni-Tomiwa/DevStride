"""create session summaries table

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-10

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "session_summaries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_mode", sa.String(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("topics_covered", sa.JSON(), nullable=False),
        sa.Column("strengths", sa.JSON(), nullable=False),
        sa.Column("weaknesses", sa.JSON(), nullable=False),
        sa.Column("recommended_next_steps", sa.JSON(), nullable=False),
        sa.Column("concepts_practiced", sa.JSON(), nullable=True),
        sa.Column("exercises_completed", sa.JSON(), nullable=True),
        sa.Column("correctness_rating", sa.Integer(), nullable=True),
        sa.Column("clarity_rating", sa.Integer(), nullable=True),
        sa.Column("depth_rating", sa.Integer(), nullable=True),
        sa.Column("reasoning_rating", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id", name="uq_session_summaries_conversation_id"),
        sa.CheckConstraint(
            "session_mode IN ('mentor', 'interview')",
            name="ck_session_summaries_supported_mode",
        ),
        sa.CheckConstraint(
            "correctness_rating IS NULL OR correctness_rating BETWEEN 1 AND 5",
            name="ck_session_summaries_correctness_rating",
        ),
        sa.CheckConstraint(
            "clarity_rating IS NULL OR clarity_rating BETWEEN 1 AND 5",
            name="ck_session_summaries_clarity_rating",
        ),
        sa.CheckConstraint(
            "depth_rating IS NULL OR depth_rating BETWEEN 1 AND 5",
            name="ck_session_summaries_depth_rating",
        ),
        sa.CheckConstraint(
            "reasoning_rating IS NULL OR reasoning_rating BETWEEN 1 AND 5",
            name="ck_session_summaries_reasoning_rating",
        ),
    )
    op.create_index("ix_session_summaries_user_id", "session_summaries", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_session_summaries_user_id", table_name="session_summaries")
    op.drop_table("session_summaries")
