from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations.models import Conversation
from app.conversations.schemas import ConversationCreateRequest
from app.conversations.service import create_conversation
from app.goals import repository
from app.goals.models import Goal, GoalFocusArea
from app.goals.plan_preview import build_plan_preview
from app.goals.schemas import (
    FocusAreaCreateRequest,
    GoalCreateRequest,
    PlanPreviewRequest,
    PlanPreviewResponse,
)
from app.memory import repository as memory_repository
from app.profiles import repository as profile_repository


class GoalNotFoundError(Exception):
    pass


class FocusAreaNotFoundError(Exception):
    pass


class ActiveGoalConflictError(Exception):
    pass


class ArchivedGoalError(Exception):
    pass


class GoalStateError(Exception):
    pass


class FocusAreaLimitError(Exception):
    pass


class FocusAreaOrderError(Exception):
    pass


class PracticeLaunchStateError(Exception):
    pass


class PracticeConfigurationError(Exception):
    pass


def _focus_from_input(data: FocusAreaCreateRequest, position: int) -> GoalFocusArea:
    return GoalFocusArea(
        title=data.title,
        description=data.description,
        practice_mode=data.practice_mode,
        practice_config=data.practice_config.model_dump(),
        position=position,
        status="active",
    )


async def preview_plan(
    session: AsyncSession, user_id: UUID, data: PlanPreviewRequest
) -> PlanPreviewResponse:
    profile = await profile_repository.get_profile_by_user_id(session, user_id)
    memories = await memory_repository.list_owned(session, user_id)
    return build_plan_preview(data, profile, memories)


async def launch_focus_area_practice(
    session: AsyncSession,
    user_id: UUID,
    goal_id: UUID,
    focus_area_id: UUID,
) -> Conversation:
    goal = await repository.get_owned(session, user_id, goal_id, for_update=True)
    if goal is None:
        raise GoalNotFoundError
    focus = await repository.get_focus_owned(session, user_id, goal_id, focus_area_id)
    if focus is None:
        raise FocusAreaNotFoundError
    if goal.status != "active" or focus.status != "active":
        raise PracticeLaunchStateError
    if focus.practice_mode not in {"mentor", "interview", "team"}:
        raise PracticeConfigurationError

    payload: dict[str, object] = dict(focus.practice_config)
    payload.update({"title": focus.title, "mode": focus.practice_mode})
    try:
        request = ConversationCreateRequest.model_validate(payload)
    except ValidationError:
        raise PracticeConfigurationError from None
    return await create_conversation(
        session,
        user_id,
        request,
        focus_area_id=focus.id,
    )


async def list_goals(session: AsyncSession, user_id: UUID, status: str | None) -> list[Goal]:
    return await repository.list_owned(session, user_id, status)


async def get_goal(session: AsyncSession, user_id: UUID, goal_id: UUID) -> Goal:
    goal = await repository.get_owned(session, user_id, goal_id)
    if goal is None:
        raise GoalNotFoundError
    return goal


async def create_goal(session: AsyncSession, user_id: UUID, data: GoalCreateRequest) -> Goal:
    if await repository.get_active_owned(session, user_id) is not None:
        raise ActiveGoalConflictError
    goal = Goal(
        user_id=user_id,
        title=data.title,
        description=data.description,
        goal_type=data.goal_type,
        status="active",
        focus_areas=[
            _focus_from_input(item, position) for position, item in enumerate(data.focus_areas)
        ],
    )
    session.add(goal)
    try:
        await repository.flush(session)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise ActiveGoalConflictError from None
    return await get_goal(session, user_id, goal.id)


async def update_goal(
    session: AsyncSession, user_id: UUID, goal_id: UUID, updates: dict[str, object]
) -> Goal:
    goal = await repository.get_owned(session, user_id, goal_id, for_update=True)
    if goal is None:
        raise GoalNotFoundError
    if goal.status == "archived":
        raise ArchivedGoalError
    requested_status = updates.pop("status", None)
    for field, value in updates.items():
        setattr(goal, field, value)
    if requested_status is not None and requested_status != goal.status:
        if requested_status == "completed":
            goal.status = "completed"
            goal.completed_at = datetime.now(UTC)
        elif requested_status == "active" and goal.status == "completed":
            if await repository.get_active_owned(session, user_id, goal.id) is not None:
                raise ActiveGoalConflictError
            goal.status = "active"
            goal.completed_at = None
        else:
            raise GoalStateError
    try:
        await repository.flush(session)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise ActiveGoalConflictError from None
    return await get_goal(session, user_id, goal.id)


