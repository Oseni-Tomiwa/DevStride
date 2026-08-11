"""Create goals and ordered development-plan focus areas.

Revision ID: 0006
Revises: 0005
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "goals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("goal_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "goal_type IN ('interview_preparation', 'technical_growth', 'communication', 'custom')",
            name="ck_goals_type",
        ),
        sa.CheckConstraint("status IN ('active', 'completed', 'archived')", name="ck_goals_status"),
        sa.CheckConstraint("length(trim(title)) > 0", name="ck_goals_title"),
        sa.CheckConstraint(
            "(status != 'active' OR completed_at IS NULL) AND "
            "(status != 'completed' OR completed_at IS NOT NULL)",
            name="ck_goals_completed_at_status",
        ),
    )
    op.create_index("ix_goals_user_id", "goals", ["user_id"])
    op.create_index("ix_goals_user_status", "goals", ["user_id", "status"])
    op.create_index(
        "uq_goals_one_active_per_user",
        "goals",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )

    op.create_table(
        "goal_focus_areas",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("goal_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("practice_mode", sa.String(length=16), nullable=False),
        sa.Column(
            "practice_config", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["goal_id"], ["goals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("length(trim(title)) > 0", name="ck_goal_focus_areas_title"),
        sa.CheckConstraint(
            "practice_mode IN ('mentor', 'interview', 'team')",
            name="ck_goal_focus_areas_practice_mode",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'completed', 'archived')",
            name="ck_goal_focus_areas_status",
        ),
        sa.CheckConstraint("position >= 0", name="ck_goal_focus_areas_position"),
        sa.CheckConstraint(
            "(status != 'active' OR completed_at IS NULL) AND "
            "(status != 'completed' OR completed_at IS NOT NULL)",
            name="ck_goal_focus_areas_completed_at_status",
        ),
    )
    op.create_index("ix_goal_focus_areas_goal_id", "goal_focus_areas", ["goal_id"])
    op.create_index(
        "ix_goal_focus_areas_goal_status_position",
        "goal_focus_areas",
        ["goal_id", "status", "position"],
    )

    op.add_column("conversations", sa.Column("focus_area_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_conversations_focus_area_id_goal_focus_areas",
        "conversations",
        "goal_focus_areas",
        ["focus_area_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_conversations_focus_area_id", "conversations", ["focus_area_id"])


def downgrade() -> None:
    op.drop_index("ix_conversations_focus_area_id", table_name="conversations")
    op.drop_constraint(
        "fk_conversations_focus_area_id_goal_focus_areas", "conversations", type_="foreignkey"
    )
    op.drop_column("conversations", "focus_area_id")
    op.drop_index("ix_goal_focus_areas_goal_status_position", table_name="goal_focus_areas")
    op.drop_index("ix_goal_focus_areas_goal_id", table_name="goal_focus_areas")
    op.drop_table("goal_focus_areas")
    op.drop_index("uq_goals_one_active_per_user", table_name="goals")
    op.drop_index("ix_goals_user_status", table_name="goals")
    op.drop_index("ix_goals_user_id", table_name="goals")
    op.drop_table("goals")
