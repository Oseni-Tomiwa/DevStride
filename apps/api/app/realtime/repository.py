from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.realtime.models import RealtimeSessionEvent


async def create_or_get_event(
    session: AsyncSession,
    *,
    conversation_id: UUID,
    user_id: UUID,
    event_id: str,
    event_type: str,
    occurred_at: datetime,
) -> RealtimeSessionEvent:
    result = await session.execute(
        select(RealtimeSessionEvent).where(
            RealtimeSessionEvent.conversation_id == conversation_id,
            RealtimeSessionEvent.event_id == event_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing
    event = RealtimeSessionEvent(
        conversation_id=conversation_id,
        user_id=user_id,
        event_id=event_id,
        event_type=event_type,
        occurred_at=occurred_at,
    )
    session.add(event)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        result = await session.execute(
            select(RealtimeSessionEvent).where(
                RealtimeSessionEvent.conversation_id == conversation_id,
                RealtimeSessionEvent.event_id == event_id,
            )
        )
        return result.scalar_one()
    return event
