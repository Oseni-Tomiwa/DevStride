# DevStride

DevStride is a planned AI software-engineering mentor and communication coach.
Codex is used to accelerate implementation; it is not the product name.

This repository currently contains the Milestone 0 foundation.

## Repository structure

```text
apps/web        Next.js frontend
apps/api        FastAPI backend
packages        Shared contracts and prompts
docs            Product, architecture, and ADRs
evals           Future AI evaluation datasets
infrastructure  Deployment and operational files
```

## Prerequisites

Install:
- Node.js 22.13+
- pnpm 10+
- Python 3.12+
- uv
- Docker with Docker Compose
- Git

## Initial setup

```bash
cp .env.example .env
pnpm install
make api-install
make db-up
```

Run the setup commands from the repository root. The API reads the root `.env`
file when started through the commands below; no `.env` file is committed.

## Run the frontend

```bash
pnpm web:dev
```

Open `http://localhost:3000`.

## Run the API

```bash
make api-dev
```

Open `http://localhost:8000/docs`.

Health check:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok","service":"devstride-api"}
```

## Quality checks

```bash
make check
```

Or individually:

```bash
pnpm web:lint
pnpm web:typecheck
pnpm web:test
pnpm web:build

make api-lint
make api-format-check
make api-typecheck
make api-test
```

## Database

Start:

```bash
make db-up
```

Stop:

```bash
make db-down
```

View logs:

```bash
make db-logs
```

## Codex workflow

Codex must read `AGENTS.md` first. The initial task is stored in
`FIRST_CODEX_PROMPT.md`.

## Current scope

Only Milestone 0 foundation work is allowed. Product features begin after the
foundation has been verified.
