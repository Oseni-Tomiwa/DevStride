from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
ENV_FILE = (REPOSITORY_ROOT / ".env").resolve()


class Settings(BaseSettings):
    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    database_url: str | None = None
    cors_origins: str = "http://localhost:3000"
    supabase_jwt_issuer: str | None = None
    supabase_jwt_audience: str = "authenticated"
    supabase_jwt_algorithms: str = "ES256"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"
    ai_generation_enabled: bool = False
    ai_rate_limit_enabled: bool = True
    ai_rate_limit_requests: int = 20
    ai_rate_limit_window_seconds: int = 60
    ai_rate_limit_kickoff_requests: int = 5
    ai_rate_limit_summary_requests: int = 5

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
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
        algorithms = tuple(
            algorithm.strip().upper()
            for algorithm in self.supabase_jwt_algorithms.split(",")
            if algorithm.strip()
        )
        allowed_algorithms = {"ES256", "RS256"}
        if not algorithms or any(algorithm not in allowed_algorithms for algorithm in algorithms):
            raise ValueError("SUPABASE_JWT_ALGORITHMS must contain only ES256 or RS256")

        if self.app_env != "test":
            if not self.supabase_jwt_issuer:
                raise ValueError("SUPABASE_JWT_ISSUER is required outside test environments")

        if self.supabase_jwt_issuer:
            issuer = urlparse(self.supabase_jwt_issuer)
            issuer_path_is_valid = issuer.path.rstrip("/") == "/auth/v1"
            if issuer.scheme != "https" or not issuer.netloc or not issuer_path_is_valid:
                raise ValueError("SUPABASE_JWT_ISSUER must be an HTTPS Supabase /auth/v1 URL")

        return self

    @model_validator(mode="after")
    def validate_cors_configuration(self) -> "Settings":
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        if not origins or "*" in origins:
            raise ValueError("CORS_ORIGINS must contain explicit origins and cannot use '*'")
        if self.app_env == "production":
            invalid_origins = [origin for origin in origins if not origin.startswith("https://")]
            if invalid_origins:
                raise ValueError("CORS_ORIGINS must use HTTPS origins in production")
        return self

    @model_validator(mode="after")
    def validate_ai_configuration(self) -> "Settings":
        if not self.openai_model.strip():
            raise ValueError("OPENAI_MODEL must not be blank")
        if self.ai_generation_enabled and not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required when AI_GENERATION_ENABLED is true")
        if self.ai_rate_limit_requests <= 0 or self.ai_rate_limit_window_seconds <= 0:
            raise ValueError("AI rate-limit requests and window must be positive")
        if self.ai_rate_limit_kickoff_requests <= 0 or self.ai_rate_limit_summary_requests <= 0:
            raise ValueError("AI rate-limit operation limits must be positive")
        return self

    def ai_rate_limit_policy(self, operation: str) -> tuple[int, int]:
        if operation == "kickoff":
            return self.ai_rate_limit_kickoff_requests, self.ai_rate_limit_window_seconds
        if operation == "summary":
            return self.ai_rate_limit_summary_requests, self.ai_rate_limit_window_seconds
        return self.ai_rate_limit_requests, self.ai_rate_limit_window_seconds


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
