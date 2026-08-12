from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.conversations.models import Conversation
from app.database.session import get_db_session
from app.goals import repository as goals_repository
from app.goals.models import Goal, GoalFocusArea
from app.main import app
from app.memory.models import MemoryRecord
from app.profiles import repository as profile_repository
from app.profiles.models import Profile
from app.progress import repository
from app.progress.repository import ProgressRow, SummaryEvidenceRow
from app.progress.service import (
    build_goal_progress,
    build_progress_summary,
    get_progress_summary,
    normalize_evidence,
)
from app.session_summaries.models import SessionSummary

client = TestClient(app)
USER_ID = uuid4()
NOW = datetime(2026, 8, 11, 12, 0, tzinfo=UTC)


def make_conversation(
    mode: str,
    *,
    days_ago: int = 0,
    metadata: dict[str, object] | None = None,
    user_id: UUID = USER_ID,
    title: str = "New conversation",
) -> Conversation:
    conversation = Conversation(
        id=uuid4(),
        user_id=user_id,
        title=title,
        mode=mode,
        metadata_=metadata or {},
    )
    conversation.created_at = NOW - timedelta(days=days_ago)
    conversation.updated_at = NOW - timedelta(days=days_ago)
    return conversation


def make_row(
    mode: str,
    *,
    user_turns: int = 0,
    message_count: int | None = None,
    days_ago: int = 0,
    summary_available: bool = False,
    metadata: dict[str, object] | None = None,
    user_id: UUID = USER_ID,
    title: str = "New conversation",
) -> ProgressRow:
    conversation = make_conversation(
        mode,
        days_ago=days_ago,
        metadata=metadata,
        user_id=user_id,
        title=title,
    )
    return ProgressRow(
        conversation=conversation,
        message_count=message_count if message_count is not None else user_turns * 2,
        user_turns=user_turns,
        first_user_content="Explain database indexes" if user_turns else None,
        last_user_message_at=conversation.updated_at if user_turns else None,
        summary_available=summary_available,
    )


def make_summary_row(
    conversation: Conversation,
    *,
    days_ago: int = 0,
    strengths: list[str] | None = None,
    weaknesses: list[str] | None = None,
    correctness: int | None = None,
    clarity: int | None = None,
    depth: int | None = None,
    reasoning: int | None = None,
    user_id: UUID = USER_ID,
) -> SummaryEvidenceRow:
    summary = SessionSummary(
        id=uuid4(),
        conversation_id=conversation.id,
        user_id=user_id,
        session_mode=conversation.mode,
        summary="Observed practice summary",
        topics_covered=[],
        strengths=strengths or [],
        weaknesses=weaknesses or [],
        recommended_next_steps=[],
        correctness_rating=correctness,
        clarity_rating=clarity,
        depth_rating=depth,
        reasoning_rating=reasoning,
    )
    summary.created_at = NOW - timedelta(days=days_ago)
    summary.updated_at = NOW - timedelta(days=days_ago)
    return SummaryEvidenceRow(summary=summary, conversation=conversation)


def make_profile(goal: str = "technical_interviews") -> Profile:
    profile = Profile(
        id=uuid4(),
        user_id=USER_ID,
        display_name="Progress User",
        current_level="junior",
        target_role="backend_engineer",
        preferred_stack=["Python"],
        communication_goal=goal,
        feedback_preference="balanced",
        onboarding_completed=True,
    )
    profile.created_at = NOW
    profile.updated_at = NOW
    return profile


def make_goal_with_focus(
    *, status: str = "active", focus_statuses: list[str] | None = None
) -> Goal:
    goal = Goal(
        id=uuid4(),
        user_id=USER_ID,
        title="Backend development plan",
        goal_type="technical_growth",
        status=status,
    )
    goal.created_at = NOW
    goal.updated_at = NOW
    statuses = focus_statuses or ["active"]
    goal.focus_areas = []
    for position, focus_status in enumerate(statuses):
        focus = GoalFocusArea(
            id=uuid4(),
            goal_id=goal.id,
            title=f"Focus {position}",
            practice_mode="mentor",
            practice_config={},
            position=position,
            status=focus_status,
        )
        focus.created_at = NOW + timedelta(seconds=position)
        focus.updated_at = focus.created_at
        goal.focus_areas.append(focus)
    return goal


