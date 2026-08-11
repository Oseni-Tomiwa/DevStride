import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations.models import Conversation
from app.conversations.title import DEFAULT_CONVERSATION_TITLE, derive_conversation_title
from app.memory.models import MemoryRecord
from app.profiles import repository as profile_repository
from app.profiles.models import Profile
from app.progress import repository
from app.progress.repository import ProgressRow, SummaryEvidenceRow
from app.progress.schemas import (
    ContinuePracticeResponse,
    CurrentFocusResponse,
    ModeBreakdownResponse,
    ProgressActivityResponse,
    ProgressEvidenceResponse,
    ProgressMode,
    ProgressRecommendationResponse,
    ProgressSessionResponse,
    ProgressSummaryResponse,
    RatingHistoryResponse,
    RecommendationActionResponse,
    RecommendationActivity,
    StructuredProgressMode,
)

SUMMARY_EVIDENCE_LIMIT = 20
CONTINUE_WINDOW_DAYS = 14
RECENT_ACTIVITY_WINDOW_DAYS = 30
STRUCTURED_MODES = {"mentor", "interview", "team"}
MODE_ORDER = {"mentor": 0, "interview": 1, "team": 2, "general": 3}
TRAILING_PUNCTUATION = re.compile(r"[\s.!?,;:]+$")
REPEATED_WHITESPACE = re.compile(r"\s+")


@dataclass(frozen=True)
class _EvidenceOccurrence:
    text: str
    mode: StructuredProgressMode
    observed_at: datetime
    conversation_id: UUID


@dataclass(frozen=True)
class _ContinueCandidate:
    response: ContinuePracticeResponse
    row: ProgressRow
    incomplete_structured: bool


@dataclass(frozen=True)
class _LowRatingSignal:
    dimension: str
    occurrences: int
    latest_at: datetime
    conversation: Conversation


def _metadata_value(metadata: dict[str, object], key: str) -> str | None:
    value = metadata.get(key)
    return value if isinstance(value, str) else None


def _session_title(conversation: Conversation, first_user_content: str | None) -> str:
    mode = conversation.mode
    if mode == "mentor":
        return "Mentor Session"
    if mode == "interview":
        metadata = conversation.metadata_
        interview_type = _metadata_value(metadata, "interview_type")
        interview_focus = _metadata_value(metadata, "interview_focus")
        prefix = "Technical Interview" if interview_type == "technical" else "Behavioral Interview"
        if interview_focus:
            return f"{prefix} — {interview_focus.replace('_', ' ').title()}"
        return prefix
    if mode == "team":
        scenario = _metadata_value(conversation.metadata_, "team_scenario")
        labels = {
            "code_review": "Code Review Practice",
            "architecture_discussion": "Architecture Discussion",
            "sprint_planning": "Sprint Planning",
            "debugging_incident": "Debugging Incident",
            "technical_decision": "Technical Decision",
        }
        return labels.get(scenario or "", "Team Practice")
    title = conversation.title
    if title != DEFAULT_CONVERSATION_TITLE or not first_user_content:
        return title
    return derive_conversation_title(first_user_content)


def is_structured_completed(row: ProgressRow) -> bool:
    """Return completion only for practiced structured modes with supported evidence."""
    if row.user_turns == 0 or row.conversation.mode not in STRUCTURED_MODES:
        return False
    metadata = row.conversation.metadata_ or {}
    if row.conversation.mode == "interview":
        metadata_completed = (
            metadata.get("interview_completed") is True
            or metadata.get("final_assessment_message_id") is not None
        )
    elif row.conversation.mode == "mentor":
        metadata_completed = metadata.get("mentor_completed") is True
    else:
        metadata_completed = metadata.get("team_completed") is True
    return metadata_completed or row.summary_available


def normalize_evidence(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).casefold().strip()
    normalized = REPEATED_WHITESPACE.sub(" ", normalized)
    return TRAILING_PUNCTUATION.sub("", normalized)


def _structured_mode(mode: str) -> StructuredProgressMode:
    return cast(StructuredProgressMode, mode)


