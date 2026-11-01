from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models import SignLanguageAnimation
from app.schemas.accessibility import (
    SignAnimationOut,
    SignConvertOut,
    SignConvertRequest,
    SignLanguageCatalogOut,
    TranscribeStatusOut,
    TranslationItem,
    TranslationRequest,
    TranslationResponse,
    TranslationStatusOut,
)
from app.services.live_service import build_signs
from app.speech.transcription import (
    SpeechRecognitionError,
    SpeechUnavailableError,
    speech_status,
    transcribe_audio,
)
from app.sign_language.engine import get_engine
from app.translation.service import UnsupportedLanguageError, get_translation_service
from app.translation.languages import get_language

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Accessibility"])

MAX_AUDIO_BYTES = 25 * 1024 * 1024
AUDIO_EXTENSIONS = {".webm", ".wav", ".mp3", ".m4a", ".ogg", ".mp4", ".aac", ".flac", ".opus"}


@router.get("/translation/languages", response_model=TranslationStatusOut)
def translation_status(_user: CurrentUser):
    status_data = get_translation_service().status()
    return TranslationStatusOut(**status_data)


@router.post("/translation/translate", response_model=TranslationResponse)
def translate(payload: TranslationRequest, _user: CurrentUser):
    service = get_translation_service()
    texts = payload.texts if payload.texts is not None else [payload.text or ""]
    try:
        outcomes = service.translate_many(texts, payload.source_language, payload.target_language)
    except UnsupportedLanguageError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    status_data = service.status()
    results = [
        TranslationItem(
            source_text=outcome.source_text,
            translated_text=outcome.translated_text,
            source_language=outcome.source_language,
            target_language=outcome.target_language,
            provider=outcome.provider,
            translated=outcome.translated,
            cached=outcome.cached,
            error=outcome.error,
        )
        for outcome in outcomes
    ]
    provider = next((item.provider for item in results if item.translated), "unavailable")
    return TranslationResponse(
        results=results,
        provider=provider,
        available=bool(status_data["available"]) or payload.source_language == payload.target_language,
    )


@router.get("/speech/status", response_model=TranscribeStatusOut)
def get_speech_status(_user: CurrentUser):
    return TranscribeStatusOut(**speech_status())


@router.post("/speech/transcribe", response_model=dict)
async def transcribe(
    _user: CurrentUser,
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
):
    extension = Path(file.filename or "").suffix.lower()
    if extension not in AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported audio format '{extension or 'unknown'}'. "
            f"Allowed: {', '.join(sorted(AUDIO_EXTENSIONS))}",
        )
    content = await file.read(MAX_AUDIO_BYTES + 1)
    await file.close()
    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio file is too large (max 25 MB).")
    if not content:
        raise HTTPException(status_code=422, detail="The uploaded audio file is empty.")
    if language and not get_language(language):
        raise HTTPException(status_code=422, detail=f"Unsupported language: {language}")
    try:
        result = transcribe_audio(content, file.filename or "audio.webm", language)
    except SpeechUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except SpeechRecognitionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "text": result.text,
        "language": result.language,
        "provider": result.provider,
        "duration_seconds": result.duration_seconds,
    }


@router.post("/sign-language/convert", response_model=SignConvertOut)
def convert_to_signs(payload: SignConvertRequest, _user: CurrentUser):
    signs = build_signs(payload.text, payload.language, include_animation=True)
    if not signs.get("supported", True):
        raise HTTPException(status_code=422, detail=signs.get("error") or "Unsupported sign language")
    return SignConvertOut(**signs)


@router.get("/sign-language/languages", response_model=list[dict])
def sign_language_catalog_list(_user: CurrentUser):
    return get_engine().list_languages()


@router.get("/sign-language/animations", response_model=SignLanguageCatalogOut)
def list_sign_animations(
    _user: CurrentUser,
    db: DbSession,
    language: str = Query(default="isl", max_length=10),
):
    catalog = get_engine().get_catalog(language)
    if catalog is None:
        raise HTTPException(
            status_code=404,
            detail=f"Sign language '{language}' is not available yet.",
        )
    rows = db.scalars(
        select(SignLanguageAnimation)
        .where(SignLanguageAnimation.sign_language == language)
        .order_by(SignLanguageAnimation.gloss)
    ).all()
    animations = [
        SignAnimationOut(
            id=row.id,
            sign_language=row.sign_language,
            gloss=row.gloss,
            label=row.label,
            category=row.category,
            description=row.description,
            aliases=list(row.aliases or []),
            animation_data=row.animation_data,
            is_verified=row.is_verified,
            source=row.source,
            version=row.version,
        )
        for row in rows
    ]
    return SignLanguageCatalogOut(
        language=catalog.language,
        name=catalog.name,
        version=catalog.version,
        verified_count=sum(1 for row in rows if row.is_verified),
        total_count=len(rows),
        note=catalog.note or "",
        animations=animations,
    )
