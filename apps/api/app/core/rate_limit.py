from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from threading import Lock
from typing import Final
from uuid import UUID


@dataclass(frozen=True)
class RateLimitPolicy:
    limit: int
    window_seconds: int


class RateLimitExceeded(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__()
        self.retry_after_seconds = retry_after_seconds


class InMemoryRateLimiter:
    """Small replaceable limiter abstraction backed by process-local state.

    The storage boundary is intentionally narrow so it can be replaced with a
    distributed implementation before running multiple API processes.
    """

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._events: dict[tuple[UUID, str], deque[float]] = {}
        self._lock = Lock()

    def consume(self, user_id: UUID, operation: str, policy: RateLimitPolicy) -> None:
        if policy.limit <= 0 or policy.window_seconds <= 0:
            raise ValueError("rate-limit policy values must be positive")

        now = self._clock()
        key = (user_id, operation)
        with self._lock:
            events = self._events.setdefault(key, deque())
            cutoff = now - policy.window_seconds
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= policy.limit:
                retry_after = max(1, int(events[0] + policy.window_seconds - now + 0.999))
                raise RateLimitExceeded(retry_after)
            events.append(now)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()


AI_OPERATION_RESPOND: Final = "respond"
AI_OPERATION_STREAM: Final = "stream"
AI_OPERATION_RETRY: Final = "retry"
AI_OPERATION_KICKOFF: Final = "kickoff"
AI_OPERATION_SUMMARY: Final = "summary"
