from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.ai.concurrency import ConcurrencyLimitExceeded, InMemoryConcurrencyLimiter
from app.ai.rate_limit import require_ai_rate_limit
from app.auth.models import CurrentUser
from app.core.config import settings
from app.core.rate_limit import InMemoryRateLimiter, RateLimitExceeded, RateLimitPolicy


def test_rate_limiter_enforces_boundary_and_retry_after() -> None:
    now = [100.0]
    limiter = InMemoryRateLimiter(lambda: now[0])
    policy = RateLimitPolicy(limit=2, window_seconds=60)
    user_id = uuid4()

    limiter.consume(user_id, "respond", policy)
    limiter.consume(user_id, "respond", policy)
    with pytest.raises(RateLimitExceeded) as error:
        limiter.consume(user_id, "respond", policy)

    assert error.value.retry_after_seconds == 60
    now[0] = 160.0
    limiter.consume(user_id, "respond", policy)


def test_rate_limiter_gives_users_and_operations_independent_quota() -> None:
    limiter = InMemoryRateLimiter(lambda: 100.0)
    policy = RateLimitPolicy(limit=1, window_seconds=60)
    first_user = uuid4()
    second_user = uuid4()

    limiter.consume(first_user, "respond", policy)
    limiter.consume(second_user, "respond", policy)
    limiter.consume(first_user, "kickoff", policy)


def test_concurrency_limiter_releases_after_success_and_failure_paths() -> None:
    limiter = InMemoryConcurrencyLimiter(global_limit=1, user_limit=1)
    user_id = uuid4()
    limiter.acquire(user_id)
    with pytest.raises(ConcurrencyLimitExceeded):
        limiter.acquire(user_id)
    limiter.release(user_id)
    limiter.acquire(user_id)
    limiter.release(user_id)
    limiter.acquire(uuid4())


@pytest.mark.asyncio
async def test_disabled_provider_does_not_consume_quota() -> None:
    limiter = InMemoryRateLimiter(lambda: 100.0)
    dependency = require_ai_rate_limit("respond")
    user = CurrentUser(id=uuid4(), email=None)

    await dependency(user, None, limiter)
    limiter.consume(user.id, "respond", RateLimitPolicy(limit=1, window_seconds=60))


@pytest.mark.asyncio
async def test_disabled_limiter_does_not_consume_quota() -> None:
    limiter = InMemoryRateLimiter(lambda: 100.0)
    dependency = require_ai_rate_limit("respond")
    user = CurrentUser(id=uuid4(), email=None)
    original_enabled = settings.ai_rate_limit_enabled
    try:
        settings.ai_rate_limit_enabled = False
        await dependency(user, object(), limiter)
    finally:
        settings.ai_rate_limit_enabled = original_enabled

    limiter.consume(user.id, "respond", RateLimitPolicy(limit=1, window_seconds=60))


@pytest.mark.asyncio
async def test_rate_limit_dependency_returns_retry_after_without_calling_provider() -> None:
    limiter = InMemoryRateLimiter(lambda: 100.0)
    dependency = require_ai_rate_limit("respond")
    user = CurrentUser(id=uuid4(), email=None)
    provider = object()
    original_enabled = settings.ai_rate_limit_enabled
    original_requests = settings.ai_rate_limit_requests
    try:
        settings.ai_rate_limit_enabled = True
        settings.ai_rate_limit_requests = 1
        await dependency(user, provider, limiter)
        with pytest.raises(HTTPException) as error:
            await dependency(user, provider, limiter)
    finally:
        settings.ai_rate_limit_enabled = original_enabled
        settings.ai_rate_limit_requests = original_requests

    assert error.value.status_code == 429
    assert error.value.headers == {"Retry-After": "60"}


def test_rate_limit_configuration_has_distinct_operation_defaults() -> None:
    assert settings.ai_rate_limit_policy("respond") == (
        settings.ai_rate_limit_requests,
        settings.ai_rate_limit_window_seconds,
    )
    assert settings.ai_rate_limit_policy("kickoff")[0] == settings.ai_rate_limit_kickoff_requests
    assert settings.ai_rate_limit_policy("summary")[0] == settings.ai_rate_limit_summary_requests