def make_memory(category: str, content: str, *, status: str = "active") -> MemoryRecord:
    memory = MemoryRecord(
        id=uuid4(),
        user_id=USER_ID,
        category=category,
        content=content,
        importance=5,
        confidence=1.0,
        source_type="manual",
        status=status,
    )
    memory.created_at = NOW
    memory.updated_at = NOW
    return memory


def build(
    *,
    rows: list[ProgressRow] | None = None,
    summaries: list[SummaryEvidenceRow] | None = None,
    memories: list[MemoryRecord] | None = None,
    profile: Profile | None = None,
    now: datetime = NOW,
):
    return build_progress_summary(
        rows=rows or [],
        summary_rows=summaries or [],
        memories=memories or [],
        profile=profile,
        now=now,
    )


def test_brand_new_user_has_zero_activity_and_profile_aligned_recommendation() -> None:
    summary = build(profile=make_profile("technical_interviews"))

    assert summary.total_sessions == 0
    assert summary.activity.practiced_sessions == 0
    assert summary.activity.completed_sessions == 0
    assert summary.activity.user_turns == 0
    assert summary.continue_practice is None
    assert summary.recommendation.activity == "interview"
    assert summary.recommendation.action.interview_type == "technical"


def test_empty_and_kickoff_only_conversations_are_not_practiced() -> None:
    rows = [
        make_row("general"),
        make_row("interview", message_count=1, metadata={"interview_started": True}),
        make_row("team", message_count=1, metadata={"team_started": True}),
    ]

    summary = build(rows=rows)

    assert summary.total_sessions == 3
    assert summary.activity.practiced_sessions == 0
    assert summary.activity.user_turns == 0
    assert all(not item.practiced for item in summary.recent_sessions)
    assert summary.recent_sessions[1].has_messages is True
    assert summary.recent_sessions[2].has_messages is True


def test_one_user_turn_and_general_conversation_use_trustworthy_activity_semantics() -> None:
    recent_general = make_row("general", user_turns=1, message_count=2, days_ago=1)
    old_general = make_row("general", user_turns=2, message_count=4, days_ago=20)

    summary = build(rows=[recent_general, old_general])

    assert summary.activity.practiced_sessions == 2
    assert summary.activity.user_turns == 3
    assert summary.activity.completed_sessions == 0
    assert summary.activity.mode_breakdown.general == 2
    assert summary.continue_practice is not None
    assert summary.continue_practice.mode == "general"
    assert summary.recommendation.activity == "continue"
    assert all(not item.structured_completed for item in summary.recent_sessions)


def test_recent_incomplete_structured_practice_outranks_newer_general_conversation() -> None:
    interview = make_row(
        "interview",
        user_turns=1,
        days_ago=2,
        metadata={"interview_type": "technical", "interview_focus": "databases"},
    )
    general = make_row("general", user_turns=1, days_ago=0)

    summary = build(rows=[general, interview], profile=make_profile())

    assert summary.continue_practice is not None
    assert summary.continue_practice.conversation_id == interview.conversation.id
    assert summary.recommendation.activity == "continue"
    assert summary.recommendation.action.conversation_id == interview.conversation.id


@pytest.mark.parametrize(
    ("mode", "metadata"),
    [
        ("mentor", {"mentor_completed": True}),
        ("interview", {"interview_completed": True}),
        ("team", {"team_completed": True}),
    ],
)
def test_supported_completion_metadata_counts_structured_sessions(
    mode: str, metadata: dict[str, object]
) -> None:
    row = make_row(mode, user_turns=1, metadata=metadata)

    summary = build(rows=[row])

    assert summary.activity.completed_sessions == 1
    assert summary.recent_sessions[0].structured_completed is True
    assert summary.continue_practice is None


