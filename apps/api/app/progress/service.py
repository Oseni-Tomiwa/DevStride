from typing import cast
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.conversations.models import Conversation
from app.conversations.title import DEFAULT_CONVERSATION_TITLE, derive_conversation_title
from app.progress import repository
from app.progress.schemas import ProgressMode, ProgressSessionResponse, ProgressSummaryResponse


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
    title = conversation.title
    if title != DEFAULT_CONVERSATION_TITLE or not first_user_content:
        return title
    return derive_conversation_title(first_user_content)


async def get_progress_summary(session: AsyncSession, user_id: UUID) -> ProgressSummaryResponse:
    rows = await repository.get_progress_rows(session, user_id)
    sessions: list[ProgressSessionResponse] = []
    for conversation, message_count, first_user_content, summary_available in rows:
        metadata = conversation.metadata_ or {}
        sessions.append(
            ProgressSessionResponse(
                id=conversation.id,
                title=_session_title(conversation, first_user_content),
                mode=cast(ProgressMode, conversation.mode),
                interview_type=_metadata_value(metadata, "interview_type"),
                interview_focus=_metadata_value(metadata, "interview_focus"),
                updated_at=conversation.updated_at,
                message_count=message_count,
                has_messages=message_count > 0,
                interview_started=metadata.get("interview_started") is True,
                interview_completed=metadata.get("interview_completed") is True,
                has_final_assessment=metadata.get("final_assessment_message_id") is not None,
                summary_available=bool(summary_available),
            )
        )

    return ProgressSummaryResponse(
        total_sessions=len(rows),
        mentor_sessions=sum(item.mode == "mentor" for item in sessions),
        interview_sessions=sum(item.mode == "interview" for item in sessions),
        general_sessions=sum(item.mode == "general" for item in sessions),
        recent_sessions=sessions[:20],
    )
