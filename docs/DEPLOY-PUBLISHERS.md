# Publisher Hosting — Ops Checklist

Adapter code ships in PR #84 (`codex/finish-expansion-wave`). This document covers the manual hosting steps needed to make those adapters reach real platforms.

**Time estimate: 3–4 hours for a first-time setup. Each platform OAuth app adds ~15 min.**

---

## Prerequisites

- [ ] `gcloud` CLI installed: `brew install --cask google-cloud-sdk` (macOS)
- [ ] `modal` CLI installed: `pip install modal`
- [ ] `wrangler` CLI installed: already in repo devDeps — `npx wrangler`
- [ ] GCP project with billing enabled
- [ ] [Upstash](https://upstash.com/) account (free tier)
- [ ] Modal account: `modal token new` (authenticates your terminal)
- [ ] Existing Anthropic + Cloudflare accounts (aether infra already live)

---

## Part 1 — Postiz on Cloud Run (Western platforms)

Postiz covers: Instagram, Facebook, X (Twitter), LinkedIn, TikTok, Pinterest, YouTube Shorts.

### 1.1 GCP project setup

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

### 1.2 Provision Cloud SQL Postgres

`deploy.sh` does this for you:

- creates the `postiz-pg` instance (POSTGRES_16, `db-f1-micro`)
- creates the `postiz` database
- creates the `postiz` SQL user with a freshly generated password
- builds `DATABASE_URL` (Cloud SQL proxy format) from that password and pushes it to Secret Manager
- on re-runs: rotates the password and updates the secret (idempotent)

You do NOT set `DATABASE_URL` in `.env.postiz`. Just provide `GCLOUD_PROJECT` and `GCLOUD_REGION` and the script handles the rest.

### 1.3 Provision Upstash Redis

1. Log in at https://console.upstash.com/
2. Create a new Redis database (free tier, region closest to your Cloud Run region)
3. Copy the `rediss://` connection URL from the database page
4. Paste into `.env.postiz` as `REDIS_URL`

### 1.4 Create OAuth apps per platform

Each platform requires you to create a developer app and get a `client_id` + `client_secret` pair. The **redirect URI** for all of them will be `https://YOUR_POSTIZ_URL/integrations/social/callback` — you'll fill in the real URL after the first deploy.

| Platform | Developer Console | Notes |
|---|---|---|
| Instagram + Facebook | https://developers.facebook.com/ | One Meta app covers both. Enable `instagram_basic`, `instagram_content_publish`, `pages_manage_posts`. Set redirect URI for both ig and fb. |
| X (Twitter) | https://developer.x.com/ | Create an app with OAuth 2.0. Need `tweet.write`, `users.read`. |
| LinkedIn | https://developer.linkedin.com/ | Products: "Share on LinkedIn", "Sign In with LinkedIn". |
| TikTok | https://developers.tiktok.com/ | Create a "Content Posting API" app. Sandbox mode works for testing. |
| Pinterest | https://developers.pinterest.com/ | Standard access tier is sufficient. Need `boards:read`, `pins:write`. |
| YouTube | https://console.cloud.google.com/ | Enable YouTube Data API v3. OAuth scope: `https://www.googleapis.com/auth/youtube.upload`. |

Paste `client_id` / `client_secret` pairs into `.env.postiz`.

### 1.5 Run deploy.sh

```bash
cp infra/postiz/.env.postiz.example infra/postiz/.env.postiz
# fill in all values
bash infra/postiz/deploy.sh --dry-run   # review first
bash infra/postiz/deploy.sh
```

The script outputs the Cloud Run URL. Copy it.

### 1.6 Run database migrations

The deploy script prints this command. Run it once:

```bash
gcloud run jobs create postiz-migrate \
  --image=ghcr.io/gitroomhq/postiz-app:latest \
  --region=asia-southeast1 \
  --command=npx,prisma,migrate,deploy \
  --set-secrets=DATABASE_URL=postiz-database-url:latest

gcloud run jobs execute postiz-migrate --region=asia-southeast1 --wait
```

### 1.7 Update BACKEND_INTERNAL_URL

Open `.env.postiz`, set `BACKEND_INTERNAL_URL` to the Cloud Run URL from step 1.5, then re-run deploy.sh to push the updated secret:

```bash
bash infra/postiz/deploy.sh
```

Also update the redirect URIs in each OAuth app's developer console to point to the real Cloud Run URL.

### 1.8 Connect platforms in Postiz UI

1. Open the Postiz URL in a browser
2. Create an admin account
3. Go to **Settings → Integrations**
4. Connect each platform using the "Connect" button — this kicks off the OAuth flow
5. Note the integration ID shown in the UI for each connected platform (you'll need these next)

### 1.9 Get Postiz API key

Settings → API Keys → Create → copy the key.

### 1.10 Wire secrets to Cloudflare Workers staging

```bash
# Base URL and key
wrangler secret put POSTIZ_API_URL --env staging
# paste: https://YOUR_POSTIZ_CLOUD_RUN_URL/public/v1

wrangler secret put POSTIZ_API_KEY --env staging
# paste: your Postiz API key

# Per-platform integration IDs from Postiz UI (Settings → Integrations)
wrangler secret put POSTIZ_INTEGRATION_INSTAGRAM --env staging
wrangler secret put POSTIZ_INTEGRATION_TIKTOK --env staging
wrangler secret put POSTIZ_INTEGRATION_X --env staging
wrangler secret put POSTIZ_INTEGRATION_LINKEDIN --env staging
wrangler secret put POSTIZ_INTEGRATION_YOUTUBE_SHORTS --env staging
wrangler secret put POSTIZ_INTEGRATION_PINTEREST --env staging

# Optional Pinterest board/link
wrangler secret put POSTIZ_PINTEREST_BOARD_ID --env staging
wrangler secret put POSTIZ_PINTEREST_LINK_URL --env staging
```

Repeat with `--env production` when ready to go live.

---

## Part 2 — social-auto-upload on Modal (CJK platforms)

Covers: TikTok (CN Playwright path), Douyin, Xiaohongshu (XHS), Bilibili, Kuaishou.

### 2.1 Authenticate Modal CLI

```bash
modal token new
# Follow the browser prompt
```

### 2.2 Create Modal secret

```bash
modal secret create aether-sau-secrets \
  SOCIAL_AUTO_UPLOAD_TOKEN=$(openssl rand -hex 32) \
  SAU_DEFAULT_ACCOUNT=YOUR_ACCOUNT_HANDLE
```

Save the token value somewhere safe — you'll need it for `wrangler secret put`.

### 2.3 Deploy the app

```bash
modal deploy infra/social-auto-upload/modal_app.py
```

Modal prints the ASGI endpoint URL. Copy it.

### 2.4 Capture cookies (one-time per platform)

Run each platform interactively. Modal opens a real browser window on your machine.

```bash
modal run infra/social-auto-upload/modal_app.py::capture_cookies --platform xhs
modal run infra/social-auto-upload/modal_app.py::capture_cookies --platform tiktok
modal run infra/social-auto-upload/modal_app.py::capture_cookies --platform douyin
modal run infra/social-auto-upload/modal_app.py::capture_cookies --platform bilibili
modal run infra/social-auto-upload/modal_app.py::capture_cookies --platform kuaishou
```

For each: log in normally in the browser, then close the window. Cookies are saved to the `sau-browser` Modal Volume automatically.

**Cookie expiry:** Most platforms require re-login every 30–90 days. Re-run the relevant `capture_cookies` call when publishes start failing.

### 2.5 Wire secrets to Cloudflare Workers staging

```bash
wrangler secret put SOCIAL_AUTO_UPLOAD_URL --env staging
# paste: the Modal ASGI endpoint URL from step 2.3

wrangler secret put SOCIAL_AUTO_UPLOAD_TOKEN --env staging
# paste: the SOCIAL_AUTO_UPLOAD_TOKEN from step 2.2
```

---

## Part 3 — Verify end-to-end

### 3.1 Check Postiz health

```bash
curl https://YOUR_POSTIZ_URL/api/status
# Expect: {"status":"ok"} or similar
```

### 3.2 Check social-auto-upload health

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://YOUR_MODAL_URL/healthz
# Expect: {"status":"ok"}
```

### 3.3 Test a draft publish from aether

In the aether workspace, use the publish rail to schedule a post for 1 minute in the future on a test account. Check the Postiz dashboard / Modal logs to confirm the job ran.

---

## Environment variable summary

All of these should be set as `wrangler secret put --env staging` and `--env production`:

| Variable | Source |
|---|---|
| `POSTIZ_API_URL` | Cloud Run URL + `/public/v1` |
| `POSTIZ_API_KEY` | Postiz Settings → API Keys |
| `POSTIZ_INTEGRATION_INSTAGRAM` | Postiz UI integration ID |
| `POSTIZ_INTEGRATION_TIKTOK` | Postiz UI integration ID |
| `POSTIZ_INTEGRATION_X` | Postiz UI integration ID |
| `POSTIZ_INTEGRATION_LINKEDIN` | Postiz UI integration ID |
| `POSTIZ_INTEGRATION_YOUTUBE_SHORTS` | Postiz UI integration ID |
| `POSTIZ_INTEGRATION_PINTEREST` | Postiz UI integration ID |
| `POSTIZ_PINTEREST_BOARD_ID` | Pinterest board ID (optional) |
| `POSTIZ_PINTEREST_LINK_URL` | Pinterest link URL (optional) |
| `SOCIAL_AUTO_UPLOAD_URL` | Modal ASGI endpoint URL |
| `SOCIAL_AUTO_UPLOAD_TOKEN` | Token from `modal secret create` |

`.dev.vars` additions for local development: add `MODAL_APP_URL` and `MODAL_APP_TOKEN` if you want to test against Modal from a local Next.js dev server.

---

## Troubleshooting

**Cloud Run cold start > 30 s** — Postiz + Next.js is heavy. Increase `timeoutSeconds` in `service.yaml` or set `--min-instances=1` in `deploy.sh` (adds ~$7/month).

**Postiz OAuth redirect loop** — `BACKEND_INTERNAL_URL` / `FRONTEND_URL` don't match the actual Cloud Run URL. Update the secret and re-deploy.

**Modal publish fails, screenshot available** — fetch artifact from the `sau-state` Volume: `modal volume get sau-state /data/artifacts/JOB_ID/`.

**Cookies expired (CJK platforms)** — re-run `modal run ... ::capture_cookies --platform PLATFORM`.

**`wrangler secret put` complains about worker not existing** — deploy to staging first: `npm run deploy:stg`.
