from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.session_summaries.models import SessionSummary


async def get_by_conversation_id_and_user_id(
    session: AsyncSession, conversation_id: UUID, user_id: UUID
) -> SessionSummary | None:
    result = await session.execute(
        select(SessionSummary).where(
            SessionSummary.conversation_id == conversation_id,
            SessionSummary.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def create(session: AsyncSession, summary: SessionSummary) -> SessionSummary:
    session.add(summary)
    await session.flush()
    await session.refresh(summary)
    return summary
