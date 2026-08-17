from collections.abc import AsyncIterator, Callable
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status

from app.ai.dependencies import get_ai_provider
from app.ai.provider import AIProvider
from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.core.config import settings


class ConcurrencyLimitExceeded(Exception):
    pass


class InMemoryConcurrencyLimiter:
    """Process-local protection for expensive provider operations.

    This is intentionally conservative and must be replaced or backed by a
    distributed limiter before running multiple API processes.
    """

    def __init__(self, global_limit: int, user_limit: int) -> None:
        self.global_limit = global_limit
        self.user_limit = user_limit
        self._global_active = 0
        self._user_active: dict[UUID, int] = {}

    def acquire(self, user_id: UUID) -> None:
        if self._global_active >= self.global_limit:
            raise ConcurrencyLimitExceeded
        if self._user_active.get(user_id, 0) >= self.user_limit:
            raise ConcurrencyLimitExceeded
        self._global_active += 1
        self._user_active[user_id] = self._user_active.get(user_id, 0) + 1

    def release(self, user_id: UUID) -> None:
        self._global_active = max(0, self._global_active - 1)
        active = self._user_active.get(user_id, 0)
        if active <= 1:
            self._user_active.pop(user_id, None)
        else:
            self._user_active[user_id] = active - 1

    def clear(self) -> None:
        self._global_active = 0
        self._user_active.clear()


concurrency_limiter = InMemoryConcurrencyLimiter(
    settings.ai_concurrency_global_limit,
    settings.ai_concurrency_user_limit,
)


def require_ai_concurrency(
    operation: str, *, provider_required: bool = True
) -> Callable[..., AsyncIterator[None]]:
    async def enforce(
        current_user: Annotated[CurrentUser, Depends(get_current_user)],
        provider: Annotated[AIProvider | None, Depends(get_ai_provider)],
    ) -> AsyncIterator[None]:
        if provider_required and provider is None:
            yield
            return
        try:
            concurrency_limiter.acquire(current_user.id)
        except ConcurrencyLimitExceeded:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many concurrent AI operations. Please try again shortly.",
                headers={"Retry-After": "1"},
            ) from None
        try:
            yield
        finally:
            concurrency_limiter.release(current_user.id)

    enforce.__name__ = f"enforce_{operation}_concurrency"
    return enforce


def require_realtime_concurrency(operation: str) -> Callable[..., AsyncIterator[None]]:
    return require_ai_concurrency(operation, provider_required=False)
