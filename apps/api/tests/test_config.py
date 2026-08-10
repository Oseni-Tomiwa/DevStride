from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import ENV_FILE, Settings


def test_database_url_must_use_async_postgresql() -> None:
    with pytest.raises(ValidationError, match="postgresql\\+asyncpg"):
        Settings(app_env="test", database_url="sqlite:///devstride.db")


def test_database_url_is_required_outside_test_environment() -> None:
    with pytest.raises(ValidationError, match="DATABASE_URL is required"):
        Settings(app_env="development", database_url=None)


def test_jwt_issuer_is_required_outside_test_environment() -> None:
    with pytest.raises(ValidationError, match="SUPABASE_JWT_ISSUER is required"):
        Settings(
            app_env="development",
            database_url="postgresql+asyncpg://user:password@localhost:5432/db",
            supabase_jwt_issuer=None,
        )


def test_ai_generation_is_disabled_by_default() -> None:
    settings = Settings(
        app_env="test",
        database_url="postgresql+asyncpg://user:password@localhost:5432/db",
        supabase_jwt_issuer="https://test-project.supabase.co/auth/v1",
    )

    assert settings.ai_generation_enabled is False


def test_enabled_ai_generation_requires_server_key() -> None:
    with pytest.raises(ValidationError, match="OPENAI_API_KEY is required"):
        Settings(
            app_env="test",
            database_url="postgresql+asyncpg://user:password@localhost:5432/db",
            supabase_jwt_issuer="https://test-project.supabase.co/auth/v1",
            ai_generation_enabled=True,
            openai_api_key=None,
        )


def test_settings_env_file_is_absolute_and_repository_rooted(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.chdir(tmp_path)

    assert ENV_FILE.is_absolute()
    assert ENV_FILE == Path(__file__).resolve().parents[3] / ".env"
    assert Settings.model_config.get("env_file") == ENV_FILE


def test_jwt_issuer_must_be_supabase_auth_v1_url() -> None:
    with pytest.raises(ValidationError, match="/auth/v1"):
        Settings(
            app_env="test",
            database_url="postgresql+asyncpg://user:password@localhost:5432/db",
            supabase_jwt_issuer="https://test-project.supabase.co",
        )


def test_cors_origins_must_be_explicit() -> None:
    with pytest.raises(ValidationError, match="explicit origins"):
        Settings(
            app_env="test",
            database_url="postgresql+asyncpg://user:password@localhost:5432/db",
            supabase_jwt_issuer="https://test-project.supabase.co/auth/v1",
            cors_origins="*",
        )


def test_production_cors_origins_must_use_https() -> None:
    with pytest.raises(ValidationError, match="HTTPS origins"):
        Settings(
            app_env="production",
            database_url="postgresql+asyncpg://user:password@localhost:5432/db",
            supabase_jwt_issuer="https://test-project.supabase.co/auth/v1",
            cors_origins="http://localhost:3000",
        )