def _evidence_response(occurrences: list[_EvidenceOccurrence]) -> ProgressEvidenceResponse:
    latest = max(occurrences, key=lambda item: (item.observed_at, str(item.conversation_id)))
    modes: list[StructuredProgressMode] = sorted(
        {item.mode for item in occurrences},
        key=lambda mode: MODE_ORDER[mode],
    )
    return ProgressEvidenceResponse(
        text=latest.text,
        occurrences=len(occurrences),
        latest_at=latest.observed_at,
        modes=modes,
        conversation_id=latest.conversation_id,
    )


def derive_summary_evidence(
    rows: list[SummaryEvidenceRow], attribute: str
) -> tuple[ProgressEvidenceResponse | None, list[ProgressEvidenceResponse]]:
    grouped: dict[str, list[_EvidenceOccurrence]] = {}
    for row in rows:
        values = getattr(row.summary, attribute)
        seen_in_summary: set[str] = set()
        for raw_value in cast(list[str], values):
            value = raw_value.strip()
            normalized = normalize_evidence(value)
            if not normalized or normalized in seen_in_summary:
                continue
            seen_in_summary.add(normalized)
            grouped.setdefault(normalized, []).append(
                _EvidenceOccurrence(
                    text=value,
                    mode=_structured_mode(row.summary.session_mode),
                    observed_at=row.summary.updated_at,
                    conversation_id=row.conversation.id,
                )
            )

    single = [_evidence_response(items) for items in grouped.values() if len(items) == 1]
    recurring = [_evidence_response(items) for items in grouped.values() if len(items) >= 2]
    single.sort(key=lambda item: (-item.latest_at.timestamp(), normalize_evidence(item.text)))
    recurring.sort(
        key=lambda item: (
            -item.occurrences,
            -item.latest_at.timestamp(),
            MODE_ORDER[item.modes[0]],
            normalize_evidence(item.text),
        )
    )
    return (single[0] if single else None, recurring)


def _rating_history(rows: list[SummaryEvidenceRow]) -> list[RatingHistoryResponse]:
    history: list[RatingHistoryResponse] = []
    for row in reversed(rows):
        summary = row.summary
        if summary.session_mode != "interview":
            continue
        ratings = (
            summary.correctness_rating,
            summary.clarity_rating,
            summary.depth_rating,
            summary.reasoning_rating,
        )
        if all(value is None for value in ratings):
            continue
        metadata = row.conversation.metadata_ or {}
        history.append(
            RatingHistoryResponse(
                conversation_id=row.conversation.id,
                observed_at=summary.updated_at,
                interview_type=_metadata_value(metadata, "interview_type"),
                interview_focus=_metadata_value(metadata, "interview_focus"),
                correctness=summary.correctness_rating,
                clarity=summary.clarity_rating,
                depth=summary.depth_rating,
                reasoning=summary.reasoning_rating,
            )
        )
    return history


def _repeated_low_ratings(rows: list[SummaryEvidenceRow]) -> list[_LowRatingSignal]:
    grouped: dict[tuple[str | None, str | None, str], list[SummaryEvidenceRow]] = {}
    dimensions = (
        ("correctness", "correctness_rating"),
        ("clarity", "clarity_rating"),
        ("depth", "depth_rating"),
        ("reasoning", "reasoning_rating"),
    )
    for row in rows:
        if row.summary.session_mode != "interview":
            continue
        metadata = row.conversation.metadata_ or {}
        comparison = (
            _metadata_value(metadata, "interview_type"),
            _metadata_value(metadata, "interview_focus"),
        )
        for dimension, field in dimensions:
            value = cast(int | None, getattr(row.summary, field))
            if value is not None and value <= 2:
                grouped.setdefault((*comparison, dimension), []).append(row)

    signals: list[_LowRatingSignal] = []
    for (*_comparison, dimension), matches in grouped.items():
        if len(matches) < 2:
            continue
        latest = max(
            matches,
            key=lambda row: (row.summary.updated_at, str(row.conversation.id)),
        )
        signals.append(
            _LowRatingSignal(
                dimension=dimension,
                occurrences=len(matches),
                latest_at=latest.summary.updated_at,
                conversation=latest.conversation,
            )
        )
    signal_activity_order = {"clarity": 2, "correctness": 0, "depth": 0, "reasoning": 1}
    signals.sort(
        key=lambda signal: (
            -signal.occurrences,
            -signal.latest_at.timestamp(),
            signal_activity_order[signal.dimension],
            signal.dimension,
        )
    )
    return signals


