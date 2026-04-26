"""Thin HTTP sidecar for dreammis/social-auto-upload.

The aether app speaks the provider-agnostic PublisherProvider contract. This
sidecar translates that contract into `sau` CLI jobs and keeps scheduling state
outside the Next.js / Cloudflare runtime, where browser automation cannot run.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import shutil
import subprocess
import time
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

TOKEN = os.environ.get("SOCIAL_AUTO_UPLOAD_TOKEN", "")
STATE_PATH = Path(os.environ.get("SAU_STATE_PATH", "./data/jobs.json"))
MEDIA_DIR = Path(os.environ.get("SAU_MEDIA_DIR", "./data/media"))
ARTIFACT_DIR = Path(os.environ.get("SAU_ARTIFACT_DIR", "./data/artifacts"))
SAU_BIN = os.environ.get("SAU_BIN", "sau")

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


class ScheduleRequest(BaseModel):
    workspaceId: str
    platform: Platform
    accountId: str | None = None
    mediaUrls: list[str] = Field(min_length=1)
    caption: str = ""
    hashtags: list[str] = []
    scheduledAt: str
    screenshotOnFailure: bool = True


class ScheduledJob(ScheduleRequest):
    id: str
    status: Status = "scheduled"
    createdAt: str
    updatedAt: str
    artifactPath: str | None = None
    error: str | None = None


app = FastAPI(title="aether social-auto-upload sidecar", version="1.0")
_lock = asyncio.Lock()


async def require_token(authorization: str = Header(default="")) -> None:
    if not TOKEN:
        raise HTTPException(status_code=503, detail="SOCIAL_AUTO_UPLOAD_TOKEN not set")
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="invalid token")


@app.on_event("startup")
async def startup() -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    if not STATE_PATH.exists():
        STATE_PATH.write_text("{}", encoding="utf-8")
    asyncio.create_task(run_scheduler())


@app.post("/v1/posts", dependencies=[Depends(require_token)])
async def schedule_post(req: ScheduleRequest, background: BackgroundTasks) -> dict[str, str]:
    now = now_iso()
    job = ScheduledJob(
        **dump_model(req),
        id=f"sau_{uuid.uuid4().hex[:12]}",
        createdAt=now,
        updatedAt=now,
    )
    async with _lock:
        jobs = read_jobs()
        jobs[job.id] = dump_model(job)
        write_jobs(jobs)

    if parse_iso(req.scheduledAt) <= datetime.now(timezone.utc):
        background.add_task(publish_job, job.id)

    return {"id": job.id}


@app.get("/v1/posts", dependencies=[Depends(require_token)])
async def list_posts(workspaceId: str) -> dict[str, list[dict]]:
    jobs = read_jobs()
    posts = [
        job
        for job in jobs.values()
        if job.get("workspaceId") == workspaceId and job.get("status") != "cancelled"
    ]
    return {"posts": posts}


@app.delete("/v1/posts/{job_id}", dependencies=[Depends(require_token)])
async def cancel_post(job_id: str) -> dict[str, str]:
    async with _lock:
        jobs = read_jobs()
        if job_id not in jobs:
            return {"id": job_id, "status": "cancelled"}
        jobs[job_id]["status"] = "cancelled"
        jobs[job_id]["updatedAt"] = now_iso()
        write_jobs(jobs)
    return {"id": job_id, "status": "cancelled"}


async def run_scheduler() -> None:
    while True:
        try:
            jobs = read_jobs()
            due = [
                job_id
                for job_id, job in jobs.items()
                if job.get("status") == "scheduled"
                and parse_iso(job["scheduledAt"]) <= datetime.now(timezone.utc)
            ]
            for job_id in due:
                asyncio.create_task(publish_job(job_id))
        finally:
            await asyncio.sleep(30)


async def publish_job(job_id: str) -> None:
    async with _lock:
        jobs = read_jobs()
        raw = jobs.get(job_id)
        if not raw or raw.get("status") != "scheduled":
            return
        raw["status"] = "publishing"
        raw["updatedAt"] = now_iso()
        write_jobs(jobs)

    try:
        job = ScheduledJob(**raw)
        media_paths = [materialize_media(job.id, url) for url in job.mediaUrls]
        command = build_sau_command(job, media_paths)
        subprocess.run(command, check=True, capture_output=True, text=True)
        await patch_job(job_id, {"status": "published", "updatedAt": now_iso()})
    except Exception as exc:  # noqa: BLE001 - persist the failure for Discord artifacts.
        artifact = write_failure_artifact(job_id, exc)
        await patch_job(
            job_id,
            {
                "status": "failed",
                "updatedAt": now_iso(),
                "artifactPath": str(artifact),
                "error": str(exc),
            },
        )


def build_sau_command(job: ScheduledJob, media_paths: list[Path]) -> list[str]:
    account = job.accountId or os.environ.get("SAU_DEFAULT_ACCOUNT")
    if not account:
        raise RuntimeError("accountId required or SAU_DEFAULT_ACCOUNT must be set")

    platform = CLI_PLATFORM[job.platform]
    first = media_paths[0]
    tags = ",".join(job.hashtags)
    title = title_from_caption(job.caption)

    if first.suffix.lower() in VIDEO_EXTS:
        command = [
            SAU_BIN,
            platform,
            "upload-video",
            "--account",
            account,
            "--file",
            str(first),
            "--title",
            title,
            "--desc",
            body_from_job(job),
        ]
    else:
        command = [
            SAU_BIN,
            platform,
            "upload-note",
            "--account",
            account,
            "--images",
            *[str(path) for path in media_paths],
            "--title",
            title,
            "--note",
            body_from_job(job),
        ]
    if tags:
        command.extend(["--tags", tags])
    return command


def materialize_media(job_id: str, media_url: str) -> Path:
    job_dir = MEDIA_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    if media_url.startswith("data:"):
        header, encoded = media_url.split(",", 1)
        ext = ".png" if "png" in header else ".jpg"
        out = job_dir / f"media_{len(list(job_dir.iterdir())) + 1}{ext}"
        out.write_bytes(base64.b64decode(encoded))
        return out

    if media_url.startswith("http://") or media_url.startswith("https://"):
        suffix = Path(urllib.parse.urlparse(media_url).path).suffix or ".bin"
        out = job_dir / f"media_{len(list(job_dir.iterdir())) + 1}{suffix}"
        urllib.request.urlretrieve(media_url, out)
        return out

    path = Path(media_url)
    if not path.exists():
        raise FileNotFoundError(media_url)
    return path


def write_failure_artifact(job_id: str, exc: Exception) -> Path:
    artifact_dir = ARTIFACT_DIR / job_id
    artifact_dir.mkdir(parents=True, exist_ok=True)
    latest_screenshot = newest_png(Path(os.environ.get("SAU_SCREENSHOT_DIR", ".")))
    if latest_screenshot:
        shutil.copy2(latest_screenshot, artifact_dir / latest_screenshot.name)
    failure = artifact_dir / "failure.json"
    failure.write_text(
        json.dumps({"jobId": job_id, "error": str(exc), "at": now_iso()}, indent=2),
        encoding="utf-8",
    )
    return artifact_dir


def newest_png(path: Path) -> Path | None:
    if not path.exists():
        return None
    candidates = list(path.rglob("*.png"))
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


async def patch_job(job_id: str, patch: dict) -> None:
    async with _lock:
        jobs = read_jobs()
        if job_id in jobs:
            jobs[job_id].update(patch)
            write_jobs(jobs)


def read_jobs() -> dict[str, dict]:
    if not STATE_PATH.exists():
        return {}
    return json.loads(STATE_PATH.read_text(encoding="utf-8") or "{}")


def write_jobs(jobs: dict[str, dict]) -> None:
    STATE_PATH.write_text(json.dumps(jobs, indent=2, sort_keys=True), encoding="utf-8")


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def title_from_caption(caption: str) -> str:
    normalized = " ".join(caption.split())
    return normalized[:90] or "aether render"


def body_from_job(job: ScheduledJob) -> str:
    tags = " ".join(f"#{tag}" for tag in job.hashtags)
    return "\n\n".join(part for part in [job.caption.strip(), tags] if part)


def dump_model(model: BaseModel) -> dict:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()
