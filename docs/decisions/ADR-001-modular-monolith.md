# ADR-001: Use a Modular Monolith

- Status: Accepted
- Date: 2026-07-29

## Context
DevStride needs authentication, conversations, interviews, simulations,
memory, analytics, and AI orchestration. The product is still pre-MVP and will
be built by a small team using Codex to accelerate implementation.

## Decision
Use one FastAPI deployment organized into clear domain modules.

## Alternatives considered
- Microservices from the beginning.
- Serverless function per feature.
- A single unstructured application module.

## Consequences
Positive:
- simpler local development;
- straightforward deployment;
- easier transactions and debugging;
- fewer infrastructure dependencies;
- clear future extraction boundaries.

Negative:
- module boundaries require discipline;
- the API may eventually need selective service extraction.

## Revisit when
A module needs independent scaling, deployment, reliability, or ownership.
