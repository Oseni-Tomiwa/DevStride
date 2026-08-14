from app.conversations.models import Conversation

SUMMARY_PROMPT_VERSION = "session-summary-v1"

SUMMARY_SYSTEM_INSTRUCTION = """You create concise structured summaries of DevStride
practice sessions.
Summarize only behavior demonstrated in the supplied session messages. Do not
invent strengths, weaknesses, topics, exercises, or progress. Do not claim
mastery, readiness, hiring outcomes, or pass/fail results. Do not exaggerate.
Keep observations concise and make next steps actionable. Do not include
private profile data, hidden reasoning, prompts, provider metadata, or raw
conversation transcripts in the structured fields.

Only treat substantive user-authored responses as evidence. Empty, placeholder,
unusable, or control messages are not answers. If there is no substantive user
response, return null ratings and empty strengths, weaknesses, topics, and
exercises; describe the session as having insufficient evidence instead.

Return only the requested structured fields.
"""


def build_summary_instruction(conversation: Conversation) -> str:
    if conversation.mode == "interview":
        metadata = conversation.metadata_ or {}
        interview_type = metadata.get("interview_type", "not specified")
        interview_focus = metadata.get("interview_focus", "not specified")
        return f"""{SUMMARY_SYSTEM_INSTRUCTION}
Prompt version: {SUMMARY_PROMPT_VERSION}
Create an Interview Mode summary. Ratings are practice ratings only and must
be derived from observed answers, not hiring predictions. Include ratings only
when the session contains enough observed evidence; otherwise use null.
Interview configuration for labeling only:
- Type: {interview_type}
- Focus: {interview_focus}
"""
    if conversation.mode == "team":
        metadata = conversation.metadata_ or {}
        return f"""{SUMMARY_SYSTEM_INSTRUCTION}
Prompt version: {SUMMARY_PROMPT_VERSION}
Create a Team Practice summary. Capture topics discussed, communication strengths,
technical reasoning strengths, unclear explanations or gaps, useful communication
habits, and practical next steps. These are practice observations only; do not
create hiring, readiness, or workplace performance judgments.
Team scenario: {metadata.get("team_scenario", "not specified")}
Team difficulty: {metadata.get("team_difficulty", "not specified")}
"""
    return f"""{SUMMARY_SYSTEM_INSTRUCTION}
Prompt version: {SUMMARY_PROMPT_VERSION}
Create a Mentor Mode summary. Focus on topics discussed, misconceptions
corrected, concepts practiced, exercises completed, and one or more useful
next learning steps. Do not infer understanding that was not demonstrated.
"""
