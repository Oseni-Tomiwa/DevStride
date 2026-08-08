import json
import time
from dataclasses import dataclass, field
from typing import Any, cast
from uuid import UUID

import httpx
import jwt
from jwt import InvalidTokenError
from jwt.algorithms import get_default_algorithms

from app.auth.models import CurrentUser
from app.core.config import settings

JWKS_CACHE_TTL_SECONDS = 300.0


@dataclass
class JWKSClient:
    cache_ttl_seconds: float = JWKS_CACHE_TTL_SECONDS
    _keys: dict[str, tuple[object, str]] = field(
        default_factory=lambda: dict[str, tuple[object, str]]()
    )
    _expires_at: float = 0.0

    @property
    def url(self) -> str:
        if not settings.supabase_jwt_issuer:
            raise InvalidTokenError("JWT verification is not configured")
        return f"{settings.supabase_jwt_issuer.rstrip('/')}/.well-known/jwks.json"

    def clear(self) -> None:
        self._keys.clear()
        self._expires_at = 0.0

    async def fetch_jwks(self) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(self.url)
                response.raise_for_status()
            document = response.json()
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise InvalidTokenError("JWKS could not be loaded") from exc

        if not isinstance(document, dict):
            raise InvalidTokenError("JWKS response is invalid")
        typed_document = cast(dict[str, object], document)
        if not isinstance(typed_document.get("keys"), list):
            raise InvalidTokenError("JWKS response is invalid")
        return cast(dict[str, Any], typed_document)

    async def _refresh(self) -> None:
        document = cast(dict[str, object], await self.fetch_jwks())
        configured_algorithms = configured_jwt_algorithms()
        algorithms = get_default_algorithms()
        keys: dict[str, tuple[object, str]] = {}

        raw_keys = document.get("keys")
        for jwk in cast(list[object], raw_keys):
            if not isinstance(jwk, dict):
                continue
            jwk = cast(dict[str, Any], jwk)
            kid = jwk.get("kid")
            algorithm = jwk.get("alg")
            if not isinstance(kid, str) or algorithm not in configured_algorithms:
                continue
            if jwk.get("use") not in (None, "sig"):
                continue
            try:
                key = cast(object, algorithms[algorithm].from_jwk(json.dumps(jwk)))
            except (KeyError, TypeError, ValueError):
                continue
            keys[kid] = (key, algorithm)

        self._keys = keys
        self._expires_at = time.monotonic() + self.cache_ttl_seconds

    async def get_key(self, kid: str, algorithm: str) -> object:
        cache_is_fresh = time.monotonic() < self._expires_at
        cached = self._keys.get(kid)
        if cache_is_fresh and cached is not None and cached[1] == algorithm:
            return cached[0]

        await self._refresh()
        refreshed = self._keys.get(kid)
        if refreshed is not None and refreshed[1] == algorithm:
            return refreshed[0]

        # A single forced refresh supports a rotated signing key with a new kid.
        await self._refresh()
        rotated = self._keys.get(kid)
        if rotated is None or rotated[1] != algorithm:
            raise InvalidTokenError("JWT signing key is unavailable")
        return rotated[0]


jwks_client = JWKSClient()


def configured_jwt_algorithms() -> tuple[str, ...]:
    return tuple(
        algorithm.strip().upper()
        for algorithm in settings.supabase_jwt_algorithms.split(",")
        if algorithm.strip()
    )


async def verify_access_token(token: str) -> CurrentUser:
    configured_algorithms = configured_jwt_algorithms()
    try:
        header = jwt.get_unverified_header(token)
        algorithm = header.get("alg")
        kid = header.get("kid")
        if not isinstance(algorithm, str) or algorithm not in configured_algorithms:
            raise InvalidTokenError("JWT algorithm is invalid")
        if not isinstance(kid, str) or not kid:
            raise InvalidTokenError("JWT key ID is invalid")

        signing_key = await jwks_client.get_key(kid, algorithm)
        payload = jwt.decode(  # pyright: ignore[reportUnknownMemberType]
            token,
            cast(Any, signing_key),
            algorithms=[algorithm],
            audience=settings.supabase_jwt_audience,
            issuer=settings.supabase_jwt_issuer,
            options={"require": ["sub", "exp", "aud", "iss"]},
        )
    except (InvalidTokenError, TypeError, ValueError) as exc:
        raise InvalidTokenError("JWT verification failed") from exc

    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise InvalidTokenError("JWT subject is invalid")

    try:
        user_id = UUID(subject)
    except ValueError as exc:
        raise InvalidTokenError("JWT subject is invalid") from exc

    email = payload.get("email")
    return CurrentUser(id=user_id, email=email if isinstance(email, str) else None)
