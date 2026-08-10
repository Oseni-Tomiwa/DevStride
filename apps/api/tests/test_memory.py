from collections.abc import AsyncIterator, Sequence
from typing import Any, cast
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.provider import (
    GenerationResult,
    GenerationStreamChunk,
    ProviderMessage,
    StructuredModel,
)
from app.memory import repository
from app.memory.models import MemoryRecord
from app.memory.schemas import MemoryCandidateBatch, MemoryCreateRequest
from app.memory.service import (
    MemoryValidationError,
    extract_and_persist_candidates,
    memory_context,
    normalize_content,
    reject_secret_like_content,
)
from app.session_summaries.models import SessionSummary


class FakeSession:
    def __init__(self) -> None:
        self.commits = 0

    async def commit(self) -> None:
        self.commits += 1


class CandidateProvider:
    def __init__(self, batch: MemoryCandidateBatch) -> None:
        self.batch = batch

    async def generate_structured(
        self,
        messages: Sequence[ProviderMessage],
        *,
        system_instruction: str,
        response_model: type[StructuredModel],
    ) -> tuple[StructuredModel, GenerationResult]:
        del messages, system_instruction
        return response_model.model_validate(self.batch.model_dump()), GenerationResult(
            text="", provider="openai", model="test"
        )

    async def generate(
        self, messages: Sequence[ProviderMessage], *, system_instruction: str
    ) -> GenerationResult:
        raise NotImplementedError

    async def stream(
        self, messages: Sequence[ProviderMessage], *, system_instruction: str
    ) -> AsyncIterator[GenerationStreamChunk]:
        raise NotImplementedError
        yield GenerationStreamChunk()


def test_manual_memory_contract_rejects_extra_fields_and_blank_content() -> None:
    with pytest.raises(ValidationError):
        MemoryCreateRequest(category="goal", content=" ")
    with pytest.raises(ValidationError):
        MemoryCreateRequest(category="not-a-category", content="Useful goal")  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        MemoryCreateRequest(category="goal", content="Useful goal", user_id=uuid4())  # type: ignore[call-arg]


def test_secret_like_memory_content_is_rejected() -> None:
    with pytest.raises(MemoryValidationError):
        reject_secret_like_content("Remember password=hunter2")
    with pytest.raises(MemoryValidationError):
        reject_secret_like_content("Bearer eyJhbGciOiJIUzI1NiJ9.long-token-value")


def test_memory_normalization_and_prompt_context_are_bounded() -> None:
    assert normalize_content("  Building   APIs ") == "building apis"
    records = [
        MemoryRecord(
            category="goal",
            content="Target backend roles",
            importance=5,
            confidence=1.0,
            source_type="manual",
        )
    ]
    context = memory_context(records)
    assert "Relevant saved user context" in context
    assert "Target backend roles" in context
    assert "current explicit user input overrides" in context


@pytest.mark.asyncio
async def test_low_confidence_candidates_are_discarded_and_high_confidence_persisted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    summary = SessionSummary(
        id=uuid4(),
        conversation_id=uuid4(),
        user_id=user_id,
        session_mode="mentor",
        summary="Observed APIs practice",
        topics_covered=["APIs"],
        strengths=[],
        weaknesses=[],
        recommended_next_steps=[],
    )
    created: list[MemoryRecord] = []

    async def no_existing(*args: Any, **kwargs: Any) -> None:
        del args, kwargs
        return None

    async def create(*args: Any, **kwargs: Any) -> MemoryRecord:
        del kwargs
        record = cast(MemoryRecord, args[1])
        created.append(record)
        return record

    monkeypatch.setattr(repository, "find_equivalent", no_existing)
    monkeypatch.setattr(repository, "create", create)
    batch = MemoryCandidateBatch.model_validate(
        {
            "candidates": [
                {
                    "category": "weakness",
                    "content": "Needs more practice",
                    "importance": 4,
                    "confidence": 0.6,
                },
                {
                    "category": "skill",
                    "content": "Comfortable with APIs",
                    "importance": 4,
                    "confidence": 0.9,
                },
            ]
        }
    )
    await extract_and_persist_candidates(
        cast(AsyncSession, FakeSession()), user_id, summary, CandidateProvider(batch)
    )
    assert [record.category for record in created] == ["skill"]


@pytest.mark.asyncio
async def test_equivalent_candidate_is_reinforced_not_duplicated(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    summary = SessionSummary(
        id=uuid4(),
        conversation_id=uuid4(),
        user_id=user_id,
        session_mode="interview",
        summary="Observed",
        topics_covered=[],
        strengths=[],
        weaknesses=[],
        recommended_next_steps=[],
    )
    existing = MemoryRecord(
        category="skill",
        content="Comfortable with APIs",
        importance=3,
        confidence=0.8,
        source_type="interview_summary",
        reinforcement_count=0,
    )
    reinforced = 0

    async def found(*args: Any, **kwargs: Any) -> MemoryRecord:
        del args, kwargs
        return existing

    async def reinforce(*args: Any, **kwargs: Any) -> MemoryRecord:
        nonlocal reinforced
        del args, kwargs
        reinforced += 1
        return existing

    monkeypatch.setattr(repository, "find_equivalent", found)
    monkeypatch.setattr(repository, "reinforce", reinforce)
    batch = MemoryCandidateBatch.model_validate(
        {
            "candidates": [
                {
                    "category": "skill",
                    "content": "Comfortable with APIs",
                    "importance": 4,
                    "confidence": 0.9,
                }
            ]
        }
    )
    await extract_and_persist_candidates(
        cast(AsyncSession, FakeSession()), user_id, summary, CandidateProvider(batch)
    )
    assert reinforced == 1
