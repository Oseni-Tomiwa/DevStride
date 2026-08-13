from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations.models import Message
from app.realtime.analytics import compute_live_analytics
from app.realtime.models import RealtimeSessionAnalytics, RealtimeSessionEvent

USER_ID = UUID("12345678-1234-5678-1234-567812345678")
START = datetime(2026, 1, 1, tzinfo=UTC)


class _Result:
    def __init__(self, values: list[Any], scalar: Any = None) -> None:
        self.values = values
        self.scalar = scalar

    def scalars(self) -> "_Result":
        return self

    def all(self) -> list[Any]:
        return self.values

    def scalar_one_or_none(self) -> Any:
        return self.scalar


class _Session:
    def __init__(self, events: list[RealtimeSessionEvent], messages: list[Message]) -> None:
        self.results = [_Result([], None), _Result(events), _Result(messages)]
        self.added: list[Any] = []

    async def execute(self, statement: Any) -> _Result:
        del statement
        return self.results.pop(0)

    def add(self, value: Any) -> None:
        self.added.append(value)

    async def flush(self) -> None:
        pass

    async def refresh(self, value: Any) -> None:
        value.created_at = START
        value.updated_at = START

    async def commit(self) -> None:
        pass


def event(event_type: str, seconds: int, event_id: str | None = None) -> RealtimeSessionEvent:
    return RealtimeSessionEvent(
        id=uuid4(),
        conversation_id=uuid4(),
        user_id=USER_ID,
        event_id=event_id or f"event-{seconds}-{event_type}",
        event_type=event_type,
        occurred_at=START + timedelta(seconds=seconds),
    )


def message(role: str, content: str, seconds: int) -> Message:
    return Message(
        id=uuid4(),
        conversation_id=uuid4(),
        role=role,
        content=content,
        created_at=START + timedelta(seconds=seconds),
    )


@pytest.mark.asyncio
async def test_live_analytics_computes_timing_talk_balance_and_fillers() -> None:
    events = [
        event("session_connected", 0),
        event("interviewer_speech_started", 1),
        event("interviewer_speech_finalized", 3),
        event("candidate_speech_started", 4),
        event("candidate_speech_finalized", 10),
        event("interviewer_speech_started", 11),
        event("interviewer_speech_finalized", 12),
        event("candidate_speech_started", 13),
        event("candidate_speech_finalized", 16),
        event("interruption", 14),
        event("reconnect", 17),
        event("mute", 18),
        event("session_ended", 20),
    ]
    messages = [
        message("assistant", "Tell me about your API design.", 3),
        message("user", "Um, I like the simple approach, you know.", 10),
        message("assistant", "What tradeoff would you consider?", 12),
        message("user", "Basically caching helps, uh, with latency.", 16),
    ]
    session = _Session(events, messages)

    analytics = await compute_live_analytics(cast(AsyncSession, session), USER_ID, uuid4())

    assert analytics.candidate_speaking_ms == 9_000
    assert analytics.interviewer_speaking_ms == 3_000
    assert analytics.candidate_talk_share == 75
    assert analytics.candidate_turn_count == 2
    assert analytics.interviewer_turn_count == 2
    assert analytics.average_candidate_response_ms == 4_500
    assert analytics.longest_candidate_response_ms == 6_000
    assert analytics.average_response_latency_ms == 1_000
    assert analytics.interruption_count == 1
    assert analytics.reconnect_count == 1
    assert analytics.mute_count == 1
    assert analytics.session_duration_ms == 20_000
    assert analytics.filler_word_count == 5
    assert analytics.filler_words_per_100 is not None
    assert analytics.approximate_wpm is not None
    assert len(session.added) == 1


@pytest.mark.asyncio
async def test_completed_analytics_snapshot_is_idempotent() -> None:
    existing = RealtimeSessionAnalytics(
        conversation_id=uuid4(), user_id=USER_ID, candidate_turn_count=2, interviewer_turn_count=1
    )
    session = _Session([], [])
    session.results = [_Result([], existing)]

    result = await compute_live_analytics(
        cast(AsyncSession, session), USER_ID, existing.conversation_id
    )

    assert result is existing
    assert session.added == []
