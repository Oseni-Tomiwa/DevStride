from typing import Any
from uuid import UUID

import jwt
from jwt import InvalidTokenError

from app.auth.models import CurrentUser
from app.core.config import settings


def verify_access_token(token: str) -> CurrentUser:
    if not settings.supabase_jwt_secret or not settings.supabase_jwt_issuer:
        raise InvalidTokenError("JWT verification is not configured")

    payload: dict[str, Any] = jwt.decode(  # pyright: ignore[reportUnknownMemberType]
        token,
        settings.supabase_jwt_secret,
        algorithms=["HS256"],
        audience=settings.supabase_jwt_audience,
        issuer=settings.supabase_jwt_issuer,
        options={"require": ["sub", "exp", "aud", "iss"]},
    )

    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise InvalidTokenError("JWT subject is invalid")

    try:
        user_id = UUID(subject)
    except ValueError as exc:
        raise InvalidTokenError("JWT subject is invalid") from exc

    email = payload.get("email")
    return CurrentUser(id=user_id, email=email if isinstance(email, str) else None)