def _continue_candidate(rows: list[ProgressRow], now: datetime) -> _ContinueCandidate | None:
    cutoff = now - timedelta(days=CONTINUE_WINDOW_DAYS)
    structured: list[ProgressRow] = []
    general: list[ProgressRow] = []
    for row in rows:
        if row.user_turns == 0 or row.last_user_message_at is None:
            continue
        if row.last_user_message_at < cutoff:
            continue
        if row.conversation.mode in STRUCTURED_MODES:
            if not is_structured_completed(row):
                structured.append(row)
        elif row.conversation.mode == "general":
            general.append(row)

    candidates = structured or general
    if not candidates:
        return None
    selected = max(
        candidates,
        key=lambda row: (cast(datetime, row.last_user_message_at), str(row.conversation.id)),
    )
    conversation = selected.conversation
    metadata = conversation.metadata_ or {}
    return _ContinueCandidate(
        response=ContinuePracticeResponse(
            conversation_id=conversation.id,
            title=_session_title(conversation, selected.first_user_content),
            mode=cast(ProgressMode, conversation.mode),
            last_activity_at=cast(datetime, selected.last_user_message_at),
            interview_type=_metadata_value(metadata, "interview_type"),
            interview_focus=_metadata_value(metadata, "interview_focus"),
            team_scenario=_metadata_value(metadata, "team_scenario"),
        ),
        row=selected,
        incomplete_structured=bool(structured),
    )


COMMUNICATION_GOAL_LABELS = {
    "technical_interviews": "Technical interview practice",
    "behavioral_interviews": "Behavioral interview practice",
    "group_discussions": "Group discussion communication",
    "workplace_communication": "Workplace communication",
    "public_speaking": "Public speaking",
    "all": "Broad communication practice",
}


def _current_focus(
    memories: list[MemoryRecord], profile: Profile | None
) -> CurrentFocusResponse | None:
    goal = next(
        (item for item in memories if item.status == "active" and item.category == "goal"),
        None,
    )
    if goal is not None:
        return CurrentFocusResponse(basis="saved_goal", label=goal.content)
    weakness = next(
        (item for item in memories if item.status == "active" and item.category == "weakness"),
        None,
    )
    if weakness is not None:
        return CurrentFocusResponse(basis="saved_weakness", label=weakness.content)
    if profile is None:
        return None
    label = COMMUNICATION_GOAL_LABELS.get(profile.communication_goal)
    if label is None:
        return None
    return CurrentFocusResponse(basis="communication_goal", label=label)


def _profile_activity(
    profile: Profile | None,
) -> tuple[RecommendationActivity, str | None]:
    if profile is None:
        return "mentor", None
    goal = profile.communication_goal
    if goal == "technical_interviews":
        return "interview", "technical"
    if goal == "behavioral_interviews":
        return "interview", "behavioral"
    if goal in {"group_discussions", "workplace_communication", "public_speaking"}:
        return "team", None
    return "mentor", None


def _start_action(
    activity: RecommendationActivity,
    conversation: Conversation | None = None,
    interview_type: str | None = None,
) -> RecommendationActionResponse:
    metadata = conversation.metadata_ if conversation is not None else {}
    return RecommendationActionResponse(
        kind="start_practice",
        mode=cast(ProgressMode, activity),
        interview_type=interview_type or _metadata_value(metadata, "interview_type"),
        interview_focus=_metadata_value(metadata, "interview_focus"),
        team_scenario=_metadata_value(metadata, "team_scenario"),
    )


