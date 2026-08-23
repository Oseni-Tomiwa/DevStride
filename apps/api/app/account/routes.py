from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.account.rate_limit import consume_export_rate_limit
from app.account.schemas import DeleteAccountRequest
from app.account.service import (
    AccountDeletionConfigurationError,
    AccountDeletionProviderError,
    build_export,
    delete_account,
)
from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.core.config import settings
from app.database.session import get_db_session

router = APIRouter(prefix="/api/v1/account", tags=["account"])
Session = Annotated[AsyncSession, Depends(get_db_session)]
User = Annotated[CurrentUser, Depends(get_current_user)]


def _require_recent_auth(current_user: CurrentUser) -> None:
    if current_user.auth_time is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Recent authentication is required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    age = int(datetime.now(UTC).timestamp()) - current_user.auth_time
    if age < 0 or age > settings.account_deletion_recent_auth_seconds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Recent authentication is required",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.get("/export")
async def export_account_data(session: Session, current_user: User) -> Response:
    consume_export_rate_limit(current_user.id)
    payload = await build_export(session, current_user)
    date = datetime.now(UTC).date().isoformat()
    return JSONResponse(
        content=payload,
        headers={
            "Content-Disposition": f'attachment; filename="devstride-export-{date}.json"',
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account_route(
    _: DeleteAccountRequest, session: Session, current_user: User
) -> Response:
    _require_recent_auth(current_user)
    try:
        await delete_account(session, current_user)
    except AccountDeletionConfigurationError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account deletion is not configured",
        ) from None
    except AccountDeletionProviderError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Your DevStride data was deleted, but sign-in account cleanup "
                "could not be completed. Please try again."
            ),
        ) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)
