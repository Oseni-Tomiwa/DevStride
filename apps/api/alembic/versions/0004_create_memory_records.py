"""create memory records

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "memory_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("importance", sa.Integer(), server_default="3", nullable=False),
        sa.Column("confidence", sa.Float(), server_default="0.8", nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("last_reinforced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reinforcement_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "category IN ('goal', 'preference', 'project', 'skill', 'weakness', 'achievement')",
            name="ck_memory_records_category",
        ),
        sa.CheckConstraint("importance BETWEEN 1 AND 5", name="ck_memory_records_importance"),
        sa.CheckConstraint(
            "confidence >= 0 AND confidence <= 1", name="ck_memory_records_confidence"
        ),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_memory_records_status"),
        sa.CheckConstraint("length(trim(content)) > 0", name="ck_memory_records_content"),
    )
    op.create_index("ix_memory_records_user_id", "memory_records", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_memory_records_user_id", table_name="memory_records")
    op.drop_table("memory_records")
