from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


class Settings(BaseSettings):
    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    database_url: str | None = None
    cors_origins: str = "http://localhost:3000"
    supabase_jwt_secret: str | None = None
    supabase_jwt_issuer: str | None = None
    supabase_jwt_audience: str = "authenticated"

    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_database_url(self) -> "Settings":
        if self.database_url is None:
            if self.app_env != "test":
                raise ValueError("DATABASE_URL is required outside test environments")
            return self

        try:
            database_url = make_url(self.database_url)
        except ArgumentError as exc:
            raise ValueError("DATABASE_URL must be a valid SQLAlchemy URL") from exc

        if database_url.drivername != "postgresql+asyncpg":
            raise ValueError("DATABASE_URL must use the postgresql+asyncpg driver")

        return self

    @model_validator(mode="after")
    def validate_auth_configuration(self) -> "Settings":
        if self.app_env != "test":
            if not self.supabase_jwt_secret:
                raise ValueError("SUPABASE_JWT_SECRET is required outside test environments")
            if not self.supabase_jwt_issuer:
                raise ValueError("SUPABASE_JWT_ISSUER is required outside test environments")

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
