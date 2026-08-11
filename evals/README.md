# AI Evaluations

DevStride does not yet contain stable AI evaluation datasets. Current automated
tests use deterministic provider doubles to verify orchestration, persistence,
prompt boundaries, streaming events, summaries, and memory behavior; they do not
score live model quality.

Planned datasets may cover Mentor responses, Interview practice, Team Practice,
summary extraction, and bounded memory candidate quality. Before adding them,
document the rubric, provenance, privacy handling, versioning, and pass/fail
criteria. Do not use production conversations or invent synthetic quality scores
without an approved evaluation design.
