from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.memory.models import MemoryRecord


async def list_owned(
    session: AsyncSession, user_id: UUID, category: str | None = None
) -> list[MemoryRecord]:
    query = select(MemoryRecord).where(
        MemoryRecord.user_id == user_id, MemoryRecord.status == "active"
    )
    if category:
        query = query.where(MemoryRecord.category == category)
    result = await session.execute(
        query.order_by(
            MemoryRecord.importance.desc(),
            MemoryRecord.confidence.desc(),
            MemoryRecord.updated_at.desc(),
            MemoryRecord.id.asc(),
        )
    )
    return list(result.scalars().all())


async def get_owned(session: AsyncSession, user_id: UUID, memory_id: UUID) -> MemoryRecord | None:
    result = await session.execute(
        select(MemoryRecord).where(
            MemoryRecord.id == memory_id,
            MemoryRecord.user_id == user_id,
            MemoryRecord.status == "active",
        )
    )
    return result.scalar_one_or_none()


async def find_equivalent(
    session: AsyncSession, user_id: UUID, category: str, normalized_content: str
) -> MemoryRecord | None:
    records = await list_owned(session, user_id, category)
    return next(
        (
            record
            for record in records
            if " ".join(record.content.lower().split()) == normalized_content
        ),
        None,
    )


async def create(session: AsyncSession, record: MemoryRecord) -> MemoryRecord:
    session.add(record)
    await session.flush()
    await session.refresh(record)
    return record


async def update(
    session: AsyncSession, record: MemoryRecord, updates: dict[str, object]
) -> MemoryRecord:
    for field, value in updates.items():
        setattr(record, field, value)
    await session.flush()
    await session.refresh(record)
    return record


async def reinforce(session: AsyncSession, record: MemoryRecord) -> MemoryRecord:
    record.reinforcement_count += 1
    record.last_reinforced_at = datetime.now(UTC)
    record.confidence = min(1.0, record.confidence + 0.05)
    await session.flush()
    await session.refresh(record)
    return record


async def archive(session: AsyncSession, record: MemoryRecord) -> None:
    record.status = "archived"
    await session.flush()
