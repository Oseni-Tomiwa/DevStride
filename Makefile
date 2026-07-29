.PHONY: api-install api-dev api-lint api-format api-format-check api-typecheck api-test db-up db-down db-logs check

api-install:
	cd apps/api && uv sync --dev

api-dev:
	cd apps/api && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

api-lint:
	cd apps/api && uv run ruff check .

api-format:
	cd apps/api && uv run ruff format .

api-format-check:
	cd apps/api && uv run ruff format --check .

api-typecheck:
	cd apps/api && uv run pyright

api-test:
	cd apps/api && uv run pytest

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

db-logs:
	docker compose logs -f postgres

check:
	pnpm web:lint
	pnpm web:typecheck
	pnpm web:test
	pnpm web:build
	$(MAKE) api-lint
	$(MAKE) api-format-check
	$(MAKE) api-typecheck
	$(MAKE) api-test
