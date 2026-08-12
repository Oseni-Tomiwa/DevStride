from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.conversations.schemas import ConversationResponse
from app.database.session import get_db_session
from app.goals.schemas import (
    FocusAreaCreateRequest,
    FocusAreaOrderRequest,
    FocusAreaPatchRequest,
    FocusAreaResponse,
    GoalCreateRequest,
    GoalPatchRequest,
    GoalResponse,
    GoalStatus,
    PlanPreviewRequest,
    PlanPreviewResponse,
    PracticeLaunchRequest,
)
from app.goals.service import (
    ActiveGoalConflictError,
    ArchivedGoalError,
    FocusAreaLimitError,
    FocusAreaNotFoundError,
    FocusAreaOrderError,
    GoalNotFoundError,
    GoalStateError,
    PracticeConfigurationError,
    PracticeLaunchStateError,
    add_focus_area,
    archive_focus_area,
    archive_goal,
    create_goal,
    get_goal,
    launch_focus_area_practice,
    list_goals,
    preview_plan,
    reorder_focus_areas,
    update_focus_area,
    update_goal,
)

router = APIRouter(prefix="/api/v1/goals", tags=["goals"])
Session = Annotated[AsyncSession, Depends(get_db_session)]
User = Annotated[CurrentUser, Depends(get_current_user)]


def _conflict(exc: Exception) -> HTTPException:
    if isinstance(exc, ActiveGoalConflictError):
        return HTTPException(409, "An active goal already exists")
    if isinstance(exc, FocusAreaLimitError):
        return HTTPException(409, "A goal can have at most six focus areas")
    if isinstance(exc, ArchivedGoalError):
        return HTTPException(409, "Archived goals cannot be changed or reopened")
    return HTTPException(409, "This change is not valid for the current goal state")


@router.get("", response_model=list[GoalResponse])
async def list_all(
    session: Session,
    current_user: User,
    status_filter: Annotated[GoalStatus | None, Query(alias="status")] = None,
) -> list[GoalResponse]:
    return [
        GoalResponse.model_validate(item)
        for item in await list_goals(session, current_user.id, status_filter)
    ]


@router.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create(data: GoalCreateRequest, session: Session, current_user: User) -> GoalResponse:
    try:
        goal = await create_goal(session, current_user.id, data)
    except ActiveGoalConflictError as exc:
        raise _conflict(exc) from None
    return GoalResponse.model_validate(goal)


@router.post("/plan-preview", response_model=PlanPreviewResponse)
async def plan_preview(
    data: PlanPreviewRequest, session: Session, current_user: User
) -> PlanPreviewResponse:
    return await preview_plan(session, current_user.id, data)


@router.get("/{goal_id}", response_model=GoalResponse)
async def get(goal_id: UUID, session: Session, current_user: User) -> GoalResponse:
    try:
        return GoalResponse.model_validate(await get_goal(session, current_user.id, goal_id))
    except GoalNotFoundError:
        raise HTTPException(404, "Goal not found") from None


@router.patch("/{goal_id}", response_model=GoalResponse)
async def update(
    goal_id: UUID, data: GoalPatchRequest, session: Session, current_user: User
) -> GoalResponse:
    try:
        goal = await update_goal(
            session, current_user.id, goal_id, data.model_dump(exclude_unset=True)
        )
    except GoalNotFoundError:
        raise HTTPException(404, "Goal not found") from None
    except (ActiveGoalConflictError, ArchivedGoalError, GoalStateError) as exc:
        raise _conflict(exc) from None
    return GoalResponse.model_validate(goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive(goal_id: UUID, session: Session, current_user: User) -> Response:
    try:
        await archive_goal(session, current_user.id, goal_id)
    except GoalNotFoundError:
        raise HTTPException(404, "Goal not found") from None
    return Response(status_code=204)


@router.post(
    "/{goal_id}/focus-areas", response_model=FocusAreaResponse, status_code=status.HTTP_201_CREATED
)
async def create_focus(
    goal_id: UUID, data: FocusAreaCreateRequest, session: Session, current_user: User
) -> FocusAreaResponse:
    try:
        focus = await add_focus_area(session, current_user.id, goal_id, data)
    except GoalNotFoundError:
        raise HTTPException(404, "Goal not found") from None
    except (FocusAreaLimitError, GoalStateError) as exc:
        raise _conflict(exc) from None
    return FocusAreaResponse.model_validate(focus)


@router.post(
    "/{goal_id}/focus-areas/{focus_area_id}/practice",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def launch_practice(
    goal_id: UUID,
    focus_area_id: UUID,
    session: Session,
    current_user: User,
    _data: Annotated[PracticeLaunchRequest | None, Body()] = None,
) -> ConversationResponse:
    try:
        conversation = await launch_focus_area_practice(
            session, current_user.id, goal_id, focus_area_id
        )
    except (GoalNotFoundError, FocusAreaNotFoundError):
        raise HTTPException(404, "Focus area not found") from None
    except PracticeLaunchStateError:
        raise HTTPException(
            409, "Practice can only be launched from an active focus area"
        ) from None
    except PracticeConfigurationError:
        raise HTTPException(409, "The saved practice configuration is invalid") from None
    return ConversationResponse.model_validate(conversation)


@router.patch("/{goal_id}/focus-areas/{focus_area_id}", response_model=FocusAreaResponse)
async def update_focus(
    goal_id: UUID,
    focus_area_id: UUID,
    data: FocusAreaPatchRequest,
    session: Session,
    current_user: User,
) -> FocusAreaResponse:
    try:
        focus = await update_focus_area(
            session,
            current_user.id,
            goal_id,
            focus_area_id,
            data.model_dump(exclude_unset=True),
        )
    except (GoalNotFoundError, FocusAreaNotFoundError):
        raise HTTPException(404, "Focus area not found") from None
    except GoalStateError as exc:
        raise _conflict(exc) from None
    return FocusAreaResponse.model_validate(focus)


@router.delete("/{goal_id}/focus-areas/{focus_area_id}", status_code=204)
async def archive_focus(
    goal_id: UUID, focus_area_id: UUID, session: Session, current_user: User
) -> Response:
    try:
        await archive_focus_area(session, current_user.id, goal_id, focus_area_id)
    except (GoalNotFoundError, FocusAreaNotFoundError):
        raise HTTPException(404, "Focus area not found") from None
    except GoalStateError as exc:
        raise _conflict(exc) from None
    return Response(status_code=204)


@router.put("/{goal_id}/focus-areas/order", response_model=list[FocusAreaResponse])
async def reorder_focus(
    goal_id: UUID, data: FocusAreaOrderRequest, session: Session, current_user: User
) -> list[FocusAreaResponse]:
    try:
        reordered = await reorder_focus_areas(
            session, current_user.id, goal_id, data.focus_area_ids
        )
    except GoalNotFoundError:
        raise HTTPException(404, "Goal not found") from None
    except GoalStateError as exc:
        raise _conflict(exc) from None
    except FocusAreaOrderError:
        raise HTTPException(
            400, "Order must contain every active or completed focus area once"
        ) from None
    return [FocusAreaResponse.model_validate(item) for item in reordered]
