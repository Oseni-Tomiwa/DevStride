import re

DEFAULT_CONVERSATION_TITLE = "New conversation"
CONVERSATION_TITLE_MAX_LENGTH = 60


def derive_conversation_title(content: str) -> str:
    normalized = re.sub(r"\s+", " ", content).strip()
    normalized = re.sub(r"[.!?]+$", "", normalized).strip()
    normalized = re.sub(
        r"^(?:help me prepare for|help me with|i want to prepare for)\s+(?:(?:a|an|the)\s+)?",
        "",
        normalized,
        flags=re.IGNORECASE,
    ).strip()
    if not normalized:
        return DEFAULT_CONVERSATION_TITLE
    normalized = normalized[0].upper() + normalized[1:]
    if len(normalized) <= CONVERSATION_TITLE_MAX_LENGTH:
        return normalized
    truncated = normalized[: CONVERSATION_TITLE_MAX_LENGTH - 1].rsplit(" ", 1)[0]
    return f"{truncated}…"
