import pytest

from app.ai.latency import PracticeLatencyTrace


def test_latency_trace_logs_only_safe_stage_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class DebugLogger:
        def isEnabledFor(self, level: int) -> bool:
            del level
            return True

        def debug(self, message: str, *, extra: dict[str, object]) -> None:
            captured["message"] = message
            captured.update(extra)

    monkeypatch.setattr("app.ai.latency.logger", DebugLogger())
    trace = PracticeLatencyTrace("interview", "assessment")
    trace.mark("provider_response_received")

    assert captured["message"] == "Practice latency stage"
    assert captured["mode"] == "interview"
    assert captured["operation"] == "assessment"
    assert captured["stage"] == "provider_response_received"
    assert isinstance(captured["elapsed_ms"], int)
    assert captured["correlation_id"]
    assert "content" not in captured
    assert "token" not in captured
