from __future__ import annotations

from collections.abc import Sequence
from typing import Final

from app.conversations.schemas import InterviewFocus, InterviewType, TeamScenario
from app.goals.schemas import (
    GoalType,
    InterviewPracticeConfig,
    InterviewPreviewFocusArea,
    MentorPracticeConfig,
    MentorPreviewFocusArea,
    PlanPreviewRequest,
    PlanPreviewResponse,
    PreviewFocusArea,
    PreviewSource,
    TeamPracticeConfig,
    TeamPreviewFocusArea,
)
from app.memory.models import MemoryRecord
from app.profiles.models import Profile

MAX_PREVIEW_SUGGESTIONS: Final = 6
MAX_MEMORY_SUGGESTIONS: Final = 3
RELEVANT_MEMORY_CATEGORIES: Final = frozenset({"goal", "skill", "weakness"})

STACK_FOCUS_MAPPING: Final[dict[str, InterviewFocus]] = {
    "python": "python",
    "javascript": "javascript_node",
    "typescript": "javascript_node",
    "javascript/typescript": "javascript_node",
    "node": "javascript_node",
    "node.js": "javascript_node",
    "nodejs": "javascript_node",
    "api": "apis",
    "apis": "apis",
    "rest": "apis",
    "rest api": "apis",
    "backend": "apis",
    "database": "databases",
    "databases": "databases",
    "postgres": "databases",
    "postgresql": "databases",
    "sql": "databases",
    "system design": "system_design",
}

ROLE_LABELS: Final[dict[str, str]] = {
    "backend_engineer": "backend engineering",
    "frontend_engineer": "frontend engineering",
    "fullstack_engineer": "full-stack engineering",
    "cloud_engineer": "cloud engineering",
    "devops_engineer": "DevOps engineering",
    "ai_engineer": "AI engineering",
}

FOCUS_LABELS: Final[dict[InterviewFocus, str]] = {
    "general_backend": "backend fundamentals",
    "apis": "API design",
    "databases": "database design",
    "javascript_node": "JavaScript and Node.js",
    "python": "Python",
    "system_design": "system design",
}


def _safe_stack_focus(profile: Profile | None) -> InterviewFocus:
    if profile is None:
        return "general_backend"
    for stack in profile.preferred_stack:
        mapped = STACK_FOCUS_MAPPING.get(stack.strip().lower())
        if mapped is not None:
            return mapped
    return "general_backend"


def _role_context(profile: Profile | None) -> str:
    if profile is None:
        return "your target role"
    return ROLE_LABELS.get(profile.target_role, "your target role")


def _level_context(profile: Profile | None) -> str:
    if profile is None:
        return "your current level"
    return profile.current_level.replace("_", "-") + " level"


def _team_scenario(profile: Profile | None) -> TeamScenario:
    if profile is None:
        return "technical_decision"
    if profile.communication_goal == "group_discussions":
        return "architecture_discussion"
    if profile.communication_goal == "workplace_communication":
        return "technical_decision"
    if profile.communication_goal == "public_speaking":
        return "architecture_discussion"
    return "code_review"


def _mentor(
    title: str,
    description: str,
    position: int,
    source: PreviewSource = "template",
) -> MentorPreviewFocusArea:
    return MentorPreviewFocusArea(
        title=title,
        description=description,
        practice_mode="mentor",
        practice_config=MentorPracticeConfig(),
        suggested_position=position,
        source=source,
    )


def _interview(
    title: str,
    description: str,
    position: int,
    interview_type: InterviewType,
    interview_focus: InterviewFocus | None = None,
) -> InterviewPreviewFocusArea:
    return InterviewPreviewFocusArea(
        title=title,
        description=description,
        practice_mode="interview",
        practice_config=InterviewPracticeConfig(
            interview_type=interview_type,
            interview_focus=interview_focus,
        ),
        suggested_position=position,
        source="template",
    )


