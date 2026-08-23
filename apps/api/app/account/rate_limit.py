from uuid import UUID

from fastapi import HTTPException, status

from app.core.config import settings
from app.core.rate_limit import InMemoryRateLimiter, RateLimitExceeded, RateLimitPolicy

_export_limiter = InMemoryRateLimiter()


def get_export_limiter() -> InMemoryRateLimiter:
    return _export_limiter


def consume_export_rate_limit(user_id: UUID) -> None:
    try:
        _export_limiter.consume(
            user_id,
            "account-export",
            RateLimitPolicy(
                settings.account_export_requests, settings.account_export_window_seconds
            ),
        )
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many data export requests. Please try again later.",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from None
