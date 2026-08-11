# Data Model

DevStride uses PostgreSQL through SQLAlchemy 2 typed declarative models,
`asyncpg`, and async sessions. Alembic owns schema evolution. The repository
migration head is `0005`.

User ownership UUIDs correspond to the verified Supabase JWT `sub`. DevStride
does not maintain a local users table or accept ownership IDs from product
request bodies.

## Relationship overview

```text
Supabase user UUID
  ├── 0..1 profiles
  ├── 0..* conversations
  │       ├── 0..* messages
  │       └── 0..1 session_summaries
  └── 0..* memory_records
```

Only conversation-to-message and conversation-to-summary relationships are
database foreign keys. User UUID fields are indexed ownership references to
Supabase Auth.

## `profiles`

One coaching profile per authenticated user.

| Column | Type/constraints |
| --- | --- |
| `id` | UUID primary key |
| `user_id` | UUID, not null, unique, indexed |
| `display_name` | string(100), not null |
| `current_level` | string, not null; allowed values validated by API schema |
| `target_role` | string, not null; allowed values validated by API schema |
| `preferred_stack` | JSON array, not null |
| `communication_goal` | string, not null; allowed values validated by API schema |
| `feedback_preference` | string, not null; allowed values validated by API schema |
| `onboarding_completed` | boolean, not null, default false |
| `created_at`, `updated_at` | timezone-aware timestamps, database default `now()` |

The unique constraint `uq_profiles_user_id` is the database-level duplicate
onboarding boundary.

## `conversations`

| Column | Type/constraints |
| --- | --- |
| `id` | UUID primary key |
| `user_id` | UUID, not null, indexed |
| `title` | string(200), not null |
| `mode` | string, not null, default `general` |
| `persona` | nullable string |
| `status` | string, not null, default `active` |
| `metadata` | JSON object, not null, default `{}` |
| `created_at`, `updated_at` | timezone-aware timestamps |

Indexes cover `user_id` and `updated_at`. The API constrains mode to `general`,
`mentor`, `interview`, or `team`; mode-specific configuration and kickoff/end
state live in backend-controlled metadata.

## `messages`

| Column | Type/constraints |
| --- | --- |
| `id` | UUID primary key |
| `conversation_id` | UUID foreign key to `conversations.id`, not null, indexed, `ON DELETE CASCADE` |
| `role` | string, not null |
| `content` | text, not null |
| `provider`, `model` | nullable strings |
| `input_tokens`, `output_tokens`, `latency_ms` | nullable integers |
| `metadata` | JSON object, not null, default `{}` |
| `created_at` | timezone-aware timestamp |

Indexes cover `conversation_id` and `(conversation_id, created_at)`. Product
requests can create only user content. Assistant role and provider metadata are
written by backend generation flows. Deleting a conversation deletes its
messages.

## `session_summaries`

One structured summary per Mentor, Interview, or Team conversation.

| Column | Type/constraints |
| --- | --- |
| `id` | UUID primary key |
| `conversation_id` | UUID foreign key to `conversations.id`, unique, not null, `ON DELETE CASCADE` |
| `user_id` | UUID, not null, indexed |
| `session_mode` | `mentor`, `interview`, or `team` check constraint |
| `summary` | text, not null |
| `topics_covered`, `strengths`, `weaknesses`, `recommended_next_steps` | JSON arrays, not null |
| `concepts_practiced`, `exercises_completed` | nullable JSON arrays |
| four practice ratings | nullable integers constrained to 1–5 |
| `created_at`, `updated_at` | timezone-aware timestamps |

The unique conversation constraint makes summary generation idempotent. Deleting
the conversation deletes its summary. Migration `0005` extends the supported
mode check from Mentor/Interview to Mentor/Interview/Team.

## `memory_records`

| Column | Type/constraints |
| --- | --- |
| `id` | UUID primary key |
| `user_id` | UUID, not null, indexed |
| `category` | string(32), approved-category check constraint |
| `content` | non-blank text check constraint |
| `importance` | integer 1–5, default 3 |
| `confidence` | float 0–1, default 0.8 |
| `source_type` | string(32), not null |
| `source_id` | nullable UUID |
| `status` | `active` or `archived`, default `active` |
| `last_reinforced_at` | nullable timezone-aware timestamp |
| `reinforcement_count` | integer, default 0 |
| `created_at`, `updated_at` | timezone-aware timestamps |

Approved categories are `goal`, `preference`, `project`, `skill`, `weakness`,
and `achievement`. Deleting through the API archives a record; active retrieval
does not return archived rows. `source_id` is intentionally not a foreign key,
so deleting a source conversation/summary does not implicitly delete a
user-controlled memory record.

Equivalent active content for the same user/category is detected in the
repository and reinforced at the application boundary. There is no database
unique constraint for normalized memory content.

## Migrations

| Revision | Purpose |
| --- | --- |
| `0001_create_profiles` | profiles |
| `0002` | conversations and messages |
| `0003` | Mentor/Interview session summaries |
| `0004` | bounded memory records |
| `0005` | allow Team session summaries |

Run `make api-migrate` to upgrade the configured database. Integration tests use
`TEST_DATABASE_URL`, upgrade to head, clean between tests, and downgrade to base
at fixture shutdown. See [Environment](../operations/ENVIRONMENT.md).