def test_summary_is_supported_completion_evidence_and_modes_count_only_practice() -> None:
    rows = [
        make_row("mentor", user_turns=2, summary_available=True),
        make_row("interview", user_turns=1),
        make_row("team", user_turns=3),
        make_row("general", user_turns=1),
        make_row("mentor"),
    ]

    summary = build(rows=rows)

    assert summary.total_sessions == 5
    assert summary.mentor_sessions == 2
    assert summary.activity.practiced_sessions == 4
    assert summary.activity.completed_sessions == 1
    assert summary.activity.user_turns == 7
    assert summary.activity.mode_breakdown.model_dump() == {
        "general": 1,
        "mentor": 1,
        "interview": 1,
        "team": 1,
    }


def test_single_evidence_is_recent_and_mechanical_duplicates_are_recurring() -> None:
    newest = make_conversation("mentor")
    older = make_conversation("team", days_ago=2)
    summaries = [
        make_summary_row(
            newest,
            strengths=["Explained trade-offs clearly."],
            weaknesses=["Needs clearer failure handling!"],
        ),
        make_summary_row(
            older,
            days_ago=2,
            strengths=["  EXPLAINED   trade-offs clearly  "],
            weaknesses=["Needs clearer failure handling"],
        ),
        make_summary_row(
            make_conversation("interview", days_ago=3),
            days_ago=3,
            strengths=["Structured the answer well"],
            weaknesses=["Missed one edge case"],
        ),
    ]

    summary = build(summaries=summaries)

    assert normalize_evidence("  EXPLAINED   trade-offs clearly. ") == (
        "explained trade-offs clearly"
    )
    assert summary.recent_strength is not None
    assert summary.recent_strength.text == "Structured the answer well"
    assert summary.recent_weakness is not None
    assert summary.recent_weakness.text == "Missed one edge case"
    assert summary.recurring_strengths[0].occurrences == 2
    assert summary.recurring_strengths[0].modes == ["mentor", "team"]
    assert summary.recurring_weaknesses[0].occurrences == 2
    assert summary.recurring_weaknesses[0].conversation_id == newest.id


def test_missing_summaries_do_not_create_evidence_or_ratings() -> None:
    summary = build(rows=[make_row("mentor", user_turns=1)])

    assert summary.recent_strength is None
    assert summary.recent_weakness is None
    assert summary.recurring_strengths == []
    assert summary.recurring_weaknesses == []
    assert summary.rating_history == []


def test_repeated_low_clarity_requires_comparable_interviews_and_recommends_team() -> None:
    first = make_conversation(
        "interview", metadata={"interview_type": "technical", "interview_focus": "apis"}
    )
    second = make_conversation(
        "interview",
        days_ago=2,
        metadata={"interview_type": "technical", "interview_focus": "apis"},
    )
    different = make_conversation(
        "interview",
        days_ago=3,
        metadata={"interview_type": "technical", "interview_focus": "databases"},
    )
    summaries = [
        make_summary_row(first, clarity=2),
        make_summary_row(second, days_ago=2, clarity=1),
        make_summary_row(different, days_ago=3, clarity=1),
    ]

    summary = build(summaries=summaries)

    assert summary.recommendation.activity == "team"
    assert "2 comparable Interview summaries" in summary.recommendation.reason
    assert len(summary.rating_history) == 3
    assert summary.rating_history[0].observed_at < summary.rating_history[-1].observed_at


