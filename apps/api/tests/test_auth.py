import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from httpx import Response
from jwt.algorithms import ECAlgorithm

from app.auth.jwt import jwks_client
from app.core.config import settings
from app.main import app

client = TestClient(app)
TEST_ISSUER = cast(str, settings.supabase_jwt_issuer)


@dataclass
class KeyMaterial:
    private_key: Any
    jwk: dict[str, Any]
    kid: str


def create_key_material(kid: str) -> KeyMaterial:
    private_key = ec.generate_private_key(ec.SECP256R1())
    jwk = json.loads(ECAlgorithm.to_jwk(private_key.public_key()))  # pyright: ignore[reportUnknownMemberType]
    jwk.update({"kid": kid, "alg": "ES256", "use": "sig"})
    return KeyMaterial(private_key=private_key, jwk=jwk, kid=kid)


@pytest.fixture
def signing_key(monkeypatch: pytest.MonkeyPatch) -> KeyMaterial:
    material = create_key_material("current-key")

    async def fetch_jwks() -> dict[str, Any]:
        return {"keys": [material.jwk]}

    jwks_client.clear()
    monkeypatch.setattr(jwks_client, "fetch_jwks", fetch_jwks)
    return material


def make_token(
    signing_key: KeyMaterial,
    *,
    subject: str | None = None,
    issuer: str = TEST_ISSUER,
    audience: str = settings.supabase_jwt_audience,
    expires_at: datetime | None = None,
    kid: str | None = None,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject if subject is not None else str(uuid4()),
        "aud": audience,
        "iss": issuer,
        "iat": now,
        "exp": expires_at or now + timedelta(minutes=5),
        "email": "user@example.com",
    }
    return jwt.encode(  # pyright: ignore[reportUnknownMemberType]
        payload,
        signing_key.private_key,
        algorithm="ES256",
        headers={"kid": kid or signing_key.kid},
    )


def get_me(authorization: str | None = None) -> Response:
    headers = {} if authorization is None else {"Authorization": authorization}
    return cast(Response, client.get("/api/v1/auth/me", headers=headers))  # pyright: ignore[reportUnknownMemberType]


def test_missing_authorization_header_returns_401(signing_key: KeyMaterial) -> None:
    del signing_key
    response = get_me()

    assert response.status_code == 401


def test_malformed_authorization_header_returns_401(signing_key: KeyMaterial) -> None:
    del signing_key
    response = get_me("Basic not-a-bearer-token")

    assert response.status_code == 401


def test_unknown_kid_returns_401(signing_key: KeyMaterial) -> None:
    response = get_me(f"Bearer {make_token(signing_key, kid='unknown-key')}")

    assert response.status_code == 401


def test_key_rotation_refreshes_jwks_once(
    signing_key: KeyMaterial, monkeypatch: pytest.MonkeyPatch
) -> None:
    rotated_key = create_key_material("rotated-key")
    responses = [{"keys": [signing_key.jwk]}, {"keys": [rotated_key.jwk]}]
    calls = 0

    async def fetch_jwks() -> dict[str, Any]:
        nonlocal calls
        calls += 1
        return responses.pop(0)

    monkeypatch.setattr(jwks_client, "fetch_jwks", fetch_jwks)
    response = get_me(f"Bearer {make_token(rotated_key)}")

    assert response.status_code == 200
    assert calls == 2


def test_invalid_signature_returns_401(signing_key: KeyMaterial) -> None:
    wrong_key = create_key_material(signing_key.kid)
    response = get_me(f"Bearer {make_token(wrong_key)}")

    assert response.status_code == 401


def test_expired_token_returns_401(signing_key: KeyMaterial) -> None:
    response = get_me(
        f"Bearer {make_token(signing_key, expires_at=datetime.now(UTC) - timedelta(minutes=1))}"
    )

    assert response.status_code == 401


def test_wrong_issuer_returns_401(signing_key: KeyMaterial) -> None:
    response = get_me(f"Bearer {make_token(signing_key, issuer='https://wrong.example.com')}")

    assert response.status_code == 401


def test_wrong_audience_returns_401(signing_key: KeyMaterial) -> None:
    response = get_me(f"Bearer {make_token(signing_key, audience='wrong-audience')}")

    assert response.status_code == 401


def test_malformed_subject_returns_401(signing_key: KeyMaterial) -> None:
    response = get_me(f"Bearer {make_token(signing_key, subject='not-a-uuid')}")

    assert response.status_code == 401


def test_valid_token_returns_verified_user(signing_key: KeyMaterial) -> None:
    user_id = uuid4()
    response = get_me(f"Bearer {make_token(signing_key, subject=str(user_id))}")

    assert response.status_code == 200
    assert response.json() == {"id": str(user_id), "email": "user@example.com"}


def test_user_id_comes_from_verified_subject_claim(signing_key: KeyMaterial) -> None:
    user_id = UUID("12345678-1234-5678-1234-567812345678")
    response = get_me(f"Bearer {make_token(signing_key, subject=str(user_id))}")

    assert response.json()["id"] == str(user_id)
