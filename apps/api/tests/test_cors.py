from typing import cast

from fastapi.testclient import TestClient
from httpx import Response

from app.main import app

client = TestClient(app)


def test_onboarding_preflight_allows_authenticated_browser_request() -> None:
    response = cast(
        Response,
        client.options(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/onboarding",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        ),
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "POST" in response.headers["access-control-allow-methods"]
    allowed_headers = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers


def test_disallowed_origin_is_not_granted_cors_access() -> None:
    response = cast(
        Response,
        client.options(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/onboarding",
            headers={
                "Origin": "http://malicious.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        ),
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
