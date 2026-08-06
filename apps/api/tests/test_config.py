import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_database_url_must_use_async_postgresql() -> None:
    with pytest.raises(ValidationError, match="postgresql\\+asyncpg"):
        Settings(app_env="test", database_url="sqlite:///devstride.db")


def test_database_url_is_required_outside_test_environment() -> None:
    with pytest.raises(ValidationError, match="DATABASE_URL is required"):
        Settings(app_env="development", database_url=None)
