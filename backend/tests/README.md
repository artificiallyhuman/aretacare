# Backend tests

A small, fast regression suite for the behaviour that is most expensive to get wrong:
care-session isolation, authentication and token handling, admin gating, and request
limits. It runs the real application against a real PostgreSQL (with pgvector) and
makes no calls to OpenAI, S3 or SMTP.

## Run locally

Use a throwaway database, never one with data you care about: importing the app creates
the schema and runs the migrations in whatever `DATABASE_URL` points at.

```bash
# once: start Postgres and create a separate test database
docker compose up -d db
docker compose exec db psql -U aretacare -d aretacare -c "CREATE DATABASE aretacare_test"

# run the suite inside the backend image (system packages and Python deps already there)
docker compose run --rm --no-deps \
  -e DATABASE_URL=postgresql://aretacare:password@db:5432/aretacare_test \
  -e DEBUG=false -e REDIS_URL= \
  backend sh -c "pip install --quiet --user -r requirements-dev.txt && python -m pytest"
```

Fixtures create their own users (`@example.com` addresses) and delete them afterwards.

## CI

`.github/workflows/ci.yml` runs the same suite against a `pgvector/pgvector:pg15`
service container on every pull request and push to `main`.
