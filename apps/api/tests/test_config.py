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


def test_settings_env_file_is_absolute_and_repository_rooted(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.chdir(tmp_path)

    assert ENV_FILE.is_absolute()
    assert ENV_FILE == Path(__file__).resolve().parents[3] / ".env"
    assert Settings.model_config.get("env_file") == ENV_FILE