async def archive_goal(session: AsyncSession, user_id: UUID, goal_id: UUID) -> None:
    goal = await repository.get_owned(session, user_id, goal_id, for_update=True)
    if goal is None:
        raise GoalNotFoundError
    if goal.status != "archived":
        goal.status = "archived"
        await repository.flush(session)
        await session.commit()


async def add_focus_area(
    session: AsyncSession, user_id: UUID, goal_id: UUID, data: FocusAreaCreateRequest
) -> GoalFocusArea:
    goal = await repository.get_owned(session, user_id, goal_id, for_update=True)
    if goal is None:
        raise GoalNotFoundError
    if goal.status != "active":
        raise GoalStateError
    if await repository.count_non_archived_focus_areas(session, user_id, goal.id) >= 6:
        raise FocusAreaLimitError
    focus = _focus_from_input(data, await repository.next_focus_position(session, user_id, goal.id))
    focus.goal_id = goal.id
    session.add(focus)
    await repository.flush(session)
    await session.commit()
    await session.refresh(focus)
    return focus


async def update_focus_area(
    session: AsyncSession,
    user_id: UUID,
    goal_id: UUID,
    focus_area_id: UUID,
    updates: dict[str, object],
) -> GoalFocusArea:
    goal = await repository.get_owned(session, user_id, goal_id, for_update=True)
    if goal is None:
        raise GoalNotFoundError
    if goal.status != "active":
        raise GoalStateError
    focus = await repository.get_focus_owned(session, user_id, goal_id, focus_area_id)
    if focus is None or focus.status == "archived":
        raise FocusAreaNotFoundError
    practice = updates.pop("practice", None)
    requested_status = updates.pop("status", None)
    for field, value in updates.items():
        setattr(focus, field, value)
    if isinstance(practice, dict):
        typed_practice = cast(dict[str, object], practice)
        focus.practice_mode = cast(str, typed_practice["practice_mode"])
        focus.practice_config = cast(dict[str, object], typed_practice["practice_config"])
    if requested_status is not None and requested_status != focus.status:
        if requested_status == "completed":
            focus.status = "completed"
            focus.completed_at = datetime.now(UTC)
        elif requested_status == "active" and focus.status == "completed":
            focus.status = "active"
            focus.completed_at = None
        else:
            raise GoalStateError
    await repository.flush(session)
    await session.commit()
    await session.refresh(focus)
    return focus


async def archive_focus_area(
    session: AsyncSession, user_id: UUID, goal_id: UUID, focus_area_id: UUID
) -> None:
    goal = await repository.get_owned(session, user_id, goal_id, for_update=True)
    if goal is None:
        raise GoalNotFoundError
    if goal.status != "active":
        raise GoalStateError
    focus = await repository.get_focus_owned(session, user_id, goal_id, focus_area_id)
    if focus is None:
        raise FocusAreaNotFoundError
    focus.status = "archived"
    await repository.flush(session)
    await session.commit()


async def reorder_focus_areas(
    session: AsyncSession, user_id: UUID, goal_id: UUID, focus_area_ids: list[UUID]
) -> list[GoalFocusArea]:
    goal = await repository.get_owned(session, user_id, goal_id, for_update=True)
    if goal is None:
        raise GoalNotFoundError
    if goal.status != "active":
        raise GoalStateError
    focus_areas = await repository.list_non_archived_focus_areas_for_update(
        session, user_id, goal.id
    )
    by_id = {item.id: item for item in focus_areas}
    if set(focus_area_ids) != set(by_id) or len(focus_area_ids) != len(focus_areas):
        raise FocusAreaOrderError
    for position, focus_id in enumerate(focus_area_ids):
        by_id[focus_id].position = position
    await repository.flush(session)
    for focus in focus_areas:
        await session.refresh(focus)
    await session.commit()
    return [by_id[focus_id] for focus_id in focus_area_ids]
