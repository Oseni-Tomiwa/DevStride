from app.conversations.title import derive_conversation_title


def test_title_normalizes_and_removes_terminal_punctuation() -> None:
    assert derive_conversation_title("  Explain   REST APIs. ") == "Explain REST APIs"


def test_title_removes_common_leading_prompt_phrase() -> None:
    assert (
        derive_conversation_title("Help me prepare for a backend interview") == "Backend interview"
    )


def test_title_truncates_at_a_word_boundary() -> None:
    title = derive_conversation_title("A " + "very long conversation topic " * 10)
    assert len(title) <= 60
    assert title.endswith("…")
