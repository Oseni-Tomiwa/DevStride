import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://test:test@localhost:5432/devstride_test",
)
os.environ.setdefault("SUPABASE_JWT_ISSUER", "https://test-project.supabase.co/auth/v1")
os.environ.setdefault("SUPABASE_JWT_ALGORITHMS", "ES256")
