# AI Provider Architecture

DevStride uses one backend-only AI provider boundary. Product routes and mode
services depend on the internal `AIProvider` protocol; the OpenAI adapter is the
only current implementation.

## Interface

The provider supports:

- complete text generation;
- streamed text deltas followed by generation metadata;
- structured generation validated into a supplied Pydantic model.

Provider input uses internal role/content messages. Results can include text,
provider name, model name, input/output token counts, latency, and provider
response ID. The backend decides what metadata is persisted on assistant
messages; clients cannot submit it.

## OpenAI adapter

`apps/api/app/ai/openai_provider.py` uses the OpenAI Responses API with:

- the backend-only `OPENAI_API_KEY`;
- backend-controlled `OPENAI_MODEL` (default `gpt-4.1-mini`);
- a 30-second provider request timeout;
- `response.output_text.delta` for streaming text;
- `response.completed` for final usage/model/response metadata;
- generic logged exception types rather than raw provider responses or secrets.

When `AI_GENERATION_ENABLED=false`, the provider dependency returns no active
provider and generation routes fail safely without paid model calls.

## Prompt ownership

Versioned prompts live in backend feature modules:

- `app/ai/prompts.py` — General
- `app/mentor/prompts.py` — Mentor
- `app/interviews/prompts.py` — Interview
- `app/team/prompts.py` — Team Practice
- `app/session_summaries/prompts.py` — structured summaries
- `app/memory/prompts.py` — conservative memory candidate extraction

Routes do not accept system prompts, prompt versions, model names, or provider
selection. Profile fields and saved memory are contextual data, not trusted
instructions. General mode receives no memory. Mentor, Interview, and Team can
receive at most six active memories; the prompt states that current explicit
user input has higher priority than saved context.

## Persistence

Normal complete/stream generation persists the user message before provider
completion. A successful result persists one assistant message with available
provider metadata. Provider failure or cancellation keeps the user message and
does not create a partial assistant row. Retry reuses that user row.

Interview and Team kickoff generate a first assistant message without a fake
user message. Database row locking and conversation metadata make kickoff
idempotent and expose pending lifecycle events to concurrent callers.

Structured summaries are one per supported conversation. After summary
persistence, bounded memory extraction is attempted as a non-fatal secondary
step. Extraction failures do not invalidate an already-created summary.

## Rate limiting

Authenticated AI operations are limited per user and operation. Normal
respond/stream/retry operations use `AI_RATE_LIMIT_REQUESTS`; kickoffs and
summaries use their own request limits over the shared configured window.
Exhausted limits return HTTP 429 and `Retry-After`.

The implementation is process-local. Production must remain at one API instance
until the limiter is replaced by distributed storage. The abstraction is kept
small so that change does not require provider or route redesign.

## Security and privacy

- OpenAI keys never use a `NEXT_PUBLIC_*` name and never enter frontend bundles.
- Service-role credentials and signing keys are not required.
- Logs omit keys, bearer tokens, raw provider responses, and hidden prompts.
- Memory extraction rejects weak candidates and supported secret-like content.
- Model output is rendered as Markdown without enabling arbitrary raw HTML.

No second provider, agent framework, RAG, embedding, or vector-search layer is
implemented.