def _recommendation(
    *,
    continue_candidate: _ContinueCandidate | None,
    current_focus: CurrentFocusResponse | None,
    recurring_weaknesses: list[ProgressEvidenceResponse],
    low_ratings: list[_LowRatingSignal],
    summary_rows: list[SummaryEvidenceRow],
    profile: Profile | None,
) -> ProgressRecommendationResponse:
    if continue_candidate is not None and continue_candidate.incomplete_structured:
        item = continue_candidate.response
        return ProgressRecommendationResponse(
            activity="continue",
            title=f"Continue {item.title}",
            reason="You started this structured practice recently and have not completed it.",
            evidence=[f"Your latest user turn was within the last {CONTINUE_WINDOW_DAYS} days."],
            action=RecommendationActionResponse(
                kind="continue_conversation",
                mode=item.mode,
                conversation_id=item.conversation_id,
            ),
        )

    summaries_by_conversation = {row.conversation.id: row for row in summary_rows}
    if recurring_weaknesses:
        weakness = recurring_weaknesses[0]
        latest = summaries_by_conversation[weakness.conversation_id]
        latest_mode = latest.summary.session_mode
        activity: RecommendationActivity = cast(RecommendationActivity, latest_mode)
        if latest_mode == "interview":
            comparable = [
                signal
                for signal in low_ratings
                if signal.dimension in {"correctness", "depth"}
                and _metadata_value(signal.conversation.metadata_, "interview_type")
                == _metadata_value(latest.conversation.metadata_, "interview_type")
                and _metadata_value(signal.conversation.metadata_, "interview_focus")
                == _metadata_value(latest.conversation.metadata_, "interview_focus")
            ]
            if comparable:
                activity = "mentor"
        labels = {"mentor": "Mentor", "interview": "Interview", "team": "Team Practice"}
        return ProgressRecommendationResponse(
            activity=activity,
            title=f"Work on a recurring area with {labels[activity]}",
            reason=f"{weakness.text} appeared in {weakness.occurrences} recent summaries.",
            evidence=[
                f"Observed across {weakness.occurrences} summaries in "
                f"{', '.join(mode.title() for mode in weakness.modes)} practice."
            ],
            action=_start_action(activity, latest.conversation),
        )

    if low_ratings:
        signal = low_ratings[0]
        activity_by_dimension: dict[str, RecommendationActivity] = {
            "clarity": "team",
            "correctness": "mentor",
            "depth": "mentor",
            "reasoning": "interview",
        }
        title_by_dimension = {
            "clarity": "Practice clearer technical communication",
            "correctness": "Strengthen technical correctness",
            "depth": "Build deeper technical explanations",
            "reasoning": "Practice interview reasoning",
        }
        activity = activity_by_dimension[signal.dimension]
        return ProgressRecommendationResponse(
            activity=activity,
            title=title_by_dimension[signal.dimension],
            reason=(
                f"{signal.dimension.title()} was rated 2/5 or lower in "
                f"{signal.occurrences} comparable Interview summaries."
            ),
            evidence=["These are recorded practice ratings, not proof of mastery or readiness."],
            action=_start_action(activity, signal.conversation),
        )

    if current_focus is not None and current_focus.basis in {"saved_goal", "saved_weakness"}:
        activity, interview_type = _profile_activity(profile)
        focus_kind = "goal" if current_focus.basis == "saved_goal" else "area to work on"
        return ProgressRecommendationResponse(
            activity=activity,
            title="Practice your current focus",
            reason=f"You have {current_focus.label} saved as a current {focus_kind}.",
            evidence=["The recommendation uses active context you can review in Memory."],
            action=_start_action(activity, interview_type=interview_type),
        )

    if profile is not None:
        activity, interview_type = _profile_activity(profile)
        if current_focus is not None:
            return ProgressRecommendationResponse(
                activity=activity,
                title="Start profile-aligned practice",
                reason=f"Your communication goal is {current_focus.label.lower()}.",
                evidence=["This starter recommendation uses your editable Profile."],
                action=_start_action(activity, interview_type=interview_type),
            )
        stack = ", ".join(profile.preferred_stack)
        role = profile.target_role.replace("_", " ")
        detail = f" using {stack}" if stack else ""
        return ProgressRecommendationResponse(
            activity="mentor",
            title="Build toward your target role",
            reason=f"Use Mentor practice for your {role} goal{detail}.",
            evidence=["This starter recommendation uses your editable Profile."],
            action=_start_action("mentor"),
        )

    if continue_candidate is not None:
        item = continue_candidate.response
        return ProgressRecommendationResponse(
            activity="continue",
            title=f"Continue {item.title}",
            reason="This is your most recent practiced General conversation.",
            evidence=[f"Your latest user turn was within the last {CONTINUE_WINDOW_DAYS} days."],
            action=RecommendationActionResponse(
                kind="continue_conversation",
                mode=item.mode,
                conversation_id=item.conversation_id,
            ),
        )

    return ProgressRecommendationResponse(
        activity="mentor",
        title="Start with Mentor practice",
        reason="Build your first evidence-backed practice record with a focused Mentor session.",
        evidence=["No completed practice evidence is available yet."],
        action=_start_action("mentor"),
    )


