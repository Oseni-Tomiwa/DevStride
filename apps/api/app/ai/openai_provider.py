import logging
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
    StructuredModel,
)

OPENAI_PROVIDER_NAME = "openai"
OPENAI_REQUEST_TIMEOUT_SECONDS = 30.0
PRACTICE_KICKOFF_INPUT = "Begin the configured practice session with the next appropriate prompt."
# Backwards-compatible alias for existing provider tests/imports.
INTERVIEW_KICKOFF_INPUT = PRACTICE_KICKOFF_INPUT
logger = logging.getLogger(__name__)


def _request_input(messages: Sequence[ProviderMessage]) -> list[dict[str, str]] | str:
    request_input = [{"role": message.role, "content": message.content} for message in messages]
    return request_input or PRACTICE_KICKOFF_INPUT


class OpenAIProvider:
    def __init__(self, api_key: str, model: str) -> None:
        self.model = model
        self.client = AsyncOpenAI(api_key=api_key, timeout=OPENAI_REQUEST_TIMEOUT_SECONDS)

    async def generate(
        self,
        messages: Sequence[ProviderMessage],
        *,
        system_instruction: str = SYSTEM_INSTRUCTION,
    ) -> GenerationResult:
        started_at = perf_counter()
        request_input = _request_input(messages)
        try:
            response = await self.client.responses.create(
                model=self.model,
                instructions=system_instruction,
                input=cast(Any, request_input),
                timeout=OPENAI_REQUEST_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            logger.warning(
                "AI provider request failed",
                extra={"operation": "generate", "error_type": type(exc).__name__},
            )
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

    async def generate_structured(
        self,
        messages: Sequence[ProviderMessage],
        *,
        system_instruction: str,
        response_model: type[StructuredModel],
    ) -> tuple[StructuredModel, GenerationResult]:
        started_at = perf_counter()
        request_input = _request_input(messages)
        try:
            response = await self.client.responses.parse(
                model=self.model,
                instructions=system_instruction,
                input=cast(Any, request_input),
                text_format=response_model,
                timeout=OPENAI_REQUEST_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            logger.warning(
                "AI provider structured request failed",
                extra={"operation": "generate_structured", "error_type": type(exc).__name__},
            )
            raise AIProviderError from exc

        response_data = cast(Any, response)
        parsed = getattr(response_data, "output_parsed", None)
        if not isinstance(parsed, response_model):
            raise AIProviderError
        usage = getattr(response_data, "usage", None)
        response_id = getattr(response_data, "id", None)
        response_model_name = getattr(response_data, "model", None)
        result = GenerationResult(
            text="",
            provider=OPENAI_PROVIDER_NAME,
            model=response_model_name if isinstance(response_model_name, str) else self.model,
            input_tokens=_int_or_none(getattr(usage, "input_tokens", None)),
            output_tokens=_int_or_none(getattr(usage, "output_tokens", None)),
            latency_ms=int((perf_counter() - started_at) * 1000),
            provider_response_id=response_id if isinstance(response_id, str) else None,
        )
        return parsed, result

    async def stream(
        self,
        messages: Sequence[ProviderMessage],
        *,
        system_instruction: str = SYSTEM_INSTRUCTION,
    ) -> AsyncIterator[GenerationStreamChunk]:
        started_at = perf_counter()
        request_input = _request_input(messages)
        try:
            stream = await self.client.responses.create(
                model=self.model,
                instructions=system_instruction,
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
            logger.warning(
                "AI provider request failed",
                extra={"operation": "stream", "error_type": type(exc).__name__},
            )
            raise AIProviderError from exc


def _int_or_none(value: object) -> int | None:
    return value if isinstance(value, int) else None
