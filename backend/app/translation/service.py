from __future__ import annotations

import html
import logging
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.translation.languages import SUPPORTED_LANGUAGES, is_supported

logger = logging.getLogger(__name__)


class TranslationError(Exception):
    pass


class UnsupportedLanguageError(TranslationError):
    pass


def _validated_output(texts: list[str], translated: object, provider_name: str) -> list[str]:
    """Reject malformed provider output instead of presenting it as a translation.

    A provider must return one non-empty string per input. Anything else is a
    provider failure and the service will either try the next provider or return
    an honest, explicitly untranslated outcome.
    """
    if not isinstance(translated, (list, tuple)):
        raise TranslationError(f"{provider_name} returned a non-list response")
    if not all(isinstance(item, str) for item in translated):
        raise TranslationError(f"{provider_name} returned a non-string translation")
    values = [item.strip() for item in translated]
    if len(values) != len(texts):
        raise TranslationError(
            f"{provider_name} returned {len(values)} translations for {len(texts)} inputs"
        )
    if any(not value for value in values):
        raise TranslationError(f"{provider_name} returned an empty translation")
    return values


@dataclass
class TranslationOutcome:
    source_text: str
    translated_text: str
    source_language: str
    target_language: str
    provider: str
    translated: bool
    cached: bool = False
    error: str | None = None


class TranslationProvider:
    name = "base"
    supports_batch = True

    @property
    def configured(self) -> bool:
        return False

    def translate_many(self, texts: list[str], source: str, target: str) -> list[str]:
        raise NotImplementedError


class DeepLProvider(TranslationProvider):
    name = "deepl"

    @property
    def configured(self) -> bool:
        return bool(settings.deepl_api_key)

    def translate_many(self, texts: list[str], source: str, target: str) -> list[str]:
        url = settings.deepl_api_url.rstrip("/") + "/v2/translate"
        headers = {"Authorization": f"DeepL-Auth-Key {settings.deepl_api_key}"}
        payload = {
            "text": texts,
            "source_lang": source.upper(),
            "target_lang": target.upper(),
            "preserve_formatting": True,
        }
        with httpx.Client(timeout=settings.translation_timeout_seconds) as client:
            response = client.post(url, json=payload, headers=headers)
        if response.status_code >= 400:
            raise TranslationError(f"DeepL error {response.status_code}: {response.text[:200]}")
        data = response.json()
        if not isinstance(data, dict):
            raise TranslationError("DeepL returned a malformed response")
        translations = data.get("translations")
        if not isinstance(translations, list):
            raise TranslationError("DeepL returned no translations")
        translated = [
            item.get("text", "") if isinstance(item, dict) else "" for item in translations
        ]
        return _validated_output(texts, translated, "DeepL")


class GoogleTranslateProvider(TranslationProvider):
    name = "google"

    @property
    def configured(self) -> bool:
        return bool(settings.google_translate_api_key)

    def translate_many(self, texts: list[str], source: str, target: str) -> list[str]:
        url = "https://translation.googleapis.com/language/translate/v2"
        payload = {"q": texts, "source": source, "target": target, "format": "text"}
        with httpx.Client(timeout=settings.translation_timeout_seconds) as client:
            response = client.post(
                url,
                params={"key": settings.google_translate_api_key},
                json=payload,
            )
        if response.status_code >= 400:
            raise TranslationError(f"Google Translate error {response.status_code}: {response.text[:200]}")
        data = response.json()
        if not isinstance(data, dict):
            raise TranslationError("Google Translate returned a malformed response")
        payload_data = data.get("data")
        translations = payload_data.get("translations") if isinstance(payload_data, dict) else None
        if not isinstance(translations, list):
            raise TranslationError("Google Translate returned no translations")
        translated = [
            html.unescape(item.get("translatedText", "")) if isinstance(item, dict) else ""
            for item in translations
        ]
        return _validated_output(texts, translated, "Google Translate")


