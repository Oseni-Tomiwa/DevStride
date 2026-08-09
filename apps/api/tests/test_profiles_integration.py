import asyncio
import json
import os
from collections.abc import AsyncIterator, Generator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast
from uuid import UUID, uuid4

import jwt
import pytest
from alembic.config import Config
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from httpx import Response
from jwt.algorithms import ECAlgorithm
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from app.auth.jwt import jwks_client
from app.conversations.models import Conversation, Message
from app.core.config import settings
from app.database.session import get_db_session
from app.main import app
from app.profiles.models import Profile

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://test:test@localhost:5432/devstride_test",
)
TEST_ISSUER = cast(str, settings.supabase_jwt_issuer)


@dataclass
class SigningKey:
    private_key: Any
    jwk: dict[str, Any]
    kid: str


def make_signing_key(kid: str) -> SigningKey:
    private_key = ec.generate_private_key(ec.SECP256R1())
    jwk = json.loads(
        ECAlgorithm.to_jwk(private_key.public_key())  # pyright: ignore[reportUnknownMemberType]
    )
    jwk.update({"kid": kid, "alg": "ES256", "use": "sig"})
    return SigningKey(private_key, jwk, kid)


def run_migration(api_root: Path, revision: str) -> None:
    config = Config(str(api_root / "alembic.ini"))
    config.set_main_option("script_location", str(api_root / "alembic"))
    if revision == "head":
        command.upgrade(config, revision)
    else:
        command.downgrade(config, revision)


@pytest.fixture(scope="session")
async def test_database() -> AsyncIterator[tuple[AsyncEngine, async_sessionmaker[Any]]]:
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    try:
        async with engine.connect():
            pass
    except Exception as exc:
        await engine.dispose()
        pytest.skip(f"PostgreSQL integration database is unavailable: {exc}")

    api_root = Path(__file__).parents[1]
    previous_test_database_url = os.environ.get("TEST_DATABASE_URL")
    os.environ["TEST_DATABASE_URL"] = TEST_DATABASE_URL
    try:
        await asyncio.to_thread(run_migration, api_root, "head")
        factory = async_sessionmaker(engine, expire_on_commit=False)
        yield engine, factory
    finally:
        await asyncio.to_thread(run_migration, api_root, "base")
        await engine.dispose()
        if previous_test_database_url is None:
            os.environ.pop("TEST_DATABASE_URL", None)
        else:
            os.environ["TEST_DATABASE_URL"] = previous_test_database_url


@pytest.fixture
async def clean_profiles(
    test_database: tuple[AsyncEngine, async_sessionmaker[Any]],
) -> AsyncIterator[async_sessionmaker[Any]]:
    _, factory = test_database
    async with factory() as session:
        await session.execute(delete(Conversation))
        await session.execute(delete(Profile))
        await session.commit()
    yield factory
    async with factory() as session:
        await session.execute(delete(Conversation))
        await session.execute(delete(Profile))
        await session.commit()


@pytest.fixture
def integration_client(
    clean_profiles: async_sessionmaker[Any], monkeypatch: pytest.MonkeyPatch
) -> Generator[tuple[TestClient, SigningKey, async_sessionmaker[Any]], None, None]:
    signing_key = make_signing_key("integration-key")

    async def fetch_jwks() -> dict[str, Any]:
        return {"keys": [signing_key.jwk]}

    async def override_db() -> AsyncIterator[Any]:
        async with clean_profiles() as session:
            yield session

    jwks_client.clear()
    monkeypatch.setattr(jwks_client, "fetch_jwks", fetch_jwks)
    app.dependency_overrides[get_db_session] = override_db
    try:
        yield TestClient(app), signing_key, clean_profiles
    finally:
        app.dependency_overrides.clear()


def bearer_token(signing_key: SigningKey, user_id: UUID) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": str(user_id),
            "aud": settings.supabase_jwt_audience,
            "iss": TEST_ISSUER,
            "iat": now,
            "exp": now + timedelta(minutes=5),
            "email": "integration@example.com",
        },
        signing_key.private_key,
        algorithm="ES256",
        headers={"kid": signing_key.kid},
    )


def onboarding_payload() -> dict[str, object]:
    return {
        "display_name": "Integration User",
        "current_level": "junior",
        "target_role": "backend_engineer",
        "preferred_stack": ["Python", "PostgreSQL"],
        "communication_goal": "technical_interviews",
        "feedback_preference": "balanced",
    }


async def persisted_profile(factory: async_sessionmaker[Any], user_id: UUID) -> Profile | None:
    async with factory() as session:
        result = await session.execute(select(Profile).where(Profile.user_id == user_id))
        return result.scalar_one_or_none()


def auth_headers(signing_key: SigningKey, user_id: UUID) -> dict[str, str]:
    return {"Authorization": f"Bearer {bearer_token(signing_key, user_id)}"}


@pytest.mark.asyncio
async def test_onboarding_creates_real_profile_row(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, factory = integration_client
    user_id = uuid4()

    response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/onboarding",
            json=onboarding_payload(),
            headers=auth_headers(signing_key, user_id),
        ),
    )
    profile = await persisted_profile(factory, user_id)

    assert response.status_code == 201
    assert profile is not None
    assert profile.onboarding_completed is True
    assert profile.display_name == "Integration User"


