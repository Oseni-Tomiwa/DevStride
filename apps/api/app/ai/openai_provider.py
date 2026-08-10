from collections.abc import AsyncIterator, Sequence
from time import perf_counter
from typing import Any, cast

from openai import AsyncOpenAI

from app.ai.prompts import SYSTEM_INSTRUCTION
from app.ai.provider import (
    AIProviderError,
    GenerationResult,
    GenerationStreamChunk,
    ProviderMessage,
)

OPENAI_PROVIDER_NAME = "openai"
OPENAI_REQUEST_TIMEOUT_SECONDS = 30.0


class OpenAIProvider:
    def __init__(self, api_key: str, model: str) -> None:
        self.model = model
        self.client = AsyncOpenAI(api_key=api_key, timeout=OPENAI_REQUEST_TIMEOUT_SECONDS)

    async def generate(self, messages: Sequence[ProviderMessage]) -> GenerationResult:
        started_at = perf_counter()
        request_input = [{"role": message.role, "content": message.content} for message in messages]
        try:
            response = await self.client.responses.create(
                model=self.model,
                instructions=SYSTEM_INSTRUCTION,
                input=cast(Any, request_input),
                timeout=OPENAI_REQUEST_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            raise AIProviderError from exc

        response_data = cast(Any, response)
        usage = getattr(response_data, "usage", None)
        elapsed_ms = int((perf_counter() - started_at) * 1000)
        text = getattr(response_data, "output_text", "")
        if not isinstance(text, str) or not text.strip():
            raise AIProviderError

        input_tokens = getattr(usage, "input_tokens", None)
        output_tokens = getattr(usage, "output_tokens", None)
        response_id = getattr(response_data, "id", None)
        response_model = getattr(response_data, "model", None)
        return GenerationResult(
            text=text.strip(),
            provider=OPENAI_PROVIDER_NAME,
            model=response_model if isinstance(response_model, str) else self.model,
            input_tokens=input_tokens if isinstance(input_tokens, int) else None,
            output_tokens=output_tokens if isinstance(output_tokens, int) else None,
            latency_ms=elapsed_ms,
            provider_response_id=response_id if isinstance(response_id, str) else None,
        )

    async def stream(
        self, messages: Sequence[ProviderMessage]
    ) -> AsyncIterator[GenerationStreamChunk]:
        started_at = perf_counter()
        request_input = [{"role": message.role, "content": message.content} for message in messages]
        try:
            stream = await self.client.responses.create(
                model=self.model,
                instructions=SYSTEM_INSTRUCTION,
                input=cast(Any, request_input),
                stream=True,
                timeout=OPENAI_REQUEST_TIMEOUT_SECONDS,
            )
            async for event in stream:
                event_type = getattr(event, "type", None)
                if event_type == "response.output_text.delta":
                    delta = getattr(event, "delta", "")
                    if isinstance(delta, str) and delta:
                        yield GenerationStreamChunk(delta=delta)
                elif event_type == "response.completed":
                    response = getattr(event, "response", None)
                    usage = getattr(response, "usage", None)
                    response_id = getattr(response, "id", None)
                    response_model = getattr(response, "model", None)
                    yield GenerationStreamChunk(
                        result=GenerationResult(
                            text="",
                            provider=OPENAI_PROVIDER_NAME,
                            model=response_model if isinstance(response_model, str) else self.model,
                            input_tokens=_int_or_none(getattr(usage, "input_tokens", None)),
                            output_tokens=_int_or_none(getattr(usage, "output_tokens", None)),
                            latency_ms=int((perf_counter() - started_at) * 1000),
                            provider_response_id=(
                                response_id if isinstance(response_id, str) else None
                            ),
                        )
                    )
        except Exception as exc:
            raise AIProviderError from exc


def _int_or_none(value: object) -> int | None:
    return value if isinstance(value, int) else None
