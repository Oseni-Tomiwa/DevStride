from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.database.session import get_db_session
from app.memory.schemas import (
    MemoryCategory,
    MemoryCreateRequest,
    MemoryPatchRequest,
    MemoryResponse,
)
from app.memory.service import (
    MemoryNotFoundError,
    MemoryValidationError,
    create_manual,
    delete_owned,
    list_memories,
    update_owned,
)

router = APIRouter(prefix="/api/v1/memories", tags=["memories"])
Session = Annotated[AsyncSession, Depends(get_db_session)]
User = Annotated[CurrentUser, Depends(get_current_user)]


@router.get("", response_model=list[MemoryResponse])
async def list_all(
    session: Session, current_user: User, category: MemoryCategory | None = None
) -> list[MemoryResponse]:
    return [
        MemoryResponse.model_validate(item)
        for item in await list_memories(session, current_user.id, category)
    ]


@router.post("", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
async def create(data: MemoryCreateRequest, session: Session, current_user: User) -> MemoryResponse:
    try:
        return MemoryResponse.model_validate(
            await create_manual(session, current_user.id, data.category, data.content)
        )
    except MemoryValidationError:
        raise HTTPException(status_code=400, detail="This memory content cannot be saved") from None


@router.patch("/{memory_id}", response_model=MemoryResponse)
async def update(
    memory_id: UUID, data: MemoryPatchRequest, session: Session, current_user: User
) -> MemoryResponse:
    try:
        record = await update_owned(
            session,
            current_user.id,
            memory_id,
            data.model_dump(exclude_unset=True, exclude_none=True),
        )
    except MemoryNotFoundError:
        raise HTTPException(status_code=404, detail="Memory not found") from None
    except MemoryValidationError:
        raise HTTPException(status_code=400, detail="This memory content cannot be saved") from None
    return MemoryResponse.model_validate(record)


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(memory_id: UUID, session: Session, current_user: User) -> Response:
    try:
        await delete_owned(session, current_user.id, memory_id)
    except MemoryNotFoundError:
        raise HTTPException(status_code=404, detail="Memory not found") from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)
