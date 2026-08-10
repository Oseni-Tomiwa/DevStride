# Infrastructure

Deployment and environment-specific infrastructure files will live here.

The repository currently provides development infrastructure only:

- a Vercel-compatible Next.js app;
- a container-ready FastAPI app;
- local PostgreSQL through Docker Compose.

No production deployment target, API container image, managed database
configuration, or secret-management integration is selected yet. Choose and
document those operational targets before public deployment; do not infer a
cloud provider from this repository.

The current API rate limiter is also process-local. A distributed limiter must
be selected before deploying multiple API instances.
