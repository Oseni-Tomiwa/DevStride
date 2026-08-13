from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations.models import Message
from app.realtime.models import RealtimeSessionAnalytics, RealtimeSessionEvent

FILLER_PATTERN = re.compile(r"\b(?:you\s+know|basically|actually|um|uh|erm|like)\b", re.IGNORECASE)
WORDS_PATTERN = re.compile(r"\b[\w']+\b", re.UNICODE)


def _duration(events: list[RealtimeSessionEvent], speaker: str) -> list[int]:
    starts = [
        event.occurred_at for event in events if event.event_type == f"{speaker}_speech_started"
    ]
    stops = [
        event.occurred_at for event in events if event.event_type == f"{speaker}_speech_finalized"
    ]
    durations: list[int] = []
    stop_index = 0
    for start in starts:
        while stop_index < len(stops) and stops[stop_index] < start:
            stop_index += 1
        if stop_index == len(stops):
            break
        milliseconds = int((stops[stop_index] - start).total_seconds() * 1000)
        if milliseconds >= 0:
            durations.append(milliseconds)
        stop_index += 1
    return durations


def _response_latencies(events: list[RealtimeSessionEvent]) -> list[int]:
    interviewer_stops = [
        event.occurred_at for event in events if event.event_type == "interviewer_speech_finalized"
    ]
    candidate_starts = [
        event.occurred_at for event in events if event.event_type == "candidate_speech_started"
    ]
    latencies: list[int] = []
    for start in candidate_starts:
        previous = [stop for stop in interviewer_stops if stop <= start]
        if previous:
            latency = int((start - max(previous)).total_seconds() * 1000)
            if latency >= 0:
                latencies.append(latency)
    return latencies


def _event_count(events: Iterable[RealtimeSessionEvent], event_type: str) -> int:
    return sum(event.event_type == event_type for event in events)


def _total_duration(values: list[int]) -> int | None:
    return sum(values) if values else None


async def compute_live_analytics(
    session: AsyncSession, user_id: UUID, conversation_id: UUID
) -> RealtimeSessionAnalytics:
    existing = await get_live_analytics(session, user_id, conversation_id)
    if existing is not None:
        return existing

    events_result = await session.execute(
        select(RealtimeSessionEvent)
        .where(
            RealtimeSessionEvent.conversation_id == conversation_id,
            RealtimeSessionEvent.user_id == user_id,
        )
        .order_by(RealtimeSessionEvent.occurred_at.asc(), RealtimeSessionEvent.id.asc())
    )
    events = list(events_result.scalars().all())
    messages_result = await session.execute(
        select(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.role.in_(("user", "assistant")),
        )
        .order_by(Message.created_at.asc(), Message.id.asc())
    )
    messages = list(messages_result.scalars().all())
    candidate_durations = _duration(events, "candidate")
    interviewer_durations = _duration(events, "interviewer")
    candidate_ms = _total_duration(candidate_durations)
    interviewer_ms = _total_duration(interviewer_durations)
    candidate_total_ms = candidate_ms or 0
    interviewer_total_ms = interviewer_ms or 0
    total_speaking_ms = candidate_total_ms + interviewer_total_ms
    candidate_words = sum(
        len(WORDS_PATTERN.findall(message.content))
        for message in messages
        if message.role == "user"
    )
    total_words = sum(len(WORDS_PATTERN.findall(message.content)) for message in messages)
    filler_count = sum(
        len(FILLER_PATTERN.findall(message.content))
        for message in messages
        if message.role == "user"
    )
    connected = next((event for event in events if event.event_type == "session_connected"), None)
    ended = next((event for event in reversed(events) if event.event_type == "session_ended"), None)
    session_duration = None
    if connected and ended and ended.occurred_at >= connected.occurred_at:
        session_duration = int((ended.occurred_at - connected.occurred_at).total_seconds() * 1000)
    latencies = _response_latencies(events)
    analytics = RealtimeSessionAnalytics(
        conversation_id=conversation_id,
        user_id=user_id,
        candidate_speaking_ms=candidate_ms,
        interviewer_speaking_ms=interviewer_ms,
        candidate_talk_share=(candidate_total_ms / total_speaking_ms * 100)
        if total_speaking_ms
        else None,
        candidate_turn_count=_event_count(events, "candidate_speech_finalized"),
        interviewer_turn_count=_event_count(events, "interviewer_speech_finalized"),
        average_candidate_response_ms=round(sum(candidate_durations) / len(candidate_durations))
        if candidate_durations
        else None,
        longest_candidate_response_ms=max(candidate_durations) if candidate_durations else None,
        average_response_latency_ms=round(sum(latencies) / len(latencies)) if latencies else None,
        interruption_count=_event_count(events, "interruption"),
        reconnect_count=_event_count(events, "reconnect"),
        mute_count=_event_count(events, "mute"),
        session_duration_ms=session_duration,
        finalized_word_count=total_words,
        approximate_wpm=(candidate_words / (candidate_total_ms / 60_000))
        if candidate_total_ms > 0
        else None,
        filler_word_count=filler_count,
        filler_words_per_100=(filler_count / candidate_words * 100) if candidate_words else None,
    )
    session.add(analytics)
    await session.flush()
    await session.refresh(analytics)
    await session.commit()
    return analytics


async def get_live_analytics(
    session: AsyncSession, user_id: UUID, conversation_id: UUID
) -> RealtimeSessionAnalytics | None:
    result = await session.execute(
        select(RealtimeSessionAnalytics).where(
            RealtimeSessionAnalytics.conversation_id == conversation_id,
            RealtimeSessionAnalytics.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


def now_utc() -> datetime:
    return datetime.now(UTC)
