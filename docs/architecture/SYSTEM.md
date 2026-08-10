# System Architecture

## Style
DevStride starts as a modular monolith.

## Topology

```text
Browser / Next.js
        |
        | HTTPS + Server-Sent Events
        v
FastAPI modular monolith
        |
        |-- auth
        |-- profiles
        |-- conversations
        |-- mentor
        |-- interviews
        |-- team practice
        |-- memory
        |-- goals
        |-- analytics
        |-- ai provider
        |
        |---------------------|
        v                     v
PostgreSQL                OpenAI API
```

## Current application topology

```text
Next.js application

FastAPI application
  ├── authentication and ownership boundary
  ├── profiles and onboarding
  ├── conversations, messages, and SSE
  ├── Mentor, Interview, and Team Practice modes
  ├── session summaries and progress
  └── bounded user-controlled memory

PostgreSQL through SQLAlchemy async access and Alembic migrations
```

The components are intentionally not connected to product functionality yet.

## Boundaries
- The frontend does not hold provider or service-role secrets.
- The API owns business logic.
- PostgreSQL is the source of truth.
- AI provider-specific logic will live behind an internal interface.
- Mode controls behavior; persona controls tone.
- Messages will be stored as individual records.
- User memories must be inspectable and deletable.
- General conversations receive no memory context; only relevant saved memory
  is bounded and injected into Mentor, Interview, and Team prompts.
- OpenAI API keys and Supabase verification configuration remain backend-only.
- Expensive AI operations use a small authenticated per-user rate-limit
  abstraction. The current implementation stores counters in process memory;
  a distributed implementation is required before horizontal scaling.

## Deferred infrastructure
Do not add Redis, queues, microservices, Kubernetes, WebSockets, pgvector,
embeddings, vector search, or agent frameworks until a demonstrated requirement
exists.
