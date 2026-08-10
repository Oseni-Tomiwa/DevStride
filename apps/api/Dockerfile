FROM python:3.12-slim AS build

COPY --from=ghcr.io/astral-sh/uv:0.11.33 /uv /uvx /bin/

WORKDIR /build
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY apps/api/app ./app
COPY apps/api/alembic ./alembic
COPY apps/api/alembic.ini ./alembic.ini
RUN uv sync --frozen --no-dev

FROM python:3.12-slim-bookworm

RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app

WORKDIR /build/apps/api
COPY --from=build --chown=app:app /build/.venv /build/.venv
COPY --from=build --chown=app:app /build/app ./app
COPY --from=build --chown=app:app /build/alembic ./alembic
COPY --from=build --chown=app:app /build/alembic.ini ./alembic.ini

ENV PATH="/build/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER app
EXPOSE 10000

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
