import logging
from dataclasses import dataclass, field
from time import perf_counter
from uuid import UUID, uuid4

logger = logging.getLogger(__name__)


@dataclass
class PracticeLatencyTrace:
    """Debug-only, content-free timing for one practice request."""

    mode: str
    operation: str
    correlation_id: UUID = field(default_factory=uuid4)
    started_at: float = field(default_factory=perf_counter)

    def mark(self, stage: str) -> None:
        if not logger.isEnabledFor(logging.DEBUG):
            return
        elapsed_ms = max(0, int((perf_counter() - self.started_at) * 1000))
        logger.debug(
            "Practice latency stage",
            extra={
                "mode": self.mode,
                "operation": self.operation,
                "stage": stage,
                "elapsed_ms": elapsed_ms,
                "correlation_id": str(self.correlation_id),
            },
        )
