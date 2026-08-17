from typing import cast

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = cast(Response, client.get("/health"))  # pyright: ignore[reportUnknownMemberType]

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "devstride-api",
    }


def test_readiness_returns_503_when_database_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class UnavailableEngine:
        def connect(self):
            raise RuntimeError("database unavailable")

    monkeypatch.setattr("app.api.health.engine", UnavailableEngine())
    response = cast(Response, client.get("/ready"))  # pyright: ignore[reportUnknownMemberType]
    assert response.status_code == 503
    assert response.json() == {"detail": "Service is not ready"}
