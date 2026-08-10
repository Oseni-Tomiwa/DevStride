from types import SimpleNamespace
from typing import Any, cast

import pytest

from app.ai.openai_provider import OpenAIProvider
from app.ai.provider import AIProviderError, ProviderMessage


class FakeResponses:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return SimpleNamespace(
            id="response-123",
            model="configured-model",
            output_text="  A useful answer.  ",
            usage=SimpleNamespace(input_tokens=12, output_tokens=7),
        )


class FakeClient:
    def __init__(self, **kwargs: Any) -> None:
        self.kwargs = kwargs
        self.responses = FakeResponses()


@pytest.mark.asyncio
async def test_openai_provider_normalizes_responses_api_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_client = FakeClient()

    def make_client(**kwargs: Any) -> FakeClient:
        del kwargs
        return fake_client

    monkeypatch.setattr("app.ai.openai_provider.AsyncOpenAI", cast(Any, make_client))
    provider = OpenAIProvider("test-key", "configured-model")

    result = await provider.generate(
        [
            ProviderMessage(role="user", content="How do indexes work?"),
        ]
    )

    assert result.text == "A useful answer."
    assert result.provider == "openai"
    assert result.model == "configured-model"
    assert result.input_tokens == 12
    assert result.output_tokens == 7
    assert result.provider_response_id == "response-123"
    assert fake_client.responses.calls[0]["instructions"]
    assert fake_client.responses.calls[0]["input"] == [
        {"role": "user", "content": "How do indexes work?"}
    ]


@pytest.mark.asyncio
async def test_openai_provider_wraps_sdk_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FailingResponses:
        async def create(self, **kwargs: Any) -> Any:
            del kwargs
            raise RuntimeError("private provider details")

    class FailingClient:
        responses = FailingResponses()

    def failing_openai_client(**kwargs: Any) -> FailingClient:
        del kwargs
        return FailingClient()

    monkeypatch.setattr("app.ai.openai_provider.AsyncOpenAI", cast(Any, failing_openai_client))
    provider = OpenAIProvider("test-key", "configured-model")

    with pytest.raises(AIProviderError) as error:
        await provider.generate([])

    assert str(error.value) == ""


@pytest.mark.asyncio
async def test_openai_provider_normalizes_stream_deltas_and_completion(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class StreamingResponses:
        async def create(self, **kwargs: Any) -> Any:
            assert kwargs["stream"] is True

            async def events() -> Any:
                yield SimpleNamespace(type="response.output_text.delta", delta="Hello ")
                yield SimpleNamespace(type="response.output_text.delta", delta="there")
                yield SimpleNamespace(
                    type="response.completed",
                    response=SimpleNamespace(
                        id="response-stream-123",
                        model="configured-model",
                        usage=SimpleNamespace(input_tokens=8, output_tokens=3),
                    ),
                )

            return events()

    class StreamingClient:
        responses = StreamingResponses()

    def make_streaming_client(**kwargs: Any) -> StreamingClient:
        del kwargs
        return StreamingClient()

    monkeypatch.setattr(
        "app.ai.openai_provider.AsyncOpenAI",
        cast(Any, make_streaming_client),
    )
    provider = OpenAIProvider("test-key", "configured-model")

    chunks = [
        chunk async for chunk in provider.stream([ProviderMessage(role="user", content="Hello")])
    ]

    assert [chunk.delta for chunk in chunks if chunk.delta] == ["Hello ", "there"]
    result = next(chunk.result for chunk in chunks if chunk.result is not None)
    assert result.provider == "openai"
    assert result.provider_response_id == "response-stream-123"
    assert result.input_tokens == 8
    assert result.output_tokens == 3