class LibreTranslateProvider(TranslationProvider):
    name = "libretranslate"

    @property
    def configured(self) -> bool:
        return bool(settings.libretranslate_url)

    def translate_many(self, texts: list[str], source: str, target: str) -> list[str]:
        url = settings.libretranslate_url.rstrip("/") + "/translate"
        payload = {
            "q": texts,
            "source": source,
            "target": target,
            "format": "text",
        }
        if settings.libretranslate_api_key:
            payload["api_key"] = settings.libretranslate_api_key
        with httpx.Client(timeout=settings.translation_timeout_seconds) as client:
            response = client.post(url, json=payload)
        if response.status_code >= 400:
            raise TranslationError(f"LibreTranslate error {response.status_code}: {response.text[:200]}")
        data = response.json()
        if isinstance(data, dict):
            value = data.get("translatedText")
            translated = value if isinstance(value, list) else [value]
        elif isinstance(data, list):
            translated = data
        else:
            raise TranslationError("LibreTranslate returned a malformed response")
        return _validated_output(texts, translated, "LibreTranslate")


class MyMemoryProvider(TranslationProvider):
    """Free public translation API. No key required; heavily rate limited.

    Suitable for development and low-volume demos. Configure DeepL, Google or a
    self-hosted LibreTranslate for production use.
    """

    name = "mymemory"
    supports_batch = False

    @property
    def configured(self) -> bool:
        return settings.translation_provider in {"auto", "mymemory"}

    def translate_many(self, texts: list[str], source: str, target: str) -> list[str]:
        translated: list[str] = []
        with httpx.Client(timeout=settings.translation_timeout_seconds) as client:
            for text in texts:
                params = {"q": text, "langpair": f"{source}|{target}"}
                if settings.mymemory_email:
                    params["de"] = settings.mymemory_email
                response = client.get("https://api.mymemory.translated.net/get", params=params)
                if response.status_code >= 400:
                    raise TranslationError(f"MyMemory error {response.status_code}")
                data = response.json()
                if not isinstance(data, dict):
                    raise TranslationError("MyMemory returned a malformed response")
                response_data = data.get("responseData")
                value = (
                    response_data.get("translatedText")
                    if isinstance(response_data, dict)
                    else ""
                ) or ""
                value = html.unescape(str(value)).strip()
                if not value or "MYMEMORY WARNING" in value.upper():
                    raise TranslationError("MyMemory quota or language pair unavailable")
                translated.append(value)
        return _validated_output(texts, translated, "MyMemory")


PROVIDERS: dict[str, TranslationProvider] = {
    "deepl": DeepLProvider(),
    "google": GoogleTranslateProvider(),
    "libretranslate": LibreTranslateProvider(),
    "mymemory": MyMemoryProvider(),
}

PROVIDER_ORDER = ["deepl", "google", "libretranslate", "mymemory"]