@pytest.mark.asyncio
async def test_get_profile_returns_persisted_row(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, factory = integration_client
    user_id = uuid4()
    cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/onboarding",
            json=onboarding_payload(),
            headers=auth_headers(signing_key, user_id),
        ),
    )

    response = cast(  # pyright: ignore[reportUnknownMemberType]
        Response,
        client.get(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/profile/me", headers=auth_headers(signing_key, user_id)
        ),
    )
    profile = await persisted_profile(factory, user_id)

    assert response.status_code == 200
    assert response.json()["user_id"] == str(user_id)
    assert profile is not None
    assert response.json()["display_name"] == profile.display_name


@pytest.mark.asyncio
async def test_patch_persists_changes(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, factory = integration_client
    user_id = uuid4()
    cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/onboarding",
            json=onboarding_payload(),
            headers=auth_headers(signing_key, user_id),
        ),
    )

    response = cast(
        Response,
        client.patch(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/profile/me",
            json={"display_name": "Updated User", "preferred_stack": ["Python"]},
            headers=auth_headers(signing_key, user_id),
        ),
    )
    profile = await persisted_profile(factory, user_id)

    assert response.status_code == 200
    assert profile is not None
    assert profile.display_name == "Updated User"
    assert profile.preferred_stack == ["Python"]


@pytest.mark.asyncio
async def test_duplicate_onboarding_is_rejected(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, factory = integration_client
    user_id = uuid4()
    headers = auth_headers(signing_key, user_id)
    cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/onboarding", json=onboarding_payload(), headers=headers
        ),
    )

    response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/onboarding", json=onboarding_payload(), headers=headers
        ),
    )
    profile = await persisted_profile(factory, user_id)

    assert response.status_code == 409
    assert profile is not None


@pytest.mark.asyncio
async def test_user_cannot_read_or_mutate_another_users_profile(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, factory = integration_client
    owner_id = uuid4()
    other_user_id = uuid4()
    cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/onboarding",
            json=onboarding_payload(),
            headers=auth_headers(signing_key, owner_id),
        ),
    )

    get_response = cast(  # pyright: ignore[reportUnknownMemberType]
        Response,
        client.get(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/profile/me", headers=auth_headers(signing_key, other_user_id)
        ),
    )
    patch_response = cast(
        Response,
        client.patch(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/profile/me",
            json={"display_name": "Should Not Persist"},
            headers=auth_headers(signing_key, other_user_id),
        ),
    )
    profile = await persisted_profile(factory, owner_id)

    assert get_response.status_code == 404
    assert patch_response.status_code == 404
    assert profile is not None
    assert profile.display_name == "Integration User"


@pytest.mark.asyncio
async def test_conversation_messages_persist_and_cascade_delete(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, factory = integration_client
    user_id = uuid4()
    headers = auth_headers(signing_key, user_id)

    create_response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/conversations",
            json={"title": "Persistence test"},
            headers=headers,
        ),  # pyright: ignore[reportUnknownMemberType]
    )
    conversation_id = UUID(create_response.json()["id"])
    message_response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/conversations/{conversation_id}/messages",
            json={"content": "First message"},
            headers=headers,
        ),  # pyright: ignore[reportUnknownMemberType]
    )
    delete_response = cast(
        Response,
        client.delete(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/conversations/{conversation_id}", headers=headers
        ),
        # pyright: ignore[reportUnknownMemberType]
    )

    async with factory() as session:
        conversation = await session.get(Conversation, conversation_id)
        messages = list(
            (
                await session.execute(
                    select(Message).where(Message.conversation_id == conversation_id)
                )
            ).scalars()
        )

    assert create_response.status_code == 201
    assert message_response.status_code == 201
    assert delete_response.status_code == 204
    assert conversation is None
    assert messages == []


@pytest.mark.asyncio
async def test_conversation_ownership_is_enforced_end_to_end(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, _ = integration_client
    owner_id = uuid4()
    other_user_id = uuid4()
    owner_headers = auth_headers(signing_key, owner_id)
    other_headers = auth_headers(signing_key, other_user_id)

    create_response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/conversations",
            json={"title": "Owner only"},
            headers=owner_headers,
        ),  # pyright: ignore[reportUnknownMemberType]
    )
    conversation_id = create_response.json()["id"]

    responses: list[Response] = [
        cast(  # pyright: ignore[reportUnknownMemberType]
            Response,
            client.get(  # pyright: ignore[reportUnknownMemberType]
                f"/api/v1/conversations/{conversation_id}", headers=other_headers
            ),
        ),
        cast(
            Response,
            client.patch(  # pyright: ignore[reportUnknownMemberType]
                f"/api/v1/conversations/{conversation_id}",
                json={"title": "Not mine"},
                headers=other_headers,
            ),
        ),
        cast(
            Response,
            client.delete(  # pyright: ignore[reportUnknownMemberType]
                f"/api/v1/conversations/{conversation_id}", headers=other_headers
            ),
        ),
        cast(
            Response,
            client.post(  # pyright: ignore[reportUnknownMemberType]
                f"/api/v1/conversations/{conversation_id}/messages",
                json={"content": "Not mine"},
                headers=other_headers,
            ),
        ),
    ]

    assert create_response.status_code == 201
    assert all(response.status_code == 404 for response in responses)
