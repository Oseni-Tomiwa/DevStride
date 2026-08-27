from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError

from app.ai.latency import mark_current_stage
from app.auth.exceptions import authentication_error
from app.auth.jwt import verify_access_token
from app.auth.models import CurrentUser

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise authentication_error()

    try:
        user = await verify_access_token(credentials.credentials)
        mark_current_stage("authentication_completed")
        return user
    except InvalidTokenError as exc:
        del exc
        raise authentication_error() from None
