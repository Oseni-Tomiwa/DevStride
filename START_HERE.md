# Start Here

## Working name
DevStride

## What we are building
A personalized AI software-engineering mentor and communication coach.

The product will eventually help users:
- learn technical concepts;
- practise technical and behavioral interviews;
- rehearse stand-ups, group discussions, code reviews, and manager conversations;
- build software projects with guided support;
- track recurring weaknesses and progress;
- receive personalized coaching based on user-approved memories.

## Current goal
Verify and stabilize the implemented MVP foundations before production
deployment. The current application includes authentication, onboarding,
persistent streaming conversations, Mentor Mode, Interview Mode, Team Practice,
progress/history, summaries, and bounded Long-Term Memory v1.

Milestone 0 is complete when:
- the Next.js app starts;
- the FastAPI app starts;
- PostgreSQL starts through Docker Compose;
- `GET /health` returns HTTP 200;
- linting, type checking, tests, and builds pass;
- CI is configured;
- setup instructions work from a clean clone.

## Implemented build order
1. Foundation
2. Authentication and onboarding
3. Persistent streamed chat
4. Mentor Mode
5. Interview Mode
6. User-controlled memory
7. Team simulations
8. Progress dashboard
9. Production hardening

The API applies bounded, authenticated per-user limits to expensive AI
operations. The limiter is intentionally in-process for local development;
distributed rate limiting is required before horizontal scale.

## Deferred

- RAG, embeddings, pgvector, vector search, and document retrieval;
- voice;
- GitHub ingestion;
- code execution;
- multiple LLM providers;
- autonomous agents;
- microservices;
- billing and gamification.

## First Codex task
Open `FIRST_CODEX_PROMPT.md` and give that task to Codex.
