import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://test:test@localhost:5432/devstride_test",
)
os.environ.setdefault("SUPABASE_JWT_SECRET", "local-test-jwt-secret-0123456789abcd")
os.environ.setdefault("SUPABASE_JWT_ISSUER", "https://test-project.supabase.co/auth/v1")
