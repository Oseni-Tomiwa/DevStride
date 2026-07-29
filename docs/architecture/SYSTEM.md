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
        |-- simulations
        |-- memory
        |-- goals
        |-- analytics
        |-- ai provider
        |
        |---------------------|
        v                     v
PostgreSQL + pgvector     OpenAI API
```

## Current Milestone 0 topology

```text
Next.js application

FastAPI application
  └── GET /health

PostgreSQL container
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

## Deferred infrastructure
Do not add Redis, queues, microservices, Kubernetes, WebSockets, or agent
frameworks until a demonstrated requirement exists.
