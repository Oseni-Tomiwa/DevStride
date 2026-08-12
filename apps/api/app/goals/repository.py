from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.goals.models import Goal, GoalFocusArea


async def list_owned(session: AsyncSession, user_id: UUID, status: str | None = None) -> list[Goal]:
    query = select(Goal).where(Goal.user_id == user_id).options(selectinload(Goal.focus_areas))
    if status is not None:
        query = query.where(Goal.status == status)
    result = await session.execute(
        query.order_by(
            case((Goal.status == "active", 0), (Goal.status == "completed", 1), else_=2),
            Goal.updated_at.desc(),
            Goal.id.asc(),
        )
    )
    return list(result.scalars().unique().all())


async def get_owned(
    session: AsyncSession, user_id: UUID, goal_id: UUID, *, for_update: bool = False
) -> Goal | None:
    query = (
        select(Goal)
        .where(Goal.id == goal_id, Goal.user_id == user_id)
        .options(selectinload(Goal.focus_areas))
    )
    if for_update:
        query = query.with_for_update()
    result = await session.execute(query)
    return result.scalar_one_or_none()


async def get_active_owned(
    session: AsyncSession, user_id: UUID, exclude_goal_id: UUID | None = None
) -> Goal | None:
    query = select(Goal).where(Goal.user_id == user_id, Goal.status == "active")
    if exclude_goal_id is not None:
        query = query.where(Goal.id != exclude_goal_id)
    return (await session.execute(query)).scalar_one_or_none()


async def get_focus_owned(
    session: AsyncSession,
    user_id: UUID,
    goal_id: UUID,
    focus_area_id: UUID,
) -> GoalFocusArea | None:
    result = await session.execute(
        select(GoalFocusArea)
        .join(Goal, Goal.id == GoalFocusArea.goal_id)
        .where(
            GoalFocusArea.id == focus_area_id,
            GoalFocusArea.goal_id == goal_id,
            Goal.user_id == user_id,
        )
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def get_current_focus_owned(
    session: AsyncSession, user_id: UUID, goal_id: UUID
) -> GoalFocusArea | None:
    result = await session.execute(
        select(GoalFocusArea)
        .join(Goal, Goal.id == GoalFocusArea.goal_id)
        .where(
            GoalFocusArea.goal_id == goal_id,
            GoalFocusArea.status == "active",
            Goal.status == "active",
            Goal.user_id == user_id,
        )
        .order_by(
            GoalFocusArea.position,
            GoalFocusArea.created_at,
            GoalFocusArea.id,
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


async def count_non_archived_focus_areas(
    session: AsyncSession, user_id: UUID, goal_id: UUID
) -> int:
    result = await session.execute(
        select(func.count(GoalFocusArea.id))
        .join(Goal, Goal.id == GoalFocusArea.goal_id)
        .where(
            GoalFocusArea.goal_id == goal_id,
            GoalFocusArea.status != "archived",
            Goal.user_id == user_id,
        )
    )
    return int(result.scalar_one())


async def next_focus_position(session: AsyncSession, user_id: UUID, goal_id: UUID) -> int:
    result = await session.execute(
        select(func.coalesce(func.max(GoalFocusArea.position), -1))
        .join(Goal, Goal.id == GoalFocusArea.goal_id)
        .where(GoalFocusArea.goal_id == goal_id, Goal.user_id == user_id)
    )
    return int(result.scalar_one()) + 1


async def list_non_archived_focus_areas_for_update(
    session: AsyncSession, user_id: UUID, goal_id: UUID
) -> list[GoalFocusArea]:
    result = await session.execute(
        select(GoalFocusArea)
        .join(Goal, Goal.id == GoalFocusArea.goal_id)
        .where(GoalFocusArea.goal_id == goal_id, GoalFocusArea.status != "archived")
        .where(Goal.user_id == user_id)
        .order_by(GoalFocusArea.position, GoalFocusArea.created_at, GoalFocusArea.id)
        .with_for_update()
    )
    return list(result.scalars().all())


async def flush(session: AsyncSession) -> None:
    await session.flush()