def build_progress_summary(
    *,
    rows: list[ProgressRow],
    summary_rows: list[SummaryEvidenceRow],
    memories: list[MemoryRecord],
    profile: Profile | None,
    now: datetime,
) -> ProgressSummaryResponse:
    sessions: list[ProgressSessionResponse] = []
    completed_by_id: dict[UUID, bool] = {}
    for row in rows:
        conversation = row.conversation
        metadata = conversation.metadata_ or {}
        completed = is_structured_completed(row)
        completed_by_id[conversation.id] = completed
        sessions.append(
            ProgressSessionResponse(
                id=conversation.id,
                title=_session_title(conversation, row.first_user_content),
                mode=cast(ProgressMode, conversation.mode),
                interview_type=_metadata_value(metadata, "interview_type"),
                interview_focus=_metadata_value(metadata, "interview_focus"),
                team_scenario=_metadata_value(metadata, "team_scenario"),
                updated_at=conversation.updated_at,
                message_count=row.message_count,
                has_messages=row.message_count > 0,
                interview_started=metadata.get("interview_started") is True,
                interview_completed=metadata.get("interview_completed") is True,
                has_final_assessment=metadata.get("final_assessment_message_id") is not None,
                summary_available=row.summary_available,
                user_turns=row.user_turns,
                practiced=row.user_turns > 0,
                structured_completed=completed,
            )
        )

    practiced_rows = [row for row in rows if row.user_turns > 0]
    recent_cutoff = now - timedelta(days=RECENT_ACTIVITY_WINDOW_DAYS)
    mode_breakdown = ModeBreakdownResponse(
        general=sum(row.conversation.mode == "general" for row in practiced_rows),
        mentor=sum(row.conversation.mode == "mentor" for row in practiced_rows),
        interview=sum(row.conversation.mode == "interview" for row in practiced_rows),
        team=sum(row.conversation.mode == "team" for row in practiced_rows),
    )
    activity = ProgressActivityResponse(
        practiced_sessions=len(practiced_rows),
        completed_sessions=sum(completed_by_id[row.conversation.id] for row in practiced_rows),
        user_turns=sum(row.user_turns for row in rows),
        practiced_sessions_last_30_days=sum(
            row.last_user_message_at is not None and row.last_user_message_at >= recent_cutoff
            for row in practiced_rows
        ),
        mode_breakdown=mode_breakdown,
    )

    recent_strength, recurring_strengths = derive_summary_evidence(summary_rows, "strengths")
    recent_weakness, recurring_weaknesses = derive_summary_evidence(summary_rows, "weaknesses")
    focus = _current_focus(memories, profile)
    continue_candidate = _continue_candidate(rows, now)
    low_ratings = _repeated_low_ratings(summary_rows)

    return ProgressSummaryResponse(
        total_sessions=len(rows),
        mentor_sessions=sum(item.mode == "mentor" for item in sessions),
        interview_sessions=sum(item.mode == "interview" for item in sessions),
        general_sessions=sum(item.mode == "general" for item in sessions),
        team_sessions=sum(item.mode == "team" for item in sessions),
        recent_sessions=sessions[:20],
        activity=activity,
        continue_practice=continue_candidate.response if continue_candidate is not None else None,
        current_focus=focus,
        recent_strength=recent_strength,
        recent_weakness=recent_weakness,
        recurring_strengths=recurring_strengths,
        recurring_weaknesses=recurring_weaknesses,
        rating_history=_rating_history(summary_rows),
        recommendation=_recommendation(
            continue_candidate=continue_candidate,
            current_focus=focus,
            recurring_weaknesses=recurring_weaknesses,
            low_ratings=low_ratings,
            summary_rows=summary_rows,
            profile=profile,
        ),
    )


async def get_progress_summary(
    session: AsyncSession, user_id: UUID, now: datetime | None = None
) -> ProgressSummaryResponse:
    rows = await repository.get_progress_rows(session, user_id)
    summary_rows = await repository.get_recent_summary_evidence(
        session, user_id, limit=SUMMARY_EVIDENCE_LIMIT
    )
    memories = await repository.get_active_focus_memories(session, user_id)
    profile = await profile_repository.get_profile_by_user_id(session, user_id)
    return build_progress_summary(
        rows=rows,
        summary_rows=summary_rows,
        memories=memories,
        profile=profile,
        now=now or datetime.now(UTC),
    )
