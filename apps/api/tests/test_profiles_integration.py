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
from app.conversations.response_service import system_instruction
from app.core.config import settings
from app.database.session import get_db_session
from app.main import app
from app.memory.models import MemoryRecord
from app.memory.service import retrieve_for_prompt
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
        await session.execute(delete(MemoryRecord))
        await session.execute(delete(Profile))
        await session.commit()
    yield factory
    async with factory() as session:
        await session.execute(delete(Conversation))
        await session.execute(delete(MemoryRecord))
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


async def persisted_memories(factory: async_sessionmaker[Any], user_id: UUID) -> list[MemoryRecord]:
    async with factory() as session:
        result = await session.execute(
            select(MemoryRecord)
            .where(MemoryRecord.user_id == user_id)
            .order_by(MemoryRecord.created_at.asc())
        )
        return list(result.scalars().all())


@pytest.mark.asyncio
async def test_memory_create_read_edit_and_archive_are_persisted(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, factory = integration_client
    user_id = uuid4()
    headers = auth_headers(signing_key, user_id)

    create_response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/memories",
            json={"category": "goal", "content": "Target backend engineering roles"},
            headers=headers,
        ),
    )
    memory_id = UUID(create_response.json()["id"])
    read_response = cast(
        Response,
        client.get("/api/v1/memories", headers=headers),  # pyright: ignore[reportUnknownMemberType]
    )
    edit_response = cast(
        Response,
        client.patch(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/memories/{memory_id}",
            json={"content": "Target backend platform roles"},
            headers=headers,
        ),
    )
    delete_response = cast(
        Response,
        client.delete(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/memories/{memory_id}", headers=headers
        ),
    )
    active_after_delete = cast(
        Response,
        client.get("/api/v1/memories", headers=headers),  # pyright: ignore[reportUnknownMemberType]
    )
    stored = await persisted_memories(factory, user_id)

    assert create_response.status_code == 201
    assert read_response.status_code == 200
    assert read_response.json()[0]["content"] == "Target backend engineering roles"
    assert edit_response.status_code == 200
    assert edit_response.json()["content"] == "Target backend platform roles"
    assert delete_response.status_code == 204
    assert active_after_delete.json() == []
    assert len(stored) == 1
    assert stored[0].status == "archived"


@pytest.mark.asyncio
async def test_memory_ownership_validation_and_duplicate_reinforcement(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, factory = integration_client
    owner_id = uuid4()
    other_id = uuid4()
    owner_headers = auth_headers(signing_key, owner_id)
    other_headers = auth_headers(signing_key, other_id)
    payload = {"category": "preference", "content": "Prefers direct feedback"}

    first = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/memories", json=payload, headers=owner_headers
        ),
    )
    second = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/memories",
            json={"category": "preference", "content": "  PREFERS   direct feedback "},
            headers=owner_headers,
        ),
    )
    memory_id = UUID(first.json()["id"])
    foreign_read = cast(
        Response,
        client.get(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/memories", headers=other_headers
        ),
    )
    foreign_edit = cast(
        Response,
        client.patch(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/memories/{memory_id}",
            json={"content": "Changed by another user"},
            headers=other_headers,
        ),
    )
    foreign_delete = cast(
        Response,
        client.delete(  # pyright: ignore[reportUnknownMemberType]
            f"/api/v1/memories/{memory_id}", headers=other_headers
        ),
    )
    stored = await persisted_memories(factory, owner_id)

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["reinforcement_count"] == 1
    assert foreign_read.status_code == 200
    assert foreign_read.json() == []
    assert foreign_edit.status_code == 404
    assert foreign_delete.status_code == 404
    assert len(stored) == 1
    assert stored[0].reinforcement_count == 1


@pytest.mark.asyncio
async def test_memory_invalid_category_and_secret_are_rejected(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, _factory = integration_client
    headers = auth_headers(signing_key, uuid4())

    invalid_category = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/memories",
            json={"category": "identity", "content": "Not allowed"},
            headers=headers,
        ),
    )
    secret = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/memories",
            json={"category": "project", "content": "Remember password=hunter2"},
            headers=headers,
        ),
    )

    assert invalid_category.status_code == 422
    assert secret.status_code == 400


@pytest.mark.asyncio
async def test_memory_migration_and_prompt_injection_boundaries(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    _client, _signing_key, factory = integration_client
    user_id = uuid4()
    profile = Profile(
        user_id=user_id,
        display_name="Prompt User",
        current_level="junior",
        target_role="backend_engineer",
        preferred_stack=["Python"],
        communication_goal="technical_interviews",
        feedback_preference="balanced",
        onboarding_completed=True,
    )
    async with factory() as session:
        session.add(profile)
        for index in range(7):
            session.add(
                MemoryRecord(
                    user_id=user_id,
                    category="skill",
                    content=f"Useful memory {index}",
                    importance=5,
                    confidence=1.0,
                    source_type="manual",
                )
            )
        session.add(
            MemoryRecord(
                user_id=user_id,
                category="weakness",
                content="Archived memory",
                importance=5,
                confidence=1.0,
                source_type="interview_summary",
                status="archived",
            )
        )
        await session.commit()
        memories = await retrieve_for_prompt(session, user_id)
        mentor_prompt = await system_instruction(
            session, user_id, Conversation(user_id=user_id, title="Mentor", mode="mentor")
        )
        interview_prompt = await system_instruction(
            session,
            user_id,
            Conversation(user_id=user_id, title="Interview", mode="interview", metadata_={}),
        )

    assert len(memories) == 6
    assert all(memory.status == "active" for memory in memories)
    assert "Archived memory" not in mentor_prompt
    assert "Archived memory" not in interview_prompt
    assert mentor_prompt.count("Useful memory") == 6
    assert interview_prompt.count("Useful memory") == 6
    assert "current explicit user input overrides it" in mentor_prompt
    assert "current explicit user input overrides it" in interview_prompt
    for prompt in (mentor_prompt, interview_prompt):
        assert "confidence" not in prompt
        assert "source_type" not in prompt
        assert "created_at" not in prompt
        assert str(user_id) not in prompt
        assert "user_id" not in prompt
        assert "Bearer " not in prompt
        assert "PRIVATE KEY" not in prompt


@pytest.mark.asyncio
async def test_general_prompt_receives_no_memory_context(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    _client, _signing_key, factory = integration_client
    user_id = uuid4()
    async with factory() as session:
        session.add(
            MemoryRecord(
                user_id=user_id,
                category="goal",
                content="Target backend roles",
                importance=5,
                confidence=1.0,
                source_type="manual",
            )
        )
        await session.commit()
        prompt = await system_instruction(
            session, user_id, Conversation(user_id=user_id, title="General", mode="general")
        )

    assert "Target backend roles" not in prompt
    assert "Relevant saved user context" not in prompt


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
