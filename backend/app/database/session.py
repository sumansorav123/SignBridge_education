from __future__ import annotations

import logging
from collections.abc import Generator
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)

_is_sqlite = settings.database_url.startswith("sqlite")
_backend_dir = Path(__file__).resolve().parents[2]

engine: Engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    future=True,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations() -> None:
    config = Config(str(_backend_dir / "alembic.ini"))
    config.attributes["skip_logging_config"] = True
    command.upgrade(config, "head")
    logger.info("Database migrations applied (%s)", engine.dialect.name)
