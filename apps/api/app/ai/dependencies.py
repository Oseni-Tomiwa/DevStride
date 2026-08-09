from collections.abc import Iterator

from app.ai.openai_provider import OpenAIProvider
from app.ai.provider import AIProvider
from app.core.config import settings


def get_ai_provider() -> Iterator[AIProvider | None]:
    if not settings.ai_generation_enabled:
        yield None
        return

    if settings.openai_api_key is None:
        yield None
        return

    yield OpenAIProvider(settings.openai_api_key, settings.openai_model)
