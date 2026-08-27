import logging
from contextvars import ContextVar, Token
from dataclasses import dataclass, field
from time import perf_counter
from uuid import UUID, uuid4

logger = logging.getLogger(__name__)


@dataclass
class PracticeLatencyTrace:
    """Content-free timing for one request or provider operation."""

    mode: str
    operation: str
    correlation_id: UUID = field(default_factory=uuid4)
    started_at: float = field(default_factory=perf_counter)
    _seen_stages: set[str] = field(default_factory=lambda: set[str](), repr=False)

    def mark(self, stage: str) -> None:
        if not logger.isEnabledFor(logging.INFO):
            return
        elapsed_ms = max(0, int((perf_counter() - self.started_at) * 1000))
        logger.info(
            "Practice latency stage",
            extra={
                "mode": self.mode,
                "operation": self.operation,
                "stage": stage,
                "elapsed_ms": elapsed_ms,
                "correlation_id": str(self.correlation_id),
            },
        )

    def mark_once(self, stage: str) -> None:
        if stage in self._seen_stages:
            return
        self._seen_stages.add(stage)
        self.mark(stage)

    def complete(self, status_code: int | None = None) -> None:
        elapsed_ms = max(0, int((perf_counter() - self.started_at) * 1000))
        if not logger.isEnabledFor(logging.INFO):
            return
        extra: dict[str, object] = {
            "mode": self.mode,
            "operation": self.operation,
            "stage": "request_completed",
            "elapsed_ms": elapsed_ms,
            "total_ms": elapsed_ms,
            "correlation_id": str(self.correlation_id),
        }
        if status_code is not None:
            extra["status_code"] = status_code
        logger.info("Practice latency request completed", extra=extra)


_current_trace: ContextVar[PracticeLatencyTrace | None] = ContextVar(
    "devstride_current_latency_trace", default=None
)


def bind_trace(trace: PracticeLatencyTrace) -> Token[PracticeLatencyTrace | None]:
    return _current_trace.set(trace)


def reset_trace(token: Token[PracticeLatencyTrace | None]) -> None:
    _current_trace.reset(token)


def get_current_trace() -> PracticeLatencyTrace | None:
    return _current_trace.get()


def get_or_create_trace(mode: str, operation: str) -> PracticeLatencyTrace:
    trace = get_current_trace()
    if trace is None:
        trace = PracticeLatencyTrace(mode, operation)
    else:
        trace.mode = mode
        trace.operation = operation
    return trace


def mark_current_stage(stage: str) -> None:
    trace = get_current_trace()
    if trace is not None:
        trace.mark_once(stage)
