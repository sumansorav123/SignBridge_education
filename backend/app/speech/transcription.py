from __future__ import annotations

import logging
import os
import tempfile
from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.translation.languages import get_language

logger = logging.getLogger(__name__)


class SpeechUnavailableError(Exception):
    pass


class SpeechRecognitionError(Exception):
    pass


@dataclass
class TranscriptionResult:
    text: str
    language: str | None
    provider: str
    duration_seconds: float | None = None


def _local_whisper_available() -> bool:
    if not settings.enable_local_whisper:
        return False
    try:
        import faster_whisper  # noqa: F401
    except ImportError:
        return False
    return True


def speech_status() -> dict:
    if settings.openai_api_key:
        return {
            "browser_webspeech": True,
            "server_provider": "openai_whisper",
            "server_available": True,
            "model": settings.openai_transcribe_model,
            "note": (
                "Live captions use the browser Web Speech API. Uploaded audio can be "
                "transcribed server-side with OpenAI Whisper."
            ),
        }
    if _local_whisper_available():
        return {
            "browser_webspeech": True,
            "server_provider": "faster_whisper",
            "server_available": True,
            "model": settings.whisper_model,
            "note": "Uploaded audio is transcribed locally with faster-whisper.",
        }
    return {
        "browser_webspeech": True,
        "server_provider": None,
        "server_available": False,
        "model": None,
        "note": (
            "Live captions use the browser Web Speech API (Chrome/Edge recommended). "
            "Server transcription is disabled until OPENAI_API_KEY is set or "
            "faster-whisper is installed with ENABLE_LOCAL_WHISPER=true."
        ),
    }


def transcribe_audio(content: bytes, filename: str, language: str | None) -> TranscriptionResult:
    if not content:
        raise SpeechRecognitionError("The uploaded audio file is empty")
    language_code = None
    if language:
        language_code = get_language(language)
        if language_code is None:
            raise SpeechRecognitionError(f"Unsupported language: {language}")

    if settings.openai_api_key:
        return _transcribe_openai(content, filename, language)

    if _local_whisper_available():
        return _transcribe_local(content, filename, language)

    raise SpeechUnavailableError(
        "Server-side transcription is not configured. Live classroom captions use the "
        "browser Web Speech API automatically. To transcribe uploaded audio, set "
        "OPENAI_API_KEY or install faster-whisper and set ENABLE_LOCAL_WHISPER=true."
    )


def _transcribe_openai(content: bytes, filename: str, language: str | None) -> TranscriptionResult:
    suffix = os.path.splitext(filename or "audio.webm")[1] or ".webm"
    try:
        with httpx.Client(timeout=120) as client:
            response = client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                data={
                    "model": settings.openai_transcribe_model,
                    "response_format": "verbose_json",
                    **({"language": language} if language else {}),
                },
                files={"file": (f"audio{suffix}", content, "application/octet-stream")},
            )
        if response.status_code >= 400:
            raise SpeechRecognitionError(
                f"Whisper API error {response.status_code}: {response.text[:300]}"
            )
        data = response.json()
        text = (data.get("text") or "").strip()
        if not text:
            raise SpeechRecognitionError("No speech could be recognized in the recording")
        return TranscriptionResult(
            text=text,
            language=data.get("language") or language,
            provider="openai_whisper",
            duration_seconds=data.get("duration"),
        )
    except httpx.HTTPError as exc:
        raise SpeechRecognitionError(f"Could not reach the transcription service: {exc}") from exc


def _transcribe_local(content: bytes, filename: str, language: str | None) -> TranscriptionResult:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:  # pragma: no cover - guarded above
        raise SpeechUnavailableError("faster-whisper is not installed") from exc

    suffix = os.path.splitext(filename or "audio.webm")[1] or ".webm"
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
            handle.write(content)
            temp_path = handle.name
        model = WhisperModel(settings.whisper_model, device="cpu", compute_type="int8")
        segments, info = model.transcribe(temp_path, language=language, beam_size=5)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        if not text:
            raise SpeechRecognitionError("No speech could be recognized in the recording")
        return TranscriptionResult(
            text=text,
            language=getattr(info, "language", language),
            provider="faster_whisper",
            duration_seconds=getattr(info, "duration", None),
        )
    except SpeechRecognitionError:
        raise
    except Exception as exc:
        raise SpeechRecognitionError(f"Local transcription failed: {exc}") from exc
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
