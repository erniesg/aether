# social-auto-upload on Modal

Modal deployment of the aether social-auto-upload sidecar.
Covers CJK platforms: TikTok, Douyin, Xiaohongshu (XHS), Bilibili, Kuaishou.

Uses Playwright browser automation under the hood — cookies are the auth mechanism,
so there is a one-time manual login step per platform.

## Prerequisites

- [Modal account](https://modal.com/) + CLI: `pip install modal && modal token new`
- The `aether-sau-secrets` Modal secret created (see below)

## Setup

### 1. Create the Modal secret

```bash
modal secret create aether-sau-secrets \
  SOCIAL_AUTO_UPLOAD_TOKEN=<pick-a-random-token> \
  SAU_DEFAULT_ACCOUNT=<your-account-handle>
```

### 2. Deploy the app

```bash
modal deploy infra/social-auto-upload/modal_app.py
```

Modal prints the ASGI endpoint URL, e.g.:
```
https://erniesg--aether-sau-aether-sau.modal.run
```

### 3. Capture cookies (one-time per platform)

Run each platform interactively from your terminal — Modal streams a headed browser session.

```bash
modal run infra/social-auto-upload/modal_app.py::capture_cookies --platform xhs
modal run infra/social-auto-upload/modal_app.py::capture_cookies --platform tiktok
modal run infra/social-auto-upload/modal_app.py::capture_cookies --platform douyin
modal run infra/social-auto-upload/modal_app.py::capture_cookies --platform bilibili
modal run infra/social-auto-upload/modal_app.py::capture_cookies --platform kuaishou
```

Log in normally in the browser window that opens. Close the window when done.
Cookies are saved to the `sau-browser` Modal Volume and reused on every publish.

### 4. Wire to Cloudflare Workers staging

```bash
wrangler secret put SOCIAL_AUTO_UPLOAD_URL --env staging
# paste: https://erniesg--aether-sau-aether-sau.modal.run

wrangler secret put SOCIAL_AUTO_UPLOAD_TOKEN --env staging
# paste: the token you chose in step 1
```

## Architecture

```
aether (Next.js / CF Workers)
    │  HTTP POST /v1/posts
    ▼
Modal ASGI endpoint  (modal_app.py::web)
    │  writes job to sau-state Volume
    ▼
poll_and_publish()   (runs every 30 s via modal.Period)
    │  reads due jobs, calls sau CLI
    ▼
Playwright Chromium  (cookies from sau-browser Volume)
    │
    ▼
TikTok / Douyin / XHS / Bilibili / Kuaishou
```

## Files

| File | Purpose |
|---|---|
| `modal_app.py` | Modal App: ASGI endpoint + scheduler + cookie capture |
| `pyproject.toml` | Python deps used by the Modal image build |
| `README.md` | This file |

## Troubleshooting

- **`SOCIAL_AUTO_UPLOAD_TOKEN not set`** — the `aether-sau-secrets` Modal secret is missing or the secret name doesn't match `SECRET_NAME` in `modal_app.py`.
- **Publish fails with screenshot** — check the `sau-state` Volume under `/data/artifacts/<job_id>/`. Failure screenshots and `failure.json` are written there.
- **Cookies expired** — re-run the `capture_cookies` function for the affected platform.
- **Cold-start latency** — first request after idle takes ~15 s while Chromium initialises. Subsequent requests within the same container are fast.
