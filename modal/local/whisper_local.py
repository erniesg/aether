"""Local Whisper transcription server for async push-to-talk.

Run:
  python -m uvicorn modal.local.whisper_local:app --host 127.0.0.1 --port 9000

Auth: set LOCAL_WHISPER_TOKEN or WHISPER_TRANSCRIBE_TOKEN. For localhost-only
development, set LOCAL_WHISPER_ALLOW_ANON=1 to accept unauthenticated requests.
"""

from __future__ import annotations

import os
import platform
import tempfile
from pathlib import Path
from threading import Lock
from typing import Annotated

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel


DEFAULT_FASTER_MODEL = "large-v3"
DEFAULT_MLX_MODEL = "mlx-community/whisper-small-mlx"


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str


class TranscribeResponse(BaseModel):
    text: str
    language: str | None = None
    model: str
    backend: str
    segments: list[TranscriptSegment]


def _is_apple_silicon() -> bool:
    return platform.system() == "Darwin" and platform.machine() == "arm64"


def _resolve_backend() -> str:
    raw = os.environ.get("LOCAL_WHISPER_BACKEND", "").strip().lower()
    if raw in {"mlx", "faster-whisper", "faster_whisper"}:
        return "faster-whisper" if raw == "faster_whisper" else raw
    return "mlx" if _is_apple_silicon() else "faster-whisper"


def _select_faster_device() -> str:
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
    except Exception:  # noqa: BLE001
        pass
    return "cpu"


def _normalize_faster_model_name(model: str | None) -> str:
    value = (model or os.environ.get("LOCAL_WHISPER_MODEL") or DEFAULT_FASTER_MODEL).strip()
    aliases = {
        "whisper-large-v3": "large-v3",
        "whisper-large-v2": "large-v2",
        "whisper-medium": "medium",
        "whisper-small": "small",
        "whisper-base": "base",
        "whisper-tiny": "tiny",
    }
    return aliases.get(value, value)


def _normalize_mlx_model_name(model: str | None) -> str:
    value = (model or os.environ.get("LOCAL_WHISPER_MODEL") or DEFAULT_MLX_MODEL).strip()
    aliases = {
        "large-v3": "mlx-community/whisper-large-v3-mlx",
        "whisper-large-v3": "mlx-community/whisper-large-v3-mlx",
        "large-v3-turbo": "mlx-community/whisper-large-v3-turbo",
        "whisper-large-v3-turbo": "mlx-community/whisper-large-v3-turbo",
        "distil-large-v3": "mlx-community/distil-whisper-large-v3",
        "distil-whisper-large-v3": "mlx-community/distil-whisper-large-v3",
        "small": "mlx-community/whisper-small-mlx",
        "whisper-small": "mlx-community/whisper-small-mlx",
        "tiny": "mlx-community/whisper-tiny",
        "whisper-tiny": "mlx-community/whisper-tiny",
    }
    return aliases.get(value, value)


def _require_bearer_token(authorization: str | None) -> None:
    expected = (
        os.environ.get("LOCAL_WHISPER_TOKEN", "").strip()
        or os.environ.get("WHISPER_TRANSCRIBE_TOKEN", "").strip()
    )
    if not expected:
        if os.environ.get("LOCAL_WHISPER_ALLOW_ANON", "").strip() == "1":
            return
        raise HTTPException(status_code=401, detail="unauthorized")
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="unauthorized")


