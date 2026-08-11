# Prompts

Versioned production prompts currently live with their backend feature modules:

- `apps/api/app/ai/prompts.py` — General mode
- `apps/api/app/mentor/prompts.py` — Mentor Mode
- `apps/api/app/interviews/prompts.py` — Interview Mode
- `apps/api/app/team/prompts.py` — Team Practice
- `apps/api/app/session_summaries/prompts.py` — structured summaries
- `apps/api/app/memory/prompts.py` — bounded memory candidate extraction

This package is intentionally empty. Moving prompts into a shared package would
require a concrete cross-application consumer and an architecture decision.
System prompts, provider/model controls, and hidden instructions must remain
backend-only and must never be client-controlled.