def test_repeated_interview_weakness_recommends_interview_or_mentor_with_low_depth() -> None:
    first = make_conversation(
        "interview", metadata={"interview_type": "technical", "interview_focus": "databases"}
    )
    second = make_conversation(
        "interview",
        days_ago=2,
        metadata={"interview_type": "technical", "interview_focus": "databases"},
    )
    repeated = [
        make_summary_row(first, weaknesses=["Explain database trade-offs"], depth=3),
        make_summary_row(
            second,
            days_ago=2,
            weaknesses=["Explain database trade-offs."],
            depth=3,
        ),
    ]

    interview = build(summaries=repeated)
    mentor = build(
        summaries=[
            make_summary_row(first, weaknesses=["Explain database trade-offs"], depth=2),
            make_summary_row(
                second,
                days_ago=2,
                weaknesses=["Explain database trade-offs."],
                depth=1,
            ),
        ]
    )

    assert interview.recommendation.activity == "interview"
    assert interview.recommendation.action.interview_focus == "databases"
    assert mentor.recommendation.activity == "mentor"


def test_current_focus_ignores_archived_memory_and_follows_priority() -> None:
    archived_goal = make_memory("goal", "Archived goal", status="archived")
    active_weakness = make_memory("weakness", "Explain trade-offs clearly")
    active_goal = make_memory("goal", "Prepare for backend interviews")

    goal_summary = build(
        memories=[archived_goal, active_weakness, active_goal], profile=make_profile()
    )
    weakness_summary = build(memories=[archived_goal, active_weakness], profile=make_profile())
    profile_summary = build(
        memories=[archived_goal], profile=make_profile("workplace_communication")
    )

    assert goal_summary.current_focus is not None
    assert goal_summary.current_focus.basis == "saved_goal"
    assert weakness_summary.current_focus is not None
    assert weakness_summary.current_focus.basis == "saved_weakness"
    assert profile_summary.current_focus is not None
    assert profile_summary.current_focus.basis == "communication_goal"
    assert profile_summary.recommendation.activity == "team"


def test_recommendation_tie_breaking_and_injected_clock_are_deterministic() -> None:
    latest = make_conversation("mentor")
    older = make_conversation("team", days_ago=1)
    summaries = [
        make_summary_row(latest, weaknesses=["Weakness A", "Weakness B"]),
        make_summary_row(older, days_ago=1, weaknesses=["Weakness A", "Weakness B"]),
    ]
    recent = make_row("mentor", user_turns=1, days_ago=13)

    first = build(rows=[recent], summaries=summaries, now=NOW)
    second = build(rows=[recent], summaries=summaries, now=NOW)
    expired = build(rows=[recent], summaries=summaries, now=NOW + timedelta(days=2))

    assert first.model_dump() == second.model_dump()
    assert first.recommendation.activity == "continue"
    assert expired.recommendation.activity == "mentor"
    assert expired.recurring_weaknesses[0].text == "Weakness A"


def test_goal_progress_with_no_linked_practice_is_observational_and_actionable() -> None:
    goal = make_goal_with_focus(focus_statuses=["active", "completed", "archived"])

    progress = build_goal_progress(goal=goal, rows=[], summary_rows=[], now=NOW)

    assert progress.total_focus_areas == 3
    assert progress.active_focus_areas == 1
    assert progress.completed_focus_areas == 1
    assert progress.archived_focus_areas == 1
    assert progress.linked_practiced_sessions == 0
    assert progress.linked_user_turns == 0
    assert progress.current_focus is not None
    assert progress.current_focus.focus_area_id == goal.focus_areas[0].id
    assert progress.next_action.action.kind == "start_practice"
    assert progress.next_action.focus_area_id == goal.focus_areas[0].id


