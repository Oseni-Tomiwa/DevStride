from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import jwt
from fastapi.testclient import TestClient
from httpx import Response

from app.core.config import settings
from app.main import app

client = TestClient(app)
TEST_SECRET = cast(str, settings.supabase_jwt_secret)
TEST_ISSUER = cast(str, settings.supabase_jwt_issuer)


def make_token(**claims: Any) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(uuid4()),
        "aud": settings.supabase_jwt_audience,
        "iss": TEST_ISSUER,
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "email": "user@example.com",
    }
    payload.update(claims)
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")  # pyright: ignore[reportUnknownMemberType]


def get_me(authorization: str | None = None) -> Response:
    headers = {} if authorization is None else {"Authorization": authorization}
    return cast(Response, client.get("/api/v1/auth/me", headers=headers))  # pyright: ignore[reportUnknownMemberType]


def test_missing_authorization_header_returns_401() -> None:
    response = get_me()

    assert response.status_code == 401


def test_malformed_authorization_header_returns_401() -> None:
    response = get_me("Basic not-a-bearer-token")

    assert response.status_code == 401


def test_invalid_token_returns_401() -> None:
    response = get_me("Bearer not-a-jwt")

    assert response.status_code == 401


def test_expired_token_returns_401() -> None:
    response = get_me(f"Bearer {make_token(exp=datetime.now(UTC) - timedelta(minutes=1))}")

    assert response.status_code == 401


def test_invalid_signature_returns_401() -> None:
    token = jwt.encode(  # pyright: ignore[reportUnknownMemberType]
        {
            "sub": str(uuid4()),
            "aud": settings.supabase_jwt_audience,
            "iss": TEST_ISSUER,
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        "wrong-test-secret-0123456789abcd",
        algorithm="HS256",
    )

    response = get_me(f"Bearer {token}")

    assert response.status_code == 401


def test_missing_subject_returns_401() -> None:
    response = get_me(f"Bearer {make_token(sub=None)}")

    assert response.status_code == 401


def test_malformed_subject_returns_401() -> None:
    response = get_me(f"Bearer {make_token(sub='not-a-uuid')}")

    assert response.status_code == 401


def test_valid_token_returns_verified_user() -> None:
    user_id = uuid4()
    response = get_me(f"Bearer {make_token(sub=str(user_id))}")

    assert response.status_code == 200
    assert response.json() == {"id": str(user_id), "email": "user@example.com"}


def test_user_id_comes_from_verified_subject_claim() -> None:
    user_id = UUID("12345678-1234-5678-1234-567812345678")
    response = get_me(f"Bearer {make_token(sub=str(user_id))}")

    assert response.json()["id"] == str(user_id)
