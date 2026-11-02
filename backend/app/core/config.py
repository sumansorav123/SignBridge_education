from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Application configuration loaded from environment variables / backend/.env."""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = "SignBridge API"
    environment: str = "development"
    debug: bool = False
    secret_key: str = "dev-only-insecure-change-me-signbridge-secret-key"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    log_level: str = "INFO"
    api_prefix: str = "/api"

    # Database
    database_url: str = f"sqlite:///{(BASE_DIR / 'signbridge.db').as_posix()}"
    auto_create_tables: bool = True
    seed_demo_data: bool = True

    # Storage
    storage_root: str = str(BASE_DIR / "storage")
    max_recording_mb: int = 512
    max_material_mb: int = 64

    # Translation
    translation_provider: str = "auto"
    translation_timeout_seconds: float = 10.0
    mymemory_email: str = ""
    libretranslate_url: str = ""
    libretranslate_api_key: str = ""
    deepl_api_key: str = ""
    deepl_api_url: str = "https://api-free.deepl.com"
    google_translate_api_key: str = ""

    # Speech
    openai_api_key: str = ""
    openai_transcribe_model: str = "whisper-1"
    enable_local_whisper: bool = False
    whisper_model: str = "base"

    # Media
    allowed_material_extensions: str = (
        ".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,.mp4,.webm,.zip"
    )
    allowed_recording_extensions: str = ".webm,.mp4,.ogg,.m4a,.wav,.mkv"

    @field_validator("environment")
    @classmethod
    def _normalise_env(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalise_database_url(cls, value: str) -> str:
        if not isinstance(value, str):
            return value
        scheme, separator, remainder = value.strip().partition("://")
        if separator and scheme.lower() in {"postgres", "postgresql"}:
            return f"postgresql+psycopg://{remainder}"
        return value

    @property
    def is_production(self) -> bool:
        return self.environment in {"production", "prod"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def storage_path(self) -> Path:
        path = Path(self.storage_root)
        if not path.is_absolute():
            path = BASE_DIR / path
        return path.resolve()

    @property
    def recordings_path(self) -> Path:
        return self.storage_path / "recordings"

    @property
    def materials_path(self) -> Path:
        return self.storage_path / "materials"

    @property
    def material_extension_set(self) -> set[str]:
        return {ext.strip().lower() for ext in self.allowed_material_extensions.split(",") if ext.strip()}

    @property
    def recording_extension_set(self) -> set[str]:
        return {ext.strip().lower() for ext in self.allowed_recording_extensions.split(",") if ext.strip()}

    def ensure_directories(self) -> None:
        self.recordings_path.mkdir(parents=True, exist_ok=True)
        self.materials_path.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.is_production and settings.secret_key.startswith("dev-only"):
        raise RuntimeError(
            "SECRET_KEY must be configured in production. "
            "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
        )
    if settings.is_production and settings.seed_demo_data:
        raise RuntimeError(
            "SEED_DEMO_DATA must be false in production: it creates demo accounts with a public password."
        )
    if settings.is_production and settings.auto_create_tables:
        raise RuntimeError(
            "AUTO_CREATE_TABLES must be false in production. "
            "Apply a reviewed database migration plan explicitly."
        )
    logging.getLogger(__name__).setLevel(settings.log_level.upper())
    return settings


settings = get_settings()