def test_goal_progress_counts_only_explicit_links_and_user_practice() -> None:
    goal = make_goal_with_focus(focus_statuses=["active", "completed"])
    linked = make_row("mentor", user_turns=2, metadata={"mentor_completed": True})
    linked.conversation.focus_area_id = goal.focus_areas[0].id
    kickoff = make_row("interview", message_count=1, metadata={"interview_started": True})
    kickoff.conversation.focus_area_id = goal.focus_areas[1].id
    unlinked = make_row("mentor", user_turns=4, metadata={"mentor_completed": True})

    progress = build_goal_progress(
        goal=goal,
        rows=[linked, kickoff, unlinked],
        summary_rows=[],
        now=NOW,
    )

    assert progress.linked_practiced_sessions == 1
    assert progress.linked_completed_structured_sessions == 1
    assert progress.linked_user_turns == 2
    assert progress.focus_areas[0].linked_practiced_sessions == 1
    assert progress.focus_areas[1].linked_practiced_sessions == 0


def test_goal_progress_current_focus_is_position_created_at_uuid_ordered() -> None:
    goal = make_goal_with_focus(focus_statuses=["completed", "active", "active"])
    goal.focus_areas[1].position = 0
    goal.focus_areas[2].position = 0
    goal.focus_areas[2].created_at = goal.focus_areas[1].created_at - timedelta(seconds=1)

    progress = build_goal_progress(goal=goal, rows=[], summary_rows=[], now=NOW)

    assert progress.current_focus is not None
    assert progress.current_focus.focus_area_id == goal.focus_areas[2].id


def test_goal_progress_evidence_and_recurring_weakness_are_linked_only() -> None:
    goal = make_goal_with_focus()
    newest = make_row("mentor", user_turns=1, days_ago=0, metadata={"mentor_completed": True})
    newest.conversation.focus_area_id = goal.focus_areas[0].id
    older = make_row("mentor", user_turns=1, days_ago=2, metadata={"mentor_completed": True})
    older.conversation.focus_area_id = goal.focus_areas[0].id
    unrelated = make_row("mentor", user_turns=1, days_ago=1)
    summaries = [
        make_summary_row(newest.conversation, weaknesses=["Explain trade-offs"]),
        make_summary_row(older.conversation, days_ago=2, weaknesses=["explain trade-offs."]),
        make_summary_row(unrelated.conversation, weaknesses=["Private unrelated weakness"]),
    ]

    progress = build_goal_progress(
        goal=goal, rows=[newest, older, unrelated], summary_rows=summaries, now=NOW
    )

    assert progress.recurring_weaknesses[0].occurrences == 2
    assert "Private unrelated weakness" not in str(progress.model_dump())
    assert progress.next_action.reason.startswith("Explain trade-offs")


def test_goal_progress_incomplete_practice_wins_next_action() -> None:
    goal = make_goal_with_focus()
    row = make_row("mentor", user_turns=1, days_ago=1)
    row.conversation.focus_area_id = goal.focus_areas[0].id

    progress = build_goal_progress(goal=goal, rows=[row], summary_rows=[], now=NOW)

    assert progress.next_action.activity == "continue"
    assert progress.next_action.action.kind == "continue_conversation"
    assert progress.next_action.action.conversation_id == row.conversation.id


def test_goal_progress_does_not_auto_complete_goal_without_active_focus() -> None:
    goal = make_goal_with_focus(focus_statuses=["completed", "archived"])

    progress = build_goal_progress(goal=goal, rows=[], summary_rows=[], now=NOW)

    assert progress.current_focus is None
    assert progress.next_action.action.kind == "review_goal"
    assert goal.status == "active"


def test_active_goal_focus_outranks_memory_and_profile_in_global_progress() -> None:
    goal = make_goal_with_focus()
    memory = make_memory("goal", "Old saved goal")
    summary = build(rows=[], memories=[memory], profile=make_profile(), now=NOW)
    with_goal = build_progress_summary(
        rows=[],
        summary_rows=[],
        memories=[memory],
        profile=make_profile(),
        now=NOW,
        active_goal=goal,
    )

    assert summary.current_focus is not None
    assert summary.current_focus.basis == "saved_goal"
    assert with_goal.current_focus is not None
    assert with_goal.current_focus.basis == "goal_focus_area"
    assert with_goal.goal_progress is not None
    assert with_goal.recommendation.action.focus_area_id == goal.focus_areas[0].id


