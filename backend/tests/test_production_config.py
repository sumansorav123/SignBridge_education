from __future__ import annotations

import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings, get_settings


def _set_safe_production_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "test-production-secret-that-is-not-a-default")
    monkeypatch.setenv("SEED_DEMO_DATA", "false")
    monkeypatch.setenv("AUTO_CREATE_TABLES", "false")


def test_production_rejects_automatic_table_creation(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_safe_production_environment(monkeypatch)
    monkeypatch.setenv("AUTO_CREATE_TABLES", "true")
    get_settings.cache_clear()

    with pytest.raises(RuntimeError, match="AUTO_CREATE_TABLES must be false"):
        get_settings()

    get_settings.cache_clear()


def test_production_accepts_explicit_manual_schema_management(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_safe_production_environment(monkeypatch)
    get_settings.cache_clear()

    try:
        settings = get_settings()
        assert settings.is_production
        assert settings.auto_create_tables is False
    finally:
        get_settings.cache_clear()


def test_sign_language_seed_does_not_create_missing_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.sign_language import seed

    engine = create_engine("sqlite://")
    monkeypatch.setattr(seed, "engine", engine)
    monkeypatch.setattr(seed, "SessionLocal", sessionmaker(bind=engine))

    try:
        with pytest.raises(OperationalError):
            seed.seed_sign_language_animations()

        assert not inspect(engine).has_table("sign_language_animations")
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    ("database_url", "expected"),
    [
        ("postgres://user:pass@db.example/signbridge", "postgresql+psycopg://user:pass@db.example/signbridge"),
        ("postgresql://user:pass@db.example/signbridge", "postgresql+psycopg://user:pass@db.example/signbridge"),
        ("sqlite:///./signbridge.db", "sqlite:///./signbridge.db"),
    ],
)
def test_database_url_normalizes_postgresql_schemes_only(
    database_url: str, expected: str
) -> None:
    settings = Settings(_env_file=None, database_url=database_url)

    assert settings.database_url == expected


def test_postgresql_url_loads_the_declared_sync_driver() -> None:
    settings = Settings(
        _env_file=None,
        database_url="postgresql://user:pass@db.example/signbridge",
    )
    engine = create_engine(settings.database_url)

    try:
        assert engine.dialect.name == "postgresql"
        assert engine.dialect.driver == "psycopg"
    finally:
        engine.dispose()