class WhisperRunner:
    def __init__(self) -> None:
        self.backend = _resolve_backend()
        self.device = "mlx" if self.backend == "mlx" else _select_faster_device()
        self.compute_type = os.environ.get(
            "LOCAL_WHISPER_COMPUTE_TYPE",
            "float16" if self.device == "cuda" else "int8",
        )
        self._models = {}
        self._lock = Lock()

    def normalize_model_name(self, model: str | None) -> str:
        if self.backend == "mlx":
            return _normalize_mlx_model_name(model)
        return _normalize_faster_model_name(model)

    def _get_faster_model(self, model_name: str):
        with self._lock:
            if model_name in self._models:
                return self._models[model_name]
            from faster_whisper import WhisperModel

            print(
                f"[whisper-local] loading {model_name} on {self.device} "
                f"({self.compute_type})"
            )
            model = WhisperModel(
                model_name,
                device=self.device,
                compute_type=self.compute_type,
            )
            self._models[model_name] = model
            print(f"[whisper-local] ready: {model_name}")
            return model

    def _transcribe_mlx(
        self,
        path: Path,
        model_name: str,
        language: str | None,
        prompt: str | None,
    ) -> TranscribeResponse:
        try:
            import mlx_whisper
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "mlx-whisper is not installed; run `.venv-local-models/bin/pip install mlx-whisper`"
            ) from exc

        print(f"[whisper-local] transcribing with MLX model {model_name}")
        kwargs = {
            "path_or_hf_repo": model_name,
            "verbose": False,
        }
        if language:
            kwargs["language"] = language
        if prompt:
            kwargs["initial_prompt"] = prompt
        result = mlx_whisper.transcribe(str(path), **kwargs)
        raw_segments = result.get("segments") if isinstance(result, dict) else None
        segments = []
        if isinstance(raw_segments, list):
            for segment in raw_segments:
                if not isinstance(segment, dict):
                    continue
                segments.append(
                    TranscriptSegment(
                        start=float(segment.get("start") or 0),
                        end=float(segment.get("end") or 0),
                        text=str(segment.get("text") or "").strip(),
                    )
                )
        text = (
            str(result.get("text") or "").strip()
            if isinstance(result, dict)
            else ""
        )
        if not text:
            text = " ".join(segment.text for segment in segments).strip()
        return TranscribeResponse(
            text=text,
            language=(
                str(result.get("language"))
                if isinstance(result, dict) and result.get("language")
                else language
            ),
            model=model_name,
            backend=self.backend,
            segments=segments,
        )

    def _transcribe_faster(
        self,
        path: Path,
        model_name: str,
        language: str | None,
        prompt: str | None,
    ) -> TranscribeResponse:
        model = self._get_faster_model(model_name)
        segments_iter, info = model.transcribe(
            str(path),
            language=language or None,
            initial_prompt=prompt or None,
            vad_filter=True,
        )
        segments = [
            TranscriptSegment(
                start=float(segment.start),
                end=float(segment.end),
                text=segment.text.strip(),
            )
            for segment in segments_iter
        ]
        text = " ".join(segment.text for segment in segments).strip()
        return TranscribeResponse(
            text=text,
            language=getattr(info, "language", None),
            model=model_name,
            backend=self.backend,
            segments=segments,
        )

    def transcribe(
        self,
        path: Path,
        model_name: str,
        language: str | None,
        prompt: str | None,
    ) -> TranscribeResponse:
        if self.backend == "mlx":
            return self._transcribe_mlx(path, model_name, language, prompt)
        return self._transcribe_faster(path, model_name, language, prompt)


app = FastAPI(title="aether-whisper (local)", version="1.0")
runner = WhisperRunner()


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    file: Annotated[UploadFile, File()],
    model: Annotated[str | None, Form()] = None,
    language: Annotated[str | None, Form()] = None,
    prompt: Annotated[str | None, Form()] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> TranscribeResponse:
    _require_bearer_token(authorization)
    model_name = runner.normalize_model_name(model)
    suffix = Path(file.filename or "voice-command.webm").suffix or ".webm"
    try:
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail="empty audio file")
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
            tmp.write(raw)
            tmp.flush()
            return await run_in_threadpool(
                runner.transcribe,
                Path(tmp.name),
                model_name,
                language,
                prompt,
            )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/healthz")
def healthz() -> dict:
    return {
        "ok": True,
        "backend": runner.backend,
        "device": runner.device,
        "compute_type": runner.compute_type,
        "loaded_models": sorted(runner._models.keys()),
    }
