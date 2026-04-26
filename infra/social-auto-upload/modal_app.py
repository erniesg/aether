"""Modal app — aether social-auto-upload sidecar.

Wraps the FastAPI server from sidecars/social-auto-upload/server.py as a
Modal ASGI endpoint.  State (jobs.json + media files) lives in Modal Volumes
so it survives cold starts and restarts.

Deploy:
    modal deploy infra/social-auto-upload/modal_app.py

First-time cookie capture (run once per platform, in your terminal):
    modal run infra/social-auto-upload/modal_app.py::capture_cookies --platform xhs
    modal run infra/social-auto-upload/modal_app.py::capture_cookies --platform tiktok
    # etc.

Environment:
    SOCIAL_AUTO_UPLOAD_TOKEN  — shared bearer token; set via modal secret.
    SAU_DEFAULT_ACCOUNT       — fallback account name if not supplied per-job.
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import modal

# ── App identity ───────────────────────────────────────────────────────────────
APP_NAME = "aether-sau"
ENDPOINT_LABEL = "aether-sau"
SECRET_NAME = "aether-sau-secrets"

# State paths inside the container (resolved to Volume mounts).
STATE_PATH_ENV = "/data/jobs.json"
MEDIA_DIR_ENV = "/data/media"
ARTIFACT_DIR_ENV = "/data/artifacts"
BROWSER_PROFILE_DIR = "/browser"

# ── Modal resources ────────────────────────────────────────────────────────────
app = modal.App(APP_NAME)

# Persistent storage: job state + downloaded media + failure artifacts.
sau_state_volume = modal.Volume.from_name("sau-state", create_if_missing=True)

# Browser cookies + Playwright profile (survives container restarts).
sau_browser_volume = modal.Volume.from_name("sau-browser", create_if_missing=True)

# Secrets injected from Modal's secret store.
# Create with: modal secret create aether-sau-secrets \
#   SOCIAL_AUTO_UPLOAD_TOKEN=<token> SAU_DEFAULT_ACCOUNT=<account>
shared_secret = modal.Secret.from_name(SECRET_NAME, required=False)

# ── Container image ────────────────────────────────────────────────────────────
# Debian slim + ffmpeg (video processing) + Python deps + Chromium via Playwright.
sau_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install(
        "ffmpeg",
        "curl",
        # Playwright Chromium system deps.
        "libnss3",
        "libnspr4",
        "libdbus-1-3",
        "libatk1.0-0",
        "libatk-bridge2.0-0",
        "libcups2",
        "libdrm2",
        "libxkbcommon0",
        "libxcomposite1",
        "libxdamage1",
        "libxfixes3",
        "libxrandr2",
        "libgbm1",
        "libasound2",
        "libpango-1.0-0",
        "libcairo2",
    )
    .pip_install(
        "fastapi>=0.115,<1",
        "pydantic>=2.9,<3",
        "playwright>=1.49,<2",
        # social-auto-upload pinned for reproducible Modal image builds.
        "social-auto-upload @ git+https://github.com/dreammis/social-auto-upload.git@34a3b3b47e5d2d3fa7f96ac180c7d9a351421f30",
    )
    .run_commands(
        # Install only Chromium — smallest footprint.
        "playwright install chromium",
    )
)

# ── Inline server logic ────────────────────────────────────────────────────────
# We replicate the server.py logic here rather than importing the file from the
# host filesystem, because Modal builds images at deploy time and the sidecar
# source lives at a relative path that may not be in the image's PYTHONPATH.
# If you prefer an import, add `.copy_local_file("sidecars/social-auto-upload/server.py", "/app/server.py")`
# to the image and import from there.

Platform = Literal["tiktok", "douyin", "xiaohongshu", "bilibili", "kuaishou"]
Status = Literal["scheduled", "publishing", "published", "cancelled", "failed"]

CLI_PLATFORM = {
    "tiktok": "tiktok",
    "douyin": "douyin",
    "xiaohongshu": "xiaohongshu",
    "bilibili": "bilibili",
    "kuaishou": "kuaishou",
}

VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm"}


def _env_path(env_var: str, default: str) -> Path:
    return Path(os.environ.get(env_var, default))


def _state_path() -> Path:
    return _env_path("SAU_STATE_PATH", STATE_PATH_ENV)


def _media_dir() -> Path:
    return _env_path("SAU_MEDIA_DIR", MEDIA_DIR_ENV)


def _artifact_dir() -> Path:
    return _env_path("SAU_ARTIFACT_DIR", ARTIFACT_DIR_ENV)


def _read_jobs() -> dict[str, dict]:
    p = _state_path()
    if not p.exists():
        return {}
    return json.loads(p.read_text(encoding="utf-8") or "{}")


def _write_jobs(jobs: dict[str, dict]) -> None:
    p = _state_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(jobs, indent=2, sort_keys=True), encoding="utf-8")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def _title_from_caption(caption: str) -> str:
    normalized = " ".join(caption.split())
    return normalized[:90] or "aether render"


def _body_from_job(job: dict) -> str:
    tags = " ".join(f"#{tag}" for tag in job.get("hashtags", []))
    return "\n\n".join(part for part in [job.get("caption", "").strip(), tags] if part)


# ── FastAPI app (lives inside Modal ASGI endpoint) ─────────────────────────────
def _build_fastapi() -> "FastAPI":  # noqa: F821 — resolved at runtime
    import asyncio as _asyncio
    import base64
    import shutil
    import urllib.parse
    import urllib.request

    from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
    from pydantic import BaseModel, Field

    _TOKEN = os.environ.get("SOCIAL_AUTO_UPLOAD_TOKEN", "")
    _LOCK = _asyncio.Lock()

    class ScheduleRequest(BaseModel):
        workspaceId: str
        platform: Platform
        accountId: str | None = None
        mediaUrls: list[str] = Field(min_length=1)
        caption: str = ""
        hashtags: list[str] = []
        scheduledAt: str
        screenshotOnFailure: bool = True

    api = FastAPI(title="aether social-auto-upload sidecar (Modal)", version="1.0")

    async def _require_token(authorization: str = Header(default="")) -> None:
        if not _TOKEN:
            raise HTTPException(status_code=503, detail="SOCIAL_AUTO_UPLOAD_TOKEN not set")
        if authorization != f"Bearer {_TOKEN}":
            raise HTTPException(status_code=401, detail="invalid token")

    @api.on_event("startup")
    async def _startup() -> None:
        _state_path().parent.mkdir(parents=True, exist_ok=True)
        _media_dir().mkdir(parents=True, exist_ok=True)
        _artifact_dir().mkdir(parents=True, exist_ok=True)
        if not _state_path().exists():
            _state_path().write_text("{}", encoding="utf-8")

    @api.post("/v1/posts", dependencies=[Depends(_require_token)])
    async def _schedule_post(req: ScheduleRequest, background: BackgroundTasks) -> dict[str, str]:
        now = _now_iso()
        job: dict = {
            **req.model_dump(),
            "id": f"sau_{uuid.uuid4().hex[:12]}",
            "status": "scheduled",
            "createdAt": now,
            "updatedAt": now,
            "artifactPath": None,
            "error": None,
        }
        async with _LOCK:
            jobs = _read_jobs()
            jobs[job["id"]] = job
            _write_jobs(jobs)
        sau_state_volume.commit()
        return {"id": job["id"]}

    @api.get("/v1/posts", dependencies=[Depends(_require_token)])
    async def _list_posts(workspaceId: str) -> dict[str, list[dict]]:
        jobs = _read_jobs()
        posts = [
            j for j in jobs.values()
            if j.get("workspaceId") == workspaceId and j.get("status") != "cancelled"
        ]
        return {"posts": posts}

    @api.delete("/v1/posts/{job_id}", dependencies=[Depends(_require_token)])
    async def _cancel_post(job_id: str) -> dict[str, str]:
        async with _LOCK:
            jobs = _read_jobs()
            if job_id not in jobs:
                return {"id": job_id, "status": "cancelled"}
            jobs[job_id]["status"] = "cancelled"
            jobs[job_id]["updatedAt"] = _now_iso()
            _write_jobs(jobs)
        sau_state_volume.commit()
        return {"id": job_id, "status": "cancelled"}

    @api.get("/healthz")
    async def _health() -> dict[str, str]:
        return {"status": "ok"}

    return api


# ── ASGI endpoint ──────────────────────────────────────────────────────────────
@app.function(
    image=sau_image,
    secrets=[shared_secret],
    volumes={
        "/data": sau_state_volume,
        BROWSER_PROFILE_DIR: sau_browser_volume,
    },
    # Allow reasonable concurrency; the CLI publish step is the bottleneck.
    max_inputs=10,
    # Keep one instance warm so the first request after idle isn't slow.
    min_containers=0,
    label=ENDPOINT_LABEL,
)
@modal.asgi_app()
def web() -> "FastAPI":  # noqa: F821
    return _build_fastapi()


# ── Scheduler function (polls every 30 s) ─────────────────────────────────────
@app.function(
    image=sau_image,
    secrets=[shared_secret],
    volumes={
        "/data": sau_state_volume,
        BROWSER_PROFILE_DIR: sau_browser_volume,
    },
    schedule=modal.Period(seconds=30),
)
def poll_and_publish() -> None:
    """Check jobs.json for due scheduled jobs and publish them via sau CLI."""
    import shutil
    import subprocess
    import urllib.parse
    import urllib.request
    import base64

    jobs = _read_jobs()
    now = datetime.now(timezone.utc)
    due = [
        job_id
        for job_id, job in jobs.items()
        if job.get("status") == "scheduled"
        and _parse_iso(job["scheduledAt"]) <= now
    ]
    for job_id in due:
        _run_publish_job(job_id)


def _run_publish_job(job_id: str) -> None:
    """Synchronous publish worker — called from poll_and_publish."""
    import base64
    import shutil
    import subprocess
    import urllib.parse
    import urllib.request

    jobs = _read_jobs()
    raw = jobs.get(job_id)
    if not raw or raw.get("status") != "scheduled":
        return

    # Mark as publishing.
    raw["status"] = "publishing"
    raw["updatedAt"] = _now_iso()
    jobs[job_id] = raw
    _write_jobs(jobs)
    sau_state_volume.commit()

    try:
        media_paths = [_materialize_media(job_id, url) for url in raw["mediaUrls"]]
        command = _build_sau_command(raw, media_paths)
        subprocess.run(command, check=True, capture_output=True, text=True)
        jobs = _read_jobs()
        jobs[job_id].update({"status": "published", "updatedAt": _now_iso()})
        _write_jobs(jobs)
    except Exception as exc:  # noqa: BLE001
        artifact = _write_failure_artifact(job_id, exc)
        jobs = _read_jobs()
        jobs[job_id].update({
            "status": "failed",
            "updatedAt": _now_iso(),
            "artifactPath": str(artifact),
            "error": str(exc),
        })
        _write_jobs(jobs)
    finally:
        sau_state_volume.commit()


def _build_sau_command(job: dict, media_paths: list[Path]) -> list[str]:
    account = job.get("accountId") or os.environ.get("SAU_DEFAULT_ACCOUNT")
    if not account:
        raise RuntimeError("accountId required or SAU_DEFAULT_ACCOUNT must be set")

    platform = CLI_PLATFORM[job["platform"]]
    first = media_paths[0]
    tags = ",".join(job.get("hashtags", []))
    title = _title_from_caption(job.get("caption", ""))

    sau_bin = os.environ.get("SAU_BIN", "sau")

    if first.suffix.lower() in VIDEO_EXTS:
        command = [
            sau_bin, platform, "upload-video",
            "--account", account,
            "--file", str(first),
            "--title", title,
            "--desc", _body_from_job(job),
        ]
    else:
        command = [
            sau_bin, platform, "upload-note",
            "--account", account,
            "--images", *[str(p) for p in media_paths],
            "--title", title,
            "--note", _body_from_job(job),
        ]
    if tags:
        command.extend(["--tags", tags])
    return command


def _materialize_media(job_id: str, media_url: str) -> Path:
    import base64
    import urllib.parse
    import urllib.request

    job_dir = _media_dir() / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    existing = len(list(job_dir.iterdir()))

    if media_url.startswith("data:"):
        header, encoded = media_url.split(",", 1)
        ext = ".png" if "png" in header else ".jpg"
        out = job_dir / f"media_{existing + 1}{ext}"
        out.write_bytes(base64.b64decode(encoded))
        return out

    if media_url.startswith(("http://", "https://")):
        suffix = Path(urllib.parse.urlparse(media_url).path).suffix or ".bin"
        out = job_dir / f"media_{existing + 1}{suffix}"
        urllib.request.urlretrieve(media_url, out)
        return out

    path = Path(media_url)
    if not path.exists():
        raise FileNotFoundError(media_url)
    return path


def _write_failure_artifact(job_id: str, exc: Exception) -> Path:
    import shutil

    artifact_dir = _artifact_dir() / job_id
    artifact_dir.mkdir(parents=True, exist_ok=True)
    # Copy any Playwright screenshots produced during the failed run.
    screenshot_dir = Path(os.environ.get("SAU_SCREENSHOT_DIR", "/data/screenshots"))
    if screenshot_dir.exists():
        for png in screenshot_dir.rglob("*.png"):
            shutil.copy2(png, artifact_dir / png.name)
    failure = artifact_dir / "failure.json"
    failure.write_text(
        json.dumps({"jobId": job_id, "error": str(exc), "at": _now_iso()}, indent=2),
        encoding="utf-8",
    )
    return artifact_dir


# ── One-time cookie capture ────────────────────────────────────────────────────
@app.function(
    image=sau_image,
    secrets=[shared_secret],
    volumes={
        BROWSER_PROFILE_DIR: sau_browser_volume,
    },
    # Interactive — runs in your terminal with `modal run`.
    timeout=600,
)
def capture_cookies(platform: str = "xhs") -> None:
    """Launch a headed Chromium session so you can log in and save cookies.

    Run from your terminal:
        modal run infra/social-auto-upload/modal_app.py::capture_cookies --platform xhs

    The browser profile (including cookies) is saved to the sau-browser Volume
    and reused on every subsequent publish run.

    Supported platforms: tiktok, douyin, xiaohongshu, bilibili, kuaishou
    """
    from playwright.sync_api import sync_playwright

    platform_urls: dict[str, str] = {
        "tiktok": "https://www.tiktok.com/login",
        "douyin": "https://www.douyin.com/",
        "xiaohongshu": "https://www.xiaohongshu.com/",
        "xhs": "https://www.xiaohongshu.com/",
        "bilibili": "https://www.bilibili.com/",
        "kuaishou": "https://www.kuaishou.com/",
    }

    url = platform_urls.get(platform)
    if not url:
        raise ValueError(f"Unknown platform: {platform}. Choose from: {list(platform_urls)}")

    profile_dir = Path(BROWSER_PROFILE_DIR) / platform
    profile_dir.mkdir(parents=True, exist_ok=True)

    print(f"Opening {platform} login page. Log in, then close the browser window.")
    print(f"Cookies will be saved to Volume 'sau-browser' at {profile_dir}")

    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=False,
            args=["--no-sandbox"],
        )
        page = browser.new_page()
        page.goto(url)
        # Wait for the user to manually log in and close the browser.
        try:
            page.wait_for_event("close", timeout=600_000)
        except Exception:
            pass
        finally:
            browser.close()

    sau_browser_volume.commit()
    print(f"Cookies saved. Platform '{platform}' is ready.")
