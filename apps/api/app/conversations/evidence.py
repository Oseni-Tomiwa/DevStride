from collections.abc import Iterable

UNUSABLE_TRANSCRIPT_VALUES = frozenset(
    {
        "...",
        "…",
        "[silence]",
        "[no response]",
        "[inaudible]",
        "[unintelligible]",
    }
)


def normalized_user_content(content: str) -> str:
    return " ".join(content.casefold().split())


def is_meaningful_user_content(content: str) -> bool:
    normalized = normalized_user_content(content)
    if not normalized or normalized in UNUSABLE_TRANSCRIPT_VALUES:
        return False
    return any(character.isalnum() for character in normalized)


def is_session_control_request(content: str) -> bool:
    normalized = normalized_user_content(content)
    return normalized.startswith(
        (
            "end the interview and provide my final practice assessment",
            "end the mentor session and provide my practice summary",
            "end the team practice session and provide my practice summary",
        )
    )


def has_meaningful_user_evidence(messages: Iterable[object]) -> bool:
    return any(
        getattr(message, "role", None) == "user"
        and not is_session_control_request(getattr(message, "content", ""))
        and is_meaningful_user_content(getattr(message, "content", ""))
        for message in messages
    )
