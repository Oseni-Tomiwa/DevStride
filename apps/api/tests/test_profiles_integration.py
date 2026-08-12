# pyright: reportUnknownMemberType=false

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
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from app.auth.jwt import jwks_client
from app.conversations.models import Conversation, Message
from app.conversations.response_service import system_instruction
from app.core.config import settings
from app.database.session import get_db_session
from app.goals.models import Goal, GoalFocusArea
from app.goals.repository import get_current_focus_owned
from app.main import app
from app.memory.models import MemoryRecord
from app.memory.service import retrieve_for_prompt
from app.profiles.models import Profile
from app.progress import repository as progress_repository
from app.progress.service import get_progress_summary
from app.session_summaries.models import SessionSummary

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://devstride:devstride@localhost:5432/devstride_test",
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
        await session.execute(delete(Goal))
        await session.execute(delete(MemoryRecord))
        await session.execute(delete(Profile))
        await session.commit()
    yield factory
    async with factory() as session:
        await session.execute(delete(Conversation))
        await session.execute(delete(Goal))
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


def goal_payload() -> dict[str, object]:
    return {
        "title": "Grow as a backend engineer",
        "description": "Practice APIs and technical communication.",
        "goal_type": "technical_growth",
        "focus_areas": [
            {
                "title": "Explain API tradeoffs",
                "practice_mode": "mentor",
                "practice_config": {},
            },
            {
                "title": "Backend interviews",
                "practice_mode": "interview",
                "practice_config": {
                    "interview_type": "technical",
                    "interview_focus": "apis",
                },
            },
        ],
    }


