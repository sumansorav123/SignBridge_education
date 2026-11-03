from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import func, inspect, select

from app.database.base import Base
from app.database.session import SessionLocal, engine, run_migrations
from app.models import SignLanguageAnimation, User
from app.seed import seed_demo_data
from app.sign_language.seed import seed_sign_language_animations


def _row_count(model: type[Base]) -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(model)) or 0


def test_migrations_create_all_model_tables_and_seeds_are_idempotent() -> None:
    run_migrations()
    migration_config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    migration_config.attributes["skip_logging_config"] = True
    command.check(migration_config)

    assert set(Base.metadata.tables).issubset(set(inspect(engine).get_table_names()))

    seed_sign_language_animations()
    first_animation_count = _row_count(SignLanguageAnimation)
    seed_sign_language_animations()
    assert first_animation_count > 0
    assert _row_count(SignLanguageAnimation) == first_animation_count

    seed_demo_data()
    first_user_count = _row_count(User)
    seed_demo_data()
    assert first_user_count > 0
    assert _row_count(User) == first_user_count
