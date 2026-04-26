# Social Auto Upload Sidecar

Issue #57 adds a provider seam for CJK/browser-automation publishing. The Next.js app talks HTTP to this sidecar; the sidecar runs `dreammis/social-auto-upload` / `sau` in a Python process where Playwright can own a browser profile.

## HTTP contract

- `POST /v1/posts` schedules a job.
- `GET /v1/posts?workspaceId=<id>` lists non-cancelled jobs for a workspace.
- `DELETE /v1/posts/:id` cancels a job.
- Auth is `Authorization: Bearer $SOCIAL_AUTO_UPLOAD_TOKEN`.

`POST /v1/posts` body:

```json
{
  "workspaceId": "ws_123",
  "platform": "xiaohongshu",
  "accountId": "creator-main",
  "mediaUrls": ["https://cdn.example/hero.mp4"],
  "caption": "hero drop",
  "hashtags": ["aether"],
  "scheduledAt": "2026-05-02T09:30:00.000Z",
  "screenshotOnFailure": true
}
```

Supported sidecar platform ids: `tiktok`, `douyin`, `xiaohongshu`, `bilibili`, `kuaishou`.

## Run

```bash
cd sidecars/social-auto-upload
uv venv
uv pip install fastapi uvicorn pydantic social-auto-upload
SOCIAL_AUTO_UPLOAD_TOKEN=... uvicorn server:app --host 0.0.0.0 --port 8891
```

If `social-auto-upload` is installed from a checkout instead of a package, set `SAU_BIN` to the local CLI path. The current tested surface is the 2026-03/2026-04 refactor line documented by `dreammis/social-auto-upload`: `sau douyin`, `sau xiaohongshu`, `sau kuaishou`, and `sau bilibili` CLI entries.

## Failure Artifacts

Set `SAU_SCREENSHOT_DIR` to the browser automation screenshot directory used by the upstream CLI. On failure, the sidecar copies the newest `.png` into `SAU_ARTIFACT_DIR/<jobId>/` and writes `failure.json`. This keeps Discord review artifacts diagnosable without exposing raw browser traces in the creator UI.