def test_progress_requires_authentication() -> None:
    response = cast(Response, client.get("/api/v1/progress"))  # pyright: ignore[reportUnknownMemberType]
    assert response.status_code == 401


def test_goal_progress_requires_authentication() -> None:
    response = cast(
        Response,
        client.get(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/goals/{uuid4()}/progress"
        ),
    )
    assert response.status_code == 401


def test_progress_api_scopes_every_query_and_retains_old_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current_user = CurrentUser(id=USER_ID, email="user@example.com")
    seen_user_ids: list[UUID] = []

    async def override_db() -> AsyncIterator[AsyncSession]:
        yield cast(AsyncSession, object())

    async def fake_rows(session: AsyncSession, user_id: UUID) -> list[ProgressRow]:
        del session
        seen_user_ids.append(user_id)
        return [make_row("general", user_turns=1)]

    async def fake_summaries(
        session: AsyncSession, user_id: UUID, limit: int = 20
    ) -> list[SummaryEvidenceRow]:
        del session
        assert limit == 20
        seen_user_ids.append(user_id)
        return []

    async def fake_memories(session: AsyncSession, user_id: UUID) -> list[MemoryRecord]:
        del session
        seen_user_ids.append(user_id)
        return []

    async def fake_profile(session: AsyncSession, user_id: UUID) -> Profile | None:
        del session
        seen_user_ids.append(user_id)
        return None

    monkeypatch.setattr(repository, "get_progress_rows", fake_rows)
    monkeypatch.setattr(repository, "get_recent_summary_evidence", fake_summaries)
    monkeypatch.setattr(repository, "get_active_focus_memories", fake_memories)
    monkeypatch.setattr(profile_repository, "get_profile_by_user_id", fake_profile)
    monkeypatch.setattr(goals_repository, "get_active_owned", AsyncMock(return_value=None))
    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db_session] = override_db
    try:
        response = cast(Response, client.get("/api/v1/progress"))  # pyright: ignore[reportUnknownMemberType]
    finally:
        app.dependency_overrides.clear()

    body = response.json()
    assert response.status_code == 200
    assert seen_user_ids == [USER_ID, USER_ID, USER_ID, USER_ID]
    assert body["total_sessions"] == 1
    assert body["general_sessions"] == 1
    assert "recent_sessions" in body
    assert body["activity"]["practiced_sessions"] == 1
    assert "recommendation" in body


@pytest.mark.asyncio
async def test_get_progress_summary_uses_injected_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_rows(session: AsyncSession, user_id: UUID) -> list[ProgressRow]:
        del session, user_id
        return [make_row("general", user_turns=1, days_ago=29)]

    async def fake_summaries(
        session: AsyncSession, user_id: UUID, limit: int = 20
    ) -> list[SummaryEvidenceRow]:
        del session, user_id, limit
        return []

    async def fake_memories(session: AsyncSession, user_id: UUID) -> list[MemoryRecord]:
        del session, user_id
        return []

    async def fake_profile(session: AsyncSession, user_id: UUID) -> Profile | None:
        del session, user_id
        return None

    monkeypatch.setattr(repository, "get_progress_rows", fake_rows)
    monkeypatch.setattr(repository, "get_recent_summary_evidence", fake_summaries)
    monkeypatch.setattr(repository, "get_active_focus_memories", fake_memories)
    monkeypatch.setattr(profile_repository, "get_profile_by_user_id", fake_profile)
    monkeypatch.setattr(goals_repository, "get_active_owned", AsyncMock(return_value=None))

    current = await get_progress_summary(cast(AsyncSession, object()), USER_ID, now=NOW)
    later = await get_progress_summary(
        cast(AsyncSession, object()), USER_ID, now=NOW + timedelta(days=2)
    )

    assert current.activity.practiced_sessions_last_30_days == 1
    assert later.activity.practiced_sessions_last_30_days == 0
