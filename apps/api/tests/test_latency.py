from typing import cast

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from app.ai.latency import PracticeLatencyTrace
from app.main import app


def test_latency_trace_logs_only_safe_stage_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class InfoLogger:
        def isEnabledFor(self, level: int) -> bool:
            del level
            return True

        def info(self, message: str, *, extra: dict[str, object]) -> None:
            captured["message"] = message
            captured.update(extra)

    monkeypatch.setattr("app.ai.latency.logger", InfoLogger())
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


def test_latency_trace_deduplicates_stages_and_logs_completion(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    records: list[dict[str, object]] = []

    class InfoLogger:
        def isEnabledFor(self, level: int) -> bool:
            del level
            return True

        def info(self, message: str, *, extra: dict[str, object]) -> None:
            records.append({"message": message, **extra})

    monkeypatch.setattr("app.ai.latency.logger", InfoLogger())
    trace = PracticeLatencyTrace("general", "stream")

    trace.mark_once("first_provider_chunk_received")
    trace.mark_once("first_provider_chunk_received")
    trace.complete(200)

    assert [record["stage"] for record in records] == [
        "first_provider_chunk_received",
        "request_completed",
    ]
    assert records[-1]["status_code"] == 200
    assert isinstance(records[-1]["total_ms"], int)


def test_request_trace_adds_correlation_id_without_changing_health_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    records: list[dict[str, object]] = []

    class InfoLogger:
        def isEnabledFor(self, level: int) -> bool:
            del level
            return True

        def info(self, message: str, *, extra: dict[str, object]) -> None:
            records.append({"message": message, **extra})

    monkeypatch.setattr("app.ai.latency.logger", InfoLogger())
    response = cast(Response, TestClient(app).get("/health"))  # pyright: ignore[reportUnknownMemberType]

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "devstride-api"}
    assert response.headers["X-Request-ID"]
    assert [record["stage"] for record in records] == [
        "request_received",
        "request_completed",
    ]
    assert records[-1]["status_code"] == 200
    assert "content" not in records[-1]


def test_request_trace_preserves_unauthenticated_error_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    records: list[dict[str, object]] = []

    class InfoLogger:
        def isEnabledFor(self, level: int) -> bool:
            del level
            return True

        def info(self, message: str, *, extra: dict[str, object]) -> None:
            records.append({"message": message, **extra})

    monkeypatch.setattr("app.ai.latency.logger", InfoLogger())
    response = cast(Response, TestClient(app).get("/api/v1/auth/me"))  # pyright: ignore[reportUnknownMemberType]

    assert response.status_code == 401
    assert records[-1]["stage"] == "request_completed"
    assert records[-1]["status_code"] == 401
    assert "authorization" not in records[-1]
    assert "token" not in records[-1]
