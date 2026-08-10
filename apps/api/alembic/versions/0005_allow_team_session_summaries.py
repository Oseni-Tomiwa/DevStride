"""Allow summaries for Team Practice sessions.

Revision ID: 0005
Revises: 0004
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_session_summaries_supported_mode", "session_summaries", type_="check")
    op.create_check_constraint(
        "ck_session_summaries_supported_mode",
        "session_summaries",
        "session_mode IN ('mentor', 'interview', 'team')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_session_summaries_supported_mode", "session_summaries", type_="check")
    op.create_check_constraint(
        "ck_session_summaries_supported_mode",
        "session_summaries",
        "session_mode IN ('mentor', 'interview')",
    )
