# Postiz on Cloud Run

Self-hosted [Postiz](https://github.com/gitroomhq/postiz-app) for aether's distribution rail.
Covers Western platforms: Instagram, Facebook, X (Twitter), LinkedIn, TikTok, Pinterest, YouTube Shorts.

## Prerequisites

- `gcloud` CLI installed and authenticated (`gcloud auth login`)
- A GCP project with billing enabled
- An [Upstash](https://upstash.com/) account for Redis (free tier is enough for hackathon scale)

## Quickstart

```bash
cp infra/postiz/.env.postiz.example infra/postiz/.env.postiz
# fill in .env.postiz — see comments in the file
bash infra/postiz/deploy.sh --dry-run   # preview
bash infra/postiz/deploy.sh             # execute
```

The script:
1. Enables Cloud Run, Cloud SQL, and Secret Manager APIs.
2. Creates a `db-f1-micro` Cloud SQL Postgres 16 instance (`postiz-pg`).
3. Creates a `postiz-runner` service account with the minimum required roles.
4. Pushes every secret from `.env.postiz` to Secret Manager.
5. Deploys the official `ghcr.io/gitroomhq/postiz-app:latest` image to Cloud Run.

After deploy, run the database migration job (printed by the script) and connect your social platforms inside the Postiz UI.

## Files

| File | Purpose |
|---|---|
| `deploy.sh` | Idempotent deploy script — safe to re-run |
| `service.yaml` | Cloud Run service template (reference; `deploy.sh` uses `gcloud run deploy` flags) |
| `cloudbuild.yaml` | Optional Cloud Build trigger for weekly Postiz upstream upgrades |
| `.env.postiz.example` | Template for secrets — copy to `.env.postiz` and fill in |

## Cost estimate (hackathon scale)

| Component | Monthly cost |
|---|---|
| Cloud Run (min=0, ~10 req/day) | ~$0 |
| Cloud SQL db-f1-micro | ~$7 |
| Upstash Redis (free tier) | $0 |
| Secret Manager | ~$0 |
| **Total** | **~$7/month** |