def _team(
    title: str,
    description: str,
    position: int,
    scenario: TeamScenario,
) -> TeamPreviewFocusArea:
    return TeamPreviewFocusArea(
        title=title,
        description=description,
        practice_mode="team",
        practice_config=TeamPracticeConfig(
            team_scenario=scenario,
            team_difficulty="guided",
        ),
        suggested_position=position,
        source="template",
    )


def _template_suggestions(
    request: PlanPreviewRequest, profile: Profile | None
) -> list[PreviewFocusArea]:
    goal_type: GoalType = request.goal_type
    focus = _safe_stack_focus(profile)
    focus_label = FOCUS_LABELS[focus]
    role = _role_context(profile)
    level = _level_context(profile)

    if goal_type == "interview_preparation":
        return [
            _interview(
                f"Practise {focus_label} interviews",
                f"Build technical interview fluency for {role} at {level}.",
                0,
                "technical",
                focus,
            ),
            _mentor(
                "Explain technical decisions clearly",
                "Practise concise explanations, tradeoffs, and follow-up reasoning.",
                1,
            ),
            _interview(
                "Practise behavioral interview stories",
                "Structure experience-based answers without inventing achievements.",
                2,
                "behavioral",
            ),
        ]
    if goal_type == "technical_growth":
        return [
            _mentor(
                f"Build depth in {focus_label}",
                f"Work through concepts and application at {level}.",
                0,
            ),
            _mentor(
                "Apply and explain what you learn",
                "Connect implementation choices to clear technical reasoning.",
                1,
            ),
            _interview(
                f"Test {focus_label} understanding",
                f"Use structured technical questions relevant to {role}.",
                2,
                "technical",
                focus,
            ),
        ]
    if goal_type == "communication":
        scenario = _team_scenario(profile)
        return [
            _team(
                "Practise collaborative engineering communication",
                "Rehearse a realistic team discussion with guided feedback.",
                0,
                scenario,
            ),
            _mentor(
                "Explain technical ideas with clarity",
                "Practise structure, audience awareness, and concise delivery.",
                1,
            ),
            _interview(
                "Practise experience-based communication",
                "Use behavioral questions to structure examples and outcomes.",
                2,
                "behavioral",
            ),
        ]
    return [
        _mentor(
            f"Define success for {_shorten(request.title, 80)}",
            "Clarify the outcome and identify a small first practice step.",
            0,
        ),
        _mentor(
            "Practise explaining your progress",
            "Describe what you tried, what changed, and what to do next.",
            1,
        ),
        _team(
            "Apply the goal in a collaborative scenario",
            "Use a guided technical-decision discussion without assuming a specialization.",
            2,
            "technical_decision",
        ),
    ]


def _shorten(value: str, limit: int) -> str:
    cleaned = " ".join(value.split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "…"


def _memory_title(memory: MemoryRecord) -> str:
    labels = {
        "goal": "Saved goal context",
        "skill": "Saved skill context",
        "weakness": "Saved practice context",
    }
    return f"{labels[memory.category]}: {_shorten(memory.content, 92)}"


def build_plan_preview(
    request: PlanPreviewRequest,
    profile: Profile | None,
    memories: Sequence[MemoryRecord],
) -> PlanPreviewResponse:
    templates = _template_suggestions(request, profile)
    available = MAX_PREVIEW_SUGGESTIONS - len(templates)
    relevant = [
        memory
        for memory in memories
        if memory.status == "active" and memory.category in RELEVANT_MEMORY_CATEGORIES
    ][: min(MAX_MEMORY_SUGGESTIONS, available)]
    memory_suggestions: list[PreviewFocusArea] = []
    for offset, memory in enumerate(relevant):
        memory_suggestions.append(
            _mentor(
                _memory_title(memory),
                "Optional suggestion from saved context. Review or edit it before "
                "accepting a plan.",
                len(templates) + offset,
                source="memory",
            )
        )
    return PlanPreviewResponse(
        template_suggestions=templates,
        memory_suggestions=memory_suggestions,
    )
