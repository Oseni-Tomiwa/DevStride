from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.models import CurrentUser
from app.conversations.models import Conversation
from app.core.config import settings
from app.goals.models import Goal
from app.memory.models import MemoryRecord
from app.profiles.models import Profile
from app.realtime.models import RealtimeSessionAnalytics, RealtimeSessionEvent
from app.session_summaries.models import SessionSummary


class AccountDeletionConfigurationError(Exception):
    pass


class AccountDeletionProviderError(Exception):
    pass


def _timestamp(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


async def build_export(session: AsyncSession, current_user: CurrentUser) -> dict[str, Any]:
    user_id = current_user.id
    profile = (
        await session.execute(select(Profile).where(Profile.user_id == user_id))
    ).scalar_one_or_none()
    goals = list(
        (
            await session.execute(
                select(Goal)
                .where(Goal.user_id == user_id)
                .options(selectinload(Goal.focus_areas))
                .order_by(Goal.created_at.asc(), Goal.id.asc())
            )
        )
        .scalars()
        .unique()
        .all()
    )
    conversations = list(
        (
            await session.execute(
                select(Conversation)
                .where(Conversation.user_id == user_id)
                .options(selectinload(Conversation.messages))
                .order_by(Conversation.created_at.asc(), Conversation.id.asc())
            )
        )
        .scalars()
        .unique()
        .all()
    )
    conversation_ids = [conversation.id for conversation in conversations]
    summaries = []
    analytics = []
    if conversation_ids:
        summaries = list(
            (
                await session.execute(
                    select(SessionSummary)
                    .where(
                        SessionSummary.user_id == user_id,
                        SessionSummary.conversation_id.in_(conversation_ids),
                    )
                    .order_by(SessionSummary.created_at.asc(), SessionSummary.id.asc())
                )
            )
            .scalars()
            .all()
        )
        analytics = list(
            (
                await session.execute(
                    select(RealtimeSessionAnalytics)
                    .where(
                        RealtimeSessionAnalytics.user_id == user_id,
                        RealtimeSessionAnalytics.conversation_id.in_(conversation_ids),
                    )
                    .order_by(
                        RealtimeSessionAnalytics.created_at.asc(),
                        RealtimeSessionAnalytics.id.asc(),
                    )
                )
            )
            .scalars()
            .all()
        )
    memories = list(
        (
            await session.execute(
                select(MemoryRecord)
                .where(MemoryRecord.user_id == user_id)
                .order_by(MemoryRecord.created_at.asc(), MemoryRecord.id.asc())
            )
        )
        .scalars()
        .all()
    )

    return {
        "export_version": "1",
        "generated_at": datetime.now(UTC).isoformat(),
        "account": {"email": current_user.email},
        "profile": (
            {
                "display_name": profile.display_name,
                "current_level": profile.current_level,
                "target_role": profile.target_role,
                "preferred_stack": profile.preferred_stack,
                "communication_goal": profile.communication_goal,
                "feedback_preference": profile.feedback_preference,
                "onboarding_completed": profile.onboarding_completed,
                "created_at": _timestamp(profile.created_at),
                "updated_at": _timestamp(profile.updated_at),
            }
            if profile is not None
            else None
        ),
        "goals": [
            {
                "title": goal.title,
                "description": goal.description,
                "goal_type": goal.goal_type,
                "status": goal.status,
                "completed_at": _timestamp(goal.completed_at),
                "created_at": _timestamp(goal.created_at),
                "updated_at": _timestamp(goal.updated_at),
                "focus_areas": [
                    {
                        "title": focus.title,
                        "description": focus.description,
                        "practice_mode": focus.practice_mode,
                        "practice_config": focus.practice_config,
                        "position": focus.position,
                        "status": focus.status,
                        "completed_at": _timestamp(focus.completed_at),
                    }
                    for focus in goal.focus_areas
                ],
            }
            for goal in goals
        ],
        "conversations": [
            {
                "title": conversation.title,
                "mode": conversation.mode,
                "persona": conversation.persona,
                "status": conversation.status,
                "created_at": _timestamp(conversation.created_at),
                "updated_at": _timestamp(conversation.updated_at),
                "messages": [
                    {
                        "role": message.role,
                        "content": message.content,
                        "created_at": _timestamp(message.created_at),
                    }
                    for message in sorted(
                        conversation.messages,
                        key=lambda item: (item.created_at, str(item.id)),
                    )
                ],
            }
            for conversation in conversations
        ],
        "practice_reports": [
            {
                "session_mode": summary.session_mode,
                "summary": summary.summary,
                "topics_covered": summary.topics_covered,
                "strengths": summary.strengths,
                "weaknesses": summary.weaknesses,
                "recommended_next_steps": summary.recommended_next_steps,
                "concepts_practiced": summary.concepts_practiced,
                "exercises_completed": summary.exercises_completed,
                "correctness_rating": summary.correctness_rating,
                "clarity_rating": summary.clarity_rating,
                "depth_rating": summary.depth_rating,
                "reasoning_rating": summary.reasoning_rating,
                "created_at": _timestamp(summary.created_at),
                "updated_at": _timestamp(summary.updated_at),
            }
            for summary in summaries
        ],
        "realtime_practice_metrics": [
            {
                "candidate_speaking_ms": item.candidate_speaking_ms,
                "interviewer_speaking_ms": item.interviewer_speaking_ms,
                "candidate_talk_share": item.candidate_talk_share,
                "candidate_turn_count": item.candidate_turn_count,
                "interviewer_turn_count": item.interviewer_turn_count,
                "average_candidate_response_ms": item.average_candidate_response_ms,
                "longest_candidate_response_ms": item.longest_candidate_response_ms,
                "average_response_latency_ms": item.average_response_latency_ms,
                "interruption_count": item.interruption_count,
                "reconnect_count": item.reconnect_count,
                "mute_count": item.mute_count,
                "session_duration_ms": item.session_duration_ms,
                "finalized_word_count": item.finalized_word_count,
                "approximate_wpm": item.approximate_wpm,
                "filler_word_count": item.filler_word_count,
                "filler_words_per_100": item.filler_words_per_100,
                "created_at": _timestamp(item.created_at),
                "updated_at": _timestamp(item.updated_at),
            }
            for item in analytics
        ],
        "memory": [
            {
                "category": memory.category,
                "content": memory.content,
                "importance": memory.importance,
                "status": memory.status,
                "last_reinforced_at": _timestamp(memory.last_reinforced_at),
                "reinforcement_count": memory.reinforcement_count,
                "created_at": _timestamp(memory.created_at),
                "updated_at": _timestamp(memory.updated_at),
            }
            for memory in memories
        ],
    }


async def delete_owned_data(session: AsyncSession, user_id: UUID) -> None:
    await session.execute(
        delete(RealtimeSessionEvent).where(RealtimeSessionEvent.user_id == user_id)
    )
    await session.execute(
        delete(RealtimeSessionAnalytics).where(RealtimeSessionAnalytics.user_id == user_id)
    )
    await session.execute(delete(SessionSummary).where(SessionSummary.user_id == user_id))
    await session.execute(delete(Conversation).where(Conversation.user_id == user_id))
    await session.execute(delete(Goal).where(Goal.user_id == user_id))
    await session.execute(delete(MemoryRecord).where(MemoryRecord.user_id == user_id))
    await session.execute(delete(Profile).where(Profile.user_id == user_id))


def _supabase_auth_url() -> str:
    issuer = settings.supabase_jwt_issuer
    if not issuer:
        raise AccountDeletionConfigurationError
    return issuer.removesuffix("/auth/v1") + "/auth/v1/admin/users"


def _ensure_supabase_deletion_configured() -> None:
    if not settings.supabase_service_role_key or not settings.supabase_jwt_issuer:
        raise AccountDeletionConfigurationError


async def delete_supabase_user(user_id: UUID) -> None:
    service_role_key = settings.supabase_service_role_key
    if not service_role_key:
        raise AccountDeletionConfigurationError
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.delete(
                f"{_supabase_auth_url()}/{user_id}",
                headers={
                    "Authorization": f"Bearer {service_role_key}",
                    "apikey": service_role_key,
                },
            )
    except httpx.HTTPError as exc:
        raise AccountDeletionProviderError from exc
    if response.status_code not in {200, 204, 404}:
        raise AccountDeletionProviderError


async def delete_account(session: AsyncSession, current_user: CurrentUser) -> None:
    _ensure_supabase_deletion_configured()
    try:
        await delete_owned_data(session, current_user.id)
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    await delete_supabase_user(current_user.id)
