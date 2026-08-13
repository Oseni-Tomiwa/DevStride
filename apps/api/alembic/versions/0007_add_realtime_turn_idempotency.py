"""Add durable realtime transcript event identifiers.

Revision ID: 0007
Revises: 0006
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("provider_event_id", sa.String(length=200), nullable=True))
    op.create_index(
        "uq_messages_conversation_provider_event_id",
        "messages",
        ["conversation_id", "provider_event_id"],
        unique=True,
        postgresql_where=sa.text("provider_event_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_messages_conversation_provider_event_id", table_name="messages")
    op.drop_column("messages", "provider_event_id")