class TranslationService:
    def __init__(self) -> None:
        self._cache: OrderedDict[str, tuple[float, TranslationOutcome]] = OrderedDict()
        self._lock = threading.Lock()
        self._cache_ttl = 60 * 60 * 12
        self._cache_limit = 5000

    def _chain(self) -> list[TranslationProvider]:
        configured = (settings.translation_provider or "auto").lower()
        if configured == "none":
            return []
        if configured != "auto":
            provider = PROVIDERS.get(configured)
            if provider and provider.configured:
                return [provider]
            # A provider was requested but not configured: degrade gracefully rather
            # than silently inventing translations.
            return []
        return [PROVIDERS[name] for name in PROVIDER_ORDER if PROVIDERS[name].configured]

    @property
    def active_provider(self) -> str | None:
        chain = self._chain()
        return chain[0].name if chain else None

    def status(self) -> dict:
        chain = self._chain()
        note = None
        active = chain[0].name if chain else None
        if active == "mymemory":
            note = (
                "Using the free MyMemory API. It is rate-limited and not intended for "
                "high-volume production traffic. Configure DeepL, Google Cloud Translation "
                "or a self-hosted LibreTranslate for reliable classroom translation."
            )
        if not chain:
            note = (
                "No translation provider is configured. Captions are shown in the teacher's "
                "original language and marked as untranslated."
            )
        return {
            "configured_provider": settings.translation_provider,
            "active_provider": active,
            "available": bool(chain),
            "languages": [language.model_dump() for language in SUPPORTED_LANGUAGES],
            "note": note,
            "providers": {name: provider.configured for name, provider in PROVIDERS.items()},
        }

    def reset_cache(self) -> None:
        """Clear cached translations. Used by tests and operational diagnostics."""
        with self._lock:
            self._cache.clear()

    def _cache_key(self, source: str, target: str, text: str) -> str:
        return f"{source}|{target}|{text}"

    def _cache_get(self, key: str) -> TranslationOutcome | None:
        with self._lock:
            entry = self._cache.get(key)
            if not entry:
                return None
            expires_at, outcome = entry
            if expires_at < time.time():
                self._cache.pop(key, None)
                return None
            self._cache.move_to_end(key)
            return TranslationOutcome(**{**outcome.__dict__, "cached": True})

    def _cache_set(self, key: str, outcome: TranslationOutcome) -> None:
        with self._lock:
            self._cache[key] = (time.time() + self._cache_ttl, outcome)
            self._cache.move_to_end(key)
            while len(self._cache) > self._cache_limit:
                self._cache.popitem(last=False)

    def translate(self, text: str, source: str, target: str) -> TranslationOutcome:
        return self.translate_many([text], source, target)[0]

    def translate_many(self, texts: list[str], source: str, target: str) -> list[TranslationOutcome]:
        source = (source or "en").lower()
        target = (target or "en").lower()
        if not is_supported(target) or not is_supported(source):
            raise UnsupportedLanguageError(f"Unsupported language pair: {source} -> {target}")

        if source == target:
            return [
                TranslationOutcome(
                    source_text=text,
                    translated_text=text,
                    source_language=source,
                    target_language=target,
                    provider="source",
                    translated=True,
                )
                for text in texts
            ]

        outcomes: list[TranslationOutcome | None] = [None] * len(texts)
        pending: dict[str, list[int]] = {}
        for index, text in enumerate(texts):
            stripped = (text or "").strip()
            if not stripped:
                outcomes[index] = TranslationOutcome(
                    source_text=text,
                    translated_text=text,
                    source_language=source,
                    target_language=target,
                    provider="source",
                    translated=True,
                )
                continue
            cached = self._cache_get(self._cache_key(source, target, stripped))
            if cached:
                cached.source_text = text
                cached.cached = True
                outcomes[index] = cached
            else:
                pending.setdefault(stripped, []).append(index)

        if not pending:
            return [outcome for outcome in outcomes if outcome is not None]

        chain = self._chain()
        errors: list[str] = []
        if not chain:
            errors.append("No translation provider is configured")

        for provider in chain:
            unique_texts = list(pending.keys())
            try:
                translated = provider.translate_many(unique_texts, source, target)
                translated = _validated_output(unique_texts, translated, provider.name)
                for original, translated_text in zip(unique_texts, translated):
                    outcome = TranslationOutcome(
                        source_text=original,
                        translated_text=translated_text,
                        source_language=source,
                        target_language=target,
                        provider=provider.name,
                        translated=True,
                    )
                    self._cache_set(self._cache_key(source, target, original), outcome)
                    for index in pending[original]:
                        outcomes[index] = TranslationOutcome(
                            **{**outcome.__dict__, "source_text": texts[index]}
                        )
                break
            except httpx.TimeoutException:
                message = (
                    f"{provider.name}: timed out after "
                    f"{settings.translation_timeout_seconds:g}s"
                )
                logger.warning("Translation provider %s timed out", provider.name)
                errors.append(message)
            except Exception as exc:
                logger.warning("Translation provider %s failed: %s", provider.name, exc)
                errors.append(f"{provider.name}: {exc}")

        error_message = "; ".join(errors) or "Translation failed"
        for index, outcome in enumerate(outcomes):
            if outcome is None:
                outcomes[index] = TranslationOutcome(
                    source_text=texts[index],
                    translated_text=texts[index],
                    source_language=source,
                    target_language=target,
                    provider="unavailable",
                    translated=False,
                    error=error_message,
                )

        return outcomes


_translation_service: TranslationService | None = None
_service_lock = threading.Lock()


def get_translation_service() -> TranslationService:
    global _translation_service
    if _translation_service is None:
        with _service_lock:
            if _translation_service is None:
                _translation_service = TranslationService()
    return _translation_service