@pytest.mark.asyncio
async def test_goal_lifecycle_focus_ordering_and_database_constraints(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, factory = integration_client
    user_id = uuid4()
    headers = auth_headers(signing_key, user_id)

    empty = cast(Response, client.get("/api/v1/goals", headers=headers))
    assert empty.status_code == 200
    assert empty.json() == []

    created = cast(Response, client.post("/api/v1/goals", headers=headers, json=goal_payload()))
    assert created.status_code == 201
    body = created.json()
    goal_id = UUID(body["id"])
    first_id = UUID(body["focus_areas"][0]["id"])
    second_id = UUID(body["focus_areas"][1]["id"])
    assert [item["position"] for item in body["focus_areas"]] == [0, 1]
    assert "user_id" not in body

    duplicate = cast(Response, client.post("/api/v1/goals", headers=headers, json=goal_payload()))
    assert duplicate.status_code == 409

    renamed = cast(
        Response,
        client.patch(
            f"/api/v1/goals/{goal_id}", headers=headers, json={"title": "Backend mastery"}
        ),
    )
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Backend mastery"

    reordered = cast(
        Response,
        client.put(
            f"/api/v1/goals/{goal_id}/focus-areas/order",
            headers=headers,
            json={"focus_area_ids": [str(second_id), str(first_id)]},
        ),
    )
    assert reordered.status_code == 200
    assert [UUID(item["id"]) for item in reordered.json()] == [second_id, first_id]
    assert [item["position"] for item in reordered.json()] == [0, 1]

    completed_focus = cast(
        Response,
        client.patch(
            f"/api/v1/goals/{goal_id}/focus-areas/{first_id}",
            headers=headers,
            json={"title": "Explain API tradeoffs clearly", "status": "completed"},
        ),
    )
    assert completed_focus.status_code == 200
    assert completed_focus.json()["title"] == "Explain API tradeoffs clearly"
    assert completed_focus.json()["completed_at"] is not None

    reopened_focus = cast(
        Response,
        client.patch(
            f"/api/v1/goals/{goal_id}/focus-areas/{first_id}",
            headers=headers,
            json={"status": "active"},
        ),
    )
    assert reopened_focus.status_code == 200
    assert reopened_focus.json()["completed_at"] is None

    completed = cast(
        Response,
        client.patch(f"/api/v1/goals/{goal_id}", headers=headers, json={"status": "completed"}),
    )
    assert completed.status_code == 200
    assert completed.json()["completed_at"] is not None

    replacement = cast(Response, client.post("/api/v1/goals", headers=headers, json=goal_payload()))
    assert replacement.status_code == 201

    conflict = cast(
        Response,
        client.patch(f"/api/v1/goals/{goal_id}", headers=headers, json={"status": "active"}),
    )
    assert conflict.status_code == 409

    replacement_id = UUID(replacement.json()["id"])
    archived = cast(Response, client.delete(f"/api/v1/goals/{replacement_id}", headers=headers))
    assert archived.status_code == 204
    archived_reopen = cast(
        Response,
        client.patch(f"/api/v1/goals/{replacement_id}", headers=headers, json={"status": "active"}),
    )
    assert archived_reopen.status_code == 409

    reopened = cast(
        Response,
        client.patch(f"/api/v1/goals/{goal_id}", headers=headers, json={"status": "active"}),
    )
    assert reopened.status_code == 200
    assert reopened.json()["completed_at"] is None

    listed = cast(Response, client.get("/api/v1/goals", headers=headers))
    assert [item["status"] for item in listed.json()] == ["active", "archived"]
    archived_only = cast(Response, client.get("/api/v1/goals?status=archived", headers=headers))
    assert [item["id"] for item in archived_only.json()] == [str(replacement_id)]

    async with factory() as session:
        persisted = await session.get(Goal, goal_id)
        assert persisted is not None
        assert persisted.status == "active"
        focus_result = await session.execute(
            select(GoalFocusArea)
            .where(GoalFocusArea.goal_id == goal_id)
            .order_by(GoalFocusArea.position)
        )
        assert [item.id for item in focus_result.scalars()] == [second_id, first_id]
        current_focus = await get_current_focus_owned(session, user_id, goal_id)
        assert current_focus is not None
        assert current_focus.id == second_id


@pytest.mark.asyncio
async def test_goal_focus_limits_validation_and_cross_user_isolation(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, _ = integration_client
    owner_id = uuid4()
    other_id = uuid4()
    owner_headers = auth_headers(signing_key, owner_id)
    other_headers = auth_headers(signing_key, other_id)
    created = cast(
        Response, client.post("/api/v1/goals", headers=owner_headers, json=goal_payload())
    )
    goal_id = UUID(created.json()["id"])
    focus_id = UUID(created.json()["focus_areas"][0]["id"])

    assert client.get(f"/api/v1/goals/{goal_id}", headers=other_headers).status_code == 404
    assert (
        client.patch(
            f"/api/v1/goals/{goal_id}/focus-areas/{focus_id}",
            headers=other_headers,
            json={"title": "Not owned"},
        ).status_code
        == 404
    )

    invalid = cast(
        Response,
        client.post(
            f"/api/v1/goals/{goal_id}/focus-areas",
            headers=owner_headers,
            json={
                "title": "Unsafe",
                "practice_mode": "mentor",
                "practice_config": {"provider": "override"},
            },
        ),
    )
    assert invalid.status_code == 422

    for number in range(4):
        added = cast(
            Response,
            client.post(
                f"/api/v1/goals/{goal_id}/focus-areas",
                headers=owner_headers,
                json={
                    "title": f"Focus {number}",
                    "practice_mode": "team",
                    "practice_config": {
                        "team_scenario": "code_review",
                        "team_difficulty": "guided",
                    },
                },
            ),
        )
        assert added.status_code == 201

    seventh = cast(
        Response,
        client.post(
            f"/api/v1/goals/{goal_id}/focus-areas",
            headers=owner_headers,
            json={"title": "Too many", "practice_mode": "mentor", "practice_config": {}},
        ),
    )
    assert seventh.status_code == 409

    archived_focus = cast(
        Response,
        client.delete(f"/api/v1/goals/{goal_id}/focus-areas/{focus_id}", headers=owner_headers),
    )
    assert archived_focus.status_code == 204
    replacement = cast(
        Response,
        client.post(
            f"/api/v1/goals/{goal_id}/focus-areas",
            headers=owner_headers,
            json={"title": "Replacement", "practice_mode": "mentor", "practice_config": {}},
        ),
    )
    assert replacement.status_code == 201


@pytest.mark.asyncio
async def test_plan_preview_uses_owned_profile_and_active_relevant_memories_without_persisting(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, factory = integration_client
    user_id = uuid4()
    other_user_id = uuid4()
    async with factory() as session:
        session.add(
            Profile(
                user_id=user_id,
                display_name="Preview User",
                current_level="mid_level",
                target_role="backend_engineer",
                preferred_stack=["TypeScript"],
                communication_goal="workplace_communication",
                feedback_preference="direct",
                onboarding_completed=True,
            )
        )
        session.add_all(
            [
                MemoryRecord(
                    user_id=user_id,
                    category="goal",
                    content="Prepare for API design discussions",
                    importance=5,
                    confidence=1.0,
                    source_type="manual",
                ),
                MemoryRecord(
                    user_id=user_id,
                    category="weakness",
                    content="Archived explanation note",
                    importance=5,
                    confidence=1.0,
                    source_type="manual",
                    status="archived",
                ),
                MemoryRecord(
                    user_id=other_user_id,
                    category="skill",
                    content="Another user's private context",
                    importance=5,
                    confidence=1.0,
                    source_type="manual",
                ),
            ]
        )
        await session.commit()

    payload = {
        "title": "Prepare for backend interviews",
        "goal_type": "interview_preparation",
    }
    first = cast(
        Response,
        client.post(
            "/api/v1/goals/plan-preview",
            headers=auth_headers(signing_key, user_id),
            json=payload,
        ),
    )
    second = cast(
        Response,
        client.post(
            "/api/v1/goals/plan-preview",
            headers=auth_headers(signing_key, user_id),
            json=payload,
        ),
    )

    assert first.status_code == 200
    assert first.json() == second.json()
    body = first.json()
    assert body["template_suggestions"][0]["practice_config"] == {
        "interview_type": "technical",
        "interview_focus": "javascript_node",
    }
    assert len(body["memory_suggestions"]) == 1
    assert "Prepare for API design discussions" in body["memory_suggestions"][0]["title"]
    assert "Archived explanation note" not in str(body)
    assert "Another user's private context" not in str(body)
    async with factory() as session:
        assert await session.scalar(select(func.count(Goal.id))) == 0


@pytest.mark.asyncio
async def test_goal_practice_launch_persists_owned_mode_config_and_focus_link(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, factory = integration_client
    user_id = uuid4()
    headers = auth_headers(signing_key, user_id)
    payload = goal_payload()
    focus_areas = cast(list[dict[str, object]], payload["focus_areas"])
    focus_areas.append(
        {
            "title": "Code review communication",
            "practice_mode": "team",
            "practice_config": {
                "team_scenario": "code_review",
                "team_difficulty": "challenging",
            },
        }
    )
    created_goal = cast(Response, client.post("/api/v1/goals", headers=headers, json=payload))
    assert created_goal.status_code == 201
    goal_id = UUID(created_goal.json()["id"])
    focuses = created_goal.json()["focus_areas"]

    launched: list[tuple[UUID, UUID]] = []
    for focus in focuses:
        response = cast(
            Response,
            client.post(
                f"/api/v1/goals/{goal_id}/focus-areas/{focus['id']}/practice",
                headers=headers,
            ),
        )
        assert response.status_code == 201
        assert response.json()["mode"] == focus["practice_mode"]
        assert "focus_area_id" not in response.json()
        launched.append((UUID(response.json()["id"]), UUID(focus["id"])))

    duplicate = cast(
        Response,
        client.post(
            f"/api/v1/goals/{goal_id}/focus-areas/{focuses[0]['id']}/practice",
            headers=headers,
        ),
    )
    assert duplicate.status_code == 201
    assert UUID(duplicate.json()["id"]) != launched[0][0]

    normal = cast(
        Response,
        client.post(
            "/api/v1/conversations",
            headers=headers,
            json={"title": "Unlinked conversation", "mode": "general"},
        ),
    )
    assert normal.status_code == 201

    async with factory() as session:
        for conversation_id, focus_id in launched:
            conversation = await session.get(Conversation, conversation_id)
            assert conversation is not None
            assert conversation.user_id == user_id
            assert conversation.focus_area_id == focus_id
        mentor = await session.get(Conversation, launched[0][0])
        interview = await session.get(Conversation, launched[1][0])
        team = await session.get(Conversation, launched[2][0])
        assert mentor is not None and mentor.metadata_ == {}
        assert interview is not None and interview.metadata_ == {
            "interview_type": "technical",
            "interview_focus": "apis",
        }
        assert team is not None and team.metadata_ == {
            "team_scenario": "code_review",
            "team_difficulty": "challenging",
        }
        unlinked = await session.get(Conversation, UUID(normal.json()["id"]))
        assert unlinked is not None
        assert unlinked.focus_area_id is None


@pytest.mark.asyncio
async def test_goal_practice_launch_enforces_owned_goal_and_matching_focus(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, _ = integration_client
    owner_id = uuid4()
    other_id = uuid4()
    owner_headers = auth_headers(signing_key, owner_id)
    other_headers = auth_headers(signing_key, other_id)
    owner_goal = cast(
        Response, client.post("/api/v1/goals", headers=owner_headers, json=goal_payload())
    )
    other_goal = cast(
        Response, client.post("/api/v1/goals", headers=other_headers, json=goal_payload())
    )
    owner_goal_id = owner_goal.json()["id"]
    owner_focus_id = owner_goal.json()["focus_areas"][0]["id"]
    other_focus_id = other_goal.json()["focus_areas"][0]["id"]

    unowned_goal = cast(
        Response,
        client.post(
            f"/api/v1/goals/{owner_goal_id}/focus-areas/{owner_focus_id}/practice",
            headers=other_headers,
        ),
    )
    mismatched_focus = cast(
        Response,
        client.post(
            f"/api/v1/goals/{owner_goal_id}/focus-areas/{other_focus_id}/practice",
            headers=owner_headers,
        ),
    )

    assert unowned_goal.status_code == 404
    assert mismatched_focus.status_code == 404


@pytest.mark.asyncio
async def test_goal_progress_is_linked_owned_and_non_mutating(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, factory = integration_client
    owner_id = uuid4()
    other_id = uuid4()
    headers = auth_headers(signing_key, owner_id)
    other_headers = auth_headers(signing_key, other_id)
    created = cast(Response, client.post("/api/v1/goals", headers=headers, json=goal_payload()))
    goal_id = UUID(created.json()["id"])
    focus_id = UUID(created.json()["focus_areas"][0]["id"])
    other_goal = cast(
        Response, client.post("/api/v1/goals", headers=other_headers, json=goal_payload())
    )

    launched = cast(
        Response,
        client.post(
            f"/api/v1/goals/{goal_id}/focus-areas/{focus_id}/practice",
            headers=headers,
        ),
    )
    conversation_id = UUID(launched.json()["id"])
    user_message = cast(
        Response,
        client.post(
            f"/api/v1/conversations/{conversation_id}/messages",
            headers=headers,
            json={"content": "Explain the API trade-off."},
        ),
    )
    assert user_message.status_code == 201

    async with factory() as session:
        conversation = await session.get(Conversation, conversation_id)
        assert conversation is not None
        conversation.metadata_ = {"mentor_completed": True}
        session.add(
            SessionSummary(
                conversation_id=conversation_id,
                user_id=owner_id,
                session_mode="mentor",
                summary="Observed linked practice",
                topics_covered=["APIs"],
                strengths=["Clear trade-offs"],
                weaknesses=["Explain failure handling"],
                recommended_next_steps=["Practice failure handling"],
            )
        )
        await session.commit()

    before = cast(Response, client.get(f"/api/v1/goals/{goal_id}/progress", headers=headers))
    assert before.status_code == 200
    body = before.json()
    assert body["linked_practiced_sessions"] == 1
    assert body["linked_completed_structured_sessions"] == 1
    assert body["linked_user_turns"] == 1
    assert body["focus_areas"][0]["linked_practiced_sessions"] == 1
    assert body["recent_strength"]["text"] == "Clear trade-offs"
    assert body["recent_weakness"]["text"] == "Explain failure handling"
    assert body["next_action"]["focus_area_id"] == str(focus_id)

    unowned = cast(
        Response,
        client.get(
            f"/api/v1/goals/{goal_id}/progress",
            headers=other_headers,
        ),
    )
    assert unowned.status_code == 404

    async with factory() as session:
        persisted_goal = await session.get(Goal, goal_id)
        assert persisted_goal is not None
        assert persisted_goal.status == "active"
        persisted_focus = await session.get(GoalFocusArea, focus_id)
        assert persisted_focus is not None
        assert persisted_focus.status == "active"
        assert await session.scalar(select(func.count(Conversation.id))) == 1
        assert other_goal.status_code == 201


@pytest.mark.asyncio
async def test_conversation_focus_fk_is_nullable_and_sets_null_on_focus_delete(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    _, _, factory = integration_client
    user_id = uuid4()
    goal = Goal(user_id=user_id, title="FK goal", goal_type="custom", status="active")
    focus = GoalFocusArea(
        title="FK focus",
        practice_mode="mentor",
        practice_config={},
        position=0,
        status="active",
    )
    goal.focus_areas = [focus]
    async with factory() as session:
        session.add(goal)
        await session.flush()
        unattached = Conversation(user_id=user_id, title="Existing", mode="general")
        attached = Conversation(
            user_id=user_id, title="Attached", mode="mentor", focus_area_id=focus.id
        )
        session.add_all([unattached, attached])
        await session.commit()
        attached_id = attached.id
        unattached_id = unattached.id

    async with factory() as session:
        persisted_unattached = await session.get(Conversation, unattached_id)
        assert persisted_unattached is not None
        assert persisted_unattached.focus_area_id is None
        stored_focus = await session.get(GoalFocusArea, focus.id)
        assert stored_focus is not None
        await session.delete(stored_focus)
        await session.commit()

    async with factory() as session:
        persisted_attached = await session.get(Conversation, attached_id)
        assert persisted_attached is not None
        assert persisted_attached.focus_area_id is None


@pytest.mark.asyncio
async def test_goal_partial_unique_and_completion_constraints_are_database_enforced(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    _, _, factory = integration_client
    user_id = uuid4()
    async with factory() as session:
        session.add_all(
            [
                Goal(user_id=user_id, title="First", goal_type="custom", status="active"),
                Goal(user_id=user_id, title="Second", goal_type="custom", status="active"),
            ]
        )
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()

        session.add(
            Goal(
                user_id=uuid4(),
                title="Invalid completion",
                goal_type="custom",
                status="completed",
                completed_at=None,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()


@pytest.mark.asyncio
async def test_migration_0006_preserves_existing_conversations_and_is_reversible(
    test_database: tuple[AsyncEngine, async_sessionmaker[Any]],
) -> None:
    engine, factory = test_database
    api_root = Path(__file__).parents[1]
    conversation_id = uuid4()
    user_id = uuid4()
    await engine.dispose()
    await asyncio.to_thread(run_migration, api_root, "0005")
    try:
        async with factory() as session:
            await session.execute(
                text(
                    "INSERT INTO conversations (id, user_id, title, mode, status) "
                    "VALUES (:id, :user_id, :title, :mode, :status)"
                ),
                {
                    "id": conversation_id,
                    "user_id": user_id,
                    "title": "Pre-goals conversation",
                    "mode": "general",
                    "status": "active",
                },
            )
            await session.commit()

        await asyncio.to_thread(run_migration, api_root, "head")
        async with factory() as session:
            focus_area_id = await session.scalar(
                text("SELECT focus_area_id FROM conversations WHERE id = :id"),
                {"id": conversation_id},
            )
            assert focus_area_id is None
            await session.execute(
                text("DELETE FROM conversations WHERE id = :id"), {"id": conversation_id}
            )
            await session.commit()
    finally:
        await asyncio.to_thread(run_migration, api_root, "head")


@pytest.mark.asyncio
async def test_progress_returns_zero_conversations(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, _ = integration_client
    user_id = uuid4()

    response = cast(
        Response,
        client.get(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/progress", headers=auth_headers(signing_key, user_id)
        ),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_sessions"] == 0
    assert body["mentor_sessions"] == 0
    assert body["interview_sessions"] == 0
    assert body["general_sessions"] == 0
    assert body["team_sessions"] == 0
    assert body["recent_sessions"] == []
    assert body["activity"] == {
        "practiced_sessions": 0,
        "completed_sessions": 0,
        "user_turns": 0,
        "practiced_sessions_last_30_days": 0,
        "mode_breakdown": {"general": 0, "mentor": 0, "interview": 0, "team": 0},
    }
    assert body["recommendation"]["activity"] == "mentor"


@pytest.mark.asyncio
async def test_progress_handles_messages_summaries_and_supported_modes(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, factory = integration_client
    user_id = uuid4()
    other_user_id = uuid4()
    now = datetime.now(UTC)
    general = Conversation(
        user_id=user_id,
        title="New conversation",
        mode="general",
        metadata_={},
        created_at=now - timedelta(minutes=8),
        updated_at=now - timedelta(minutes=4),
    )
    mentor = Conversation(
        user_id=user_id,
        title="Mentor session",
        mode="mentor",
        metadata_={},
        created_at=now - timedelta(minutes=7),
        updated_at=now - timedelta(minutes=3),
    )
    interview = Conversation(
        user_id=user_id,
        title="Technical interview",
        mode="interview",
        metadata_={"interview_type": "technical", "interview_focus": "databases"},
        created_at=now - timedelta(minutes=6),
        updated_at=now - timedelta(minutes=2),
    )
    team = Conversation(
        user_id=user_id,
        title="Team Practice",
        mode="team",
        metadata_={"team_scenario": "architecture_discussion"},
        created_at=now - timedelta(minutes=5),
        updated_at=now - timedelta(minutes=1),
    )
    unowned = Conversation(
        user_id=other_user_id,
        title="Other user's session",
        mode="mentor",
        metadata_={},
        created_at=now,
        updated_at=now,
    )

    async with factory() as session:
        session.add_all([general, mentor, interview, team, unowned])
        await session.flush()
        session.add_all(
            [
                Message(
                    conversation_id=general.id,
                    role="assistant",
                    content="How can I help?",
                    created_at=now - timedelta(minutes=7, seconds=30),
                ),
                Message(
                    conversation_id=general.id,
                    role="user",
                    content="Help me with API pagination.",
                    created_at=now - timedelta(minutes=7),
                ),
                Message(
                    conversation_id=general.id,
                    role="user",
                    content="Show me an example.",
                    created_at=now - timedelta(minutes=6),
                ),
                Message(
                    conversation_id=mentor.id,
                    role="user",
                    content="Explain dependency injection.",
                    created_at=now - timedelta(minutes=5),
                ),
                Message(
                    conversation_id=interview.id,
                    role="assistant",
                    content="Tell me about database indexes.",
                    created_at=now - timedelta(minutes=4),
                ),
                Message(
                    conversation_id=interview.id,
                    role="user",
                    content="An index speeds reads by maintaining an ordered lookup structure.",
                    created_at=now - timedelta(minutes=3, seconds=30),
                ),
                Message(
                    conversation_id=team.id,
                    role="assistant",
                    content="Let's discuss the service boundary.",
                    created_at=now - timedelta(minutes=3),
                ),
                SessionSummary(
                    conversation_id=interview.id,
                    user_id=user_id,
                    session_mode="interview",
                    summary="Practiced database interview questions.",
                    topics_covered=["database indexes"],
                    strengths=["clear reasoning"],
                    weaknesses=[],
                    recommended_next_steps=["practice query plans"],
                ),
                Message(
                    conversation_id=unowned.id,
                    role="user",
                    content="This activity must not affect the owner.",
                    created_at=now,
                ),
                SessionSummary(
                    conversation_id=unowned.id,
                    user_id=other_user_id,
                    session_mode="mentor",
                    summary="Other user summary.",
                    topics_covered=["private topic"],
                    strengths=["private strength"],
                    weaknesses=["private weakness"],
                    recommended_next_steps=["private next step"],
                ),
                MemoryRecord(
                    user_id=user_id,
                    category="goal",
                    content="Practice backend interview explanations",
                    importance=5,
                    confidence=1.0,
                    source_type="manual",
                ),
                MemoryRecord(
                    user_id=other_user_id,
                    category="goal",
                    content="Other user's private goal",
                    importance=5,
                    confidence=1.0,
                    source_type="manual",
                ),
            ]
        )
        await session.commit()

    async with factory() as session:
        rows = await progress_repository.get_progress_rows(session, user_id)
        summary = await get_progress_summary(session, user_id)

    rows_by_id = {row.conversation.id: row for row in rows}
    assert len(rows) == 4
    assert rows_by_id[general.id].message_count == 3
    assert rows_by_id[general.id].user_turns == 2
    assert rows_by_id[general.id].first_user_content == "Help me with API pagination."
    assert rows_by_id[mentor.id].message_count == 1
    assert rows_by_id[mentor.id].user_turns == 1
    assert rows_by_id[interview.id].message_count == 2
    assert rows_by_id[interview.id].user_turns == 1
    assert rows_by_id[interview.id].summary_available is True
    assert rows_by_id[team.id].message_count == 1
    assert rows_by_id[team.id].user_turns == 0
    assert rows_by_id[team.id].summary_available is False
    assert [item.mode for item in summary.recent_sessions] == [
        "team",
        "interview",
        "mentor",
        "general",
    ]
    assert summary.total_sessions == 4
    assert summary.general_sessions == 1
    assert summary.mentor_sessions == 1
    assert summary.interview_sessions == 1
    assert summary.team_sessions == 1
    assert summary.recent_sessions[-1].title == "API pagination"
    assert summary.activity.practiced_sessions == 3
    assert summary.activity.completed_sessions == 1
    assert summary.activity.user_turns == 4
    assert summary.activity.mode_breakdown.model_dump() == {
        "general": 1,
        "mentor": 1,
        "interview": 1,
        "team": 0,
    }
    assert summary.continue_practice is not None
    assert summary.continue_practice.conversation_id == mentor.id
    assert summary.current_focus is not None
    assert summary.current_focus.label == "Practice backend interview explanations"
    assert summary.recent_strength is not None
    assert summary.recent_strength.text == "clear reasoning"
    assert "private" not in summary.model_dump_json()

    response = cast(
        Response,
        client.get(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/progress", headers=auth_headers(signing_key, user_id)
        ),
    )

    assert response.status_code == 200
    assert response.json()["total_sessions"] == 4
    assert response.json()["activity"]["practiced_sessions"] == 3


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
async def test_team_conversation_and_summary_use_migration_backed_schema(
    integration_client: tuple[TestClient, SigningKey, async_sessionmaker[Any]],
) -> None:
    client, signing_key, factory = integration_client
    user_id = uuid4()
    response = cast(
        Response,
        client.post(  # pyright: ignore[reportUnknownMemberType]
            "/api/v1/conversations",
            json={
                "title": "Team Practice",
                "mode": "team",
                "team_scenario": "architecture_discussion",
                "team_difficulty": "realistic",
            },
            headers=auth_headers(signing_key, user_id),
        ),  # pyright: ignore[reportUnknownMemberType]
    )
    assert response.status_code == 201
    conversation_id = UUID(response.json()["id"])

    async with factory() as session:
        summary = SessionSummary(
            conversation_id=conversation_id,
            user_id=user_id,
            session_mode="team",
            summary="Practiced architecture trade-offs.",
            topics_covered=["boundaries"],
            strengths=["clear trade-offs"],
            weaknesses=[],
            recommended_next_steps=["State assumptions earlier"],
        )
        session.add(summary)
        await session.commit()
        result = await session.execute(
            select(SessionSummary).where(SessionSummary.conversation_id == conversation_id)
        )
        persisted = result.scalar_one()

    assert persisted.session_mode == "team"


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
