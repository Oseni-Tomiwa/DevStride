from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ProviderMessage:
    role: str
    content: str


@dataclass(frozen=True)
class GenerationResult:
    text: str
    provider: str
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    latency_ms: int | None = None
    provider_response_id: str | None = None


class AIProviderError(Exception):
    """Safe application-level error for provider failures."""


class AIProvider(Protocol):
    async def generate(self, messages: Sequence[ProviderMessage]) -> GenerationResult:
        """Generate one assistant response from bounded conversation context."""
        ...
