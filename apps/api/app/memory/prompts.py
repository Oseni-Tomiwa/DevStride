from app.session_summaries.models import SessionSummary


def build_extraction_instruction(summary: SessionSummary) -> str:
    return f"""Extract only durable, future-useful coaching context from this
{summary.session_mode} session summary. Do not invent facts, sensitive traits,
credentials, temporary emotions, mastery, readiness, or hiring predictions.
Use cautious, observed wording. Return an empty list when evidence is weak. Avoid duplicates.
Only extract when the summary contains concrete observed user behavior; never
turn an unanswered prompt or a neutral no-evidence assessment into a positive
memory.
Summary: {summary.summary}
Topics: {", ".join(summary.topics_covered)}
Weaknesses: {", ".join(summary.weaknesses)}
Strengths: {", ".join(summary.strengths)}
"""
