# Infrastructure

Deployment and environment-specific infrastructure files will live here.

The repository now contains first-deployment preparation for the approved
development/staging/production topology:

- a Vercel-compatible Next.js app;
- a container-ready FastAPI app;
- local PostgreSQL through Docker Compose.
- Render deployment instructions and the API production Dockerfile.

Read [DEPLOYMENT.md](DEPLOYMENT.md) before creating platform resources. The
repository does not contain platform credentials, provision resources, or
claim that production backups and secrets have been configured.

The current API rate limiter is also process-local. A distributed limiter must
be selected before deploying multiple API instances.
