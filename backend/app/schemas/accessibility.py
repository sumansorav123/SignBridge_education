from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator


class TranslationRequest(BaseModel):
    text: str | None = Field(default=None, max_length=5000)
    texts: list[str] | None = Field(default=None, max_length=100)
    source_language: str = Field(default="en", max_length=10)
    target_language: str = Field(max_length=10)

    @model_validator(mode="after")
    def _one_input(self) -> TranslationRequest:
        if not self.text and not self.texts:
            raise ValueError("Provide either text or texts")
        if self.texts is not None:
            cleaned = [t.strip() for t in self.texts if t and t.strip()]
            if not cleaned:
                raise ValueError("texts must contain at least one non-empty string")
            if any(len(t) > 5000 for t in cleaned):
                raise ValueError("Each text must be at most 5000 characters")
            self.texts = cleaned
        if self.text is not None:
            self.text = self.text.strip()
            if not self.text:
                raise ValueError("text must not be empty")
        return self


class TranslationItem(BaseModel):
    source_text: str
    translated_text: str
    source_language: str
    target_language: str
    provider: str
    translated: bool
    cached: bool = False
    error: str | None = None


class TranslationResponse(BaseModel):
    results: list[TranslationItem]
    provider: str
    available: bool


class LanguageOption(BaseModel):
    code: str
    name: str
    native_name: str
    speech_code: str
    rtl: bool = False


class TranslationStatusOut(BaseModel):
    configured_provider: str
    active_provider: str | None
    available: bool
    languages: list[LanguageOption]
    note: str | None = None
    providers: dict[str, bool] = {}


class TranscribeStatusOut(BaseModel):
    browser_webspeech: bool = True
    server_provider: str | None = None
    server_available: bool
    model: str | None = None
    note: str


class SignConvertRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    language: str = Field(default="isl", max_length=10)


class SignGlossOut(BaseModel):
    gloss: str
    label: str
    token: str
    available: bool
    animation_id: int | None = None
    animation: dict[str, Any] | None = None
    category: str | None = None
    source: str | None = None


class SignConvertOut(BaseModel):
    language: str
    source_text: str
    glosses: list[SignGlossOut]
    tokens: list[str]
    unsupported: list[str]
    rules_applied: list[str]
    phrase_matches: list[str]
    coverage: float
    has_fallback: bool
    fallback_message: str | None = None
    grammar_note: str | None = None
    catalog_note: str | None = None


class SignAnimationOut(BaseModel):
    id: int
    sign_language: str
    gloss: str
    label: str
    category: str
    description: str | None = None
    aliases: list[str] = []
    animation_data: dict[str, Any]
    is_verified: bool
    source: str | None = None
    version: str


class SignLanguageCatalogOut(BaseModel):
    language: str
    name: str
    version: str
    verified_count: int
    total_count: int
    note: str
    animations: list[SignAnimationOut]
