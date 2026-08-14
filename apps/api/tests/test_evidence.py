from app.conversations.evidence import (
    has_meaningful_user_evidence,
    is_meaningful_user_content,
)


def test_placeholder_transcript_values_are_not_evidence() -> None:
    for content in ("", "   ", "[silence]", "[no response]", "...", "…"):
        assert is_meaningful_user_content(content) is False


def test_substantive_user_content_is_evidence() -> None:
    assert is_meaningful_user_content("I would put the cache behind the API.") is True


def test_control_request_does_not_count_as_candidate_evidence() -> None:
    messages = [
        type("Message", (), {"role": "assistant", "content": "Question"})(),
        type(
            "Message",
            (),
            {
                "role": "user",
                "content": "End the interview and provide my final practice assessment",
            },
        )(),
    ]
    assert has_meaningful_user_evidence(messages) is False
