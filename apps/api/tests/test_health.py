from typing import cast

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
