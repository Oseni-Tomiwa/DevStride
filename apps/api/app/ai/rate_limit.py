from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.ai.dependencies import get_ai_provider
from app.ai.provider import AIProvider
from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.core.config import settings
from app.core.rate_limit import InMemoryRateLimiter, RateLimitExceeded, RateLimitPolicy


def get_ai_rate_limiter() -> InMemoryRateLimiter:
    return _rate_limiter


_rate_limiter = InMemoryRateLimiter()


def require_ai_rate_limit(operation: str) -> Callable[..., Awaitable[None]]:
    async def enforce(
        current_user: Annotated[CurrentUser, Depends(get_current_user)],
        provider: Annotated[AIProvider | None, Depends(get_ai_provider)],
        limiter: Annotated[InMemoryRateLimiter, Depends(get_ai_rate_limiter)],
    ) -> None:
        # Disabled AI and missing provider configuration do not consume quota.
        if provider is None or not settings.ai_rate_limit_enabled:
            return
        limit, window_seconds = settings.ai_rate_limit_policy(operation)
        try:
            limiter.consume(
                current_user.id,
                operation,
                RateLimitPolicy(limit=limit, window_seconds=window_seconds),
            )
        except RateLimitExceeded as exc:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many AI requests. Please try again shortly.",
                headers={"Retry-After": str(exc.retry_after_seconds)},
            ) from None

    return enforce


async def require_realtime_rate_limit(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    limiter: Annotated[InMemoryRateLimiter, Depends(get_ai_rate_limiter)],
) -> None:
    if not settings.ai_rate_limit_enabled or not settings.live_interview_enabled:
        return
    try:
        limiter.consume(
            current_user.id,
            "realtime",
            RateLimitPolicy(*settings.ai_rate_limit_policy("realtime")),
        )
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many AI requests. Please try again shortly.",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from None
