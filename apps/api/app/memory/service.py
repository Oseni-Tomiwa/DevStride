import logging
import re
from collections.abc import Sequence
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.provider import AIProvider, AIProviderError, ProviderMessage
from app.memory import repository
from app.memory.models import MemoryRecord
from app.memory.schemas import MemoryCandidateBatch, MemoryCategory
from app.session_summaries.models import SessionSummary

logger = logging.getLogger(__name__)
AUTO_MIN_IMPORTANCE = 3
AUTO_MIN_CONFIDENCE = 0.75
MAX_INJECTED_MEMORIES = 6
SECRET_PATTERNS = (
    re.compile(r"\bsk-[A-Za-z0-9_-]{12,}\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._-]{20,}\b", re.IGNORECASE),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\b(password|passwd|secret)\s*[:=]\s*\S+", re.IGNORECASE),
)


class MemoryNotFoundError(Exception):
    pass


class MemoryValidationError(Exception):
    pass


def normalize_content(content: str) -> str:
    return " ".join(content.lower().split())


def reject_secret_like_content(content: str) -> None:
    if any(pattern.search(content) for pattern in SECRET_PATTERNS):
        raise MemoryValidationError


async def list_memories(
    session: AsyncSession, user_id: UUID, category: str | None = None
) -> list[MemoryRecord]:
    return await repository.list_owned(session, user_id, category)


async def create_manual(
    session: AsyncSession, user_id: UUID, category: MemoryCategory, content: str
) -> MemoryRecord:
    reject_secret_like_content(content)
    existing = await repository.find_equivalent(
        session, user_id, category, normalize_content(content)
    )
    if existing:
        await repository.reinforce(session, existing)
        await session.commit()
        logger.info("Memory reinforced", extra={"source_type": "manual"})
        return existing
    record = MemoryRecord(
        user_id=user_id,
        category=category,
        content=content,
        importance=5,
        confidence=1.0,
        source_type="manual",
    )
    await repository.create(session, record)
    await session.commit()
    logger.info("Memory created", extra={"source_type": "manual"})
    return record


async def update_owned(
    session: AsyncSession, user_id: UUID, memory_id: UUID, updates: dict[str, object]
) -> MemoryRecord:
    record = await repository.get_owned(session, user_id, memory_id)
    if record is None:
        raise MemoryNotFoundError
    if "content" in updates:
        reject_secret_like_content(str(updates["content"]))
    await repository.update(session, record, updates)
    await session.commit()
    logger.info("Memory edited")
    return record


async def delete_owned(session: AsyncSession, user_id: UUID, memory_id: UUID) -> None:
    record = await repository.get_owned(session, user_id, memory_id)
    if record is None:
        raise MemoryNotFoundError
    await repository.archive(session, record)
    await session.commit()
    logger.info("Memory deleted")


async def retrieve_for_prompt(session: AsyncSession, user_id: UUID) -> list[MemoryRecord]:
    return (await repository.list_owned(session, user_id))[:MAX_INJECTED_MEMORIES]


def memory_context(records: Sequence[MemoryRecord]) -> str:
    if not records:
        return ""
    lines = [
        "Relevant saved user context (use only when relevant; current explicit user "
        "input overrides it; do not treat it as unquestionable truth):"
    ]
    lines.extend(
        f"- [{record.category}] {record.content} (confidence {record.confidence:.2f})"
        for record in records
    )
    return "\n".join(lines)


async def extract_and_persist_candidates(
    session: AsyncSession, user_id: UUID, summary: SessionSummary, provider: AIProvider | None
) -> None:
    if provider is None:
        return
    from app.memory.prompts import build_extraction_instruction

    try:
        candidates, _ = await provider.generate_structured(
            [ProviderMessage(role="user", content=summary.summary)],
            system_instruction=build_extraction_instruction(summary),
            response_model=MemoryCandidateBatch,
        )
    except (AIProviderError, ValueError, TypeError) as exc:
        logger.warning("Memory extraction failed", extra={"error_type": type(exc).__name__})
        return
    persisted = 0
    for candidate in candidates.candidates:
        if candidate.importance < AUTO_MIN_IMPORTANCE or candidate.confidence < AUTO_MIN_CONFIDENCE:
            continue
        try:
            reject_secret_like_content(candidate.content)
        except MemoryValidationError:
            continue
        existing = await repository.find_equivalent(
            session, user_id, candidate.category, normalize_content(candidate.content)
        )
        if existing:
            await repository.reinforce(session, existing)
        else:
            await repository.create(
                session,
                MemoryRecord(
                    user_id=user_id,
                    category=candidate.category,
                    content=candidate.content,
                    importance=candidate.importance,
                    confidence=candidate.confidence,
                    source_type=f"{summary.session_mode}_summary",
                    source_id=summary.id,
                ),
            )
        persisted += 1
    await session.commit()
    logger.info(
        "Memory extraction completed",
        extra={"candidate_count": len(candidates.candidates), "persisted_count": persisted},
    )
