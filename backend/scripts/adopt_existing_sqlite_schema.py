"""Safely adopt an existing SQLite schema into Alembic tracking.

This is for a database that already has the current SignBridge schema but has no
Alembic revision recorded. It does NOT migrate or modify application tables.
By default it only checks. Use --apply only after reviewing the output.

Run from backend:
    python scripts/adopt_existing_sqlite_schema.py
    python scripts/adopt_existing_sqlite_schema.py --apply
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.autogenerate import compare_metadata
from sqlalchemy import create_engine, inspect

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings  # noqa: E402
from app.database.base import Base  # noqa: E402
from app import models  # noqa: E402,F401


def _sqlite_path(database_url: str) -> Path:
    if not database_url.startswith("sqlite:///"):
        raise RuntimeError(
            "This adoption helper is SQLite-only. It will not stamp a MySQL/PostgreSQL database."
        )
    raw_path = database_url.removeprefix("sqlite:///").split("?", 1)[0]
    if raw_path == ":memory:":
        raise RuntimeError("In-memory SQLite cannot be backed up or adopted.")
    path = Path(raw_path)
    if not path.is_absolute():
        path = (BACKEND_DIR / path).resolve()
    return path


def _backup_sqlite(source: Path) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = source.with_name(f"{source.stem}.pre-alembic-adoption-{timestamp}{source.suffix or '.db'}")
    source_conn = sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True)
    try:
        target_conn = sqlite3.connect(str(backup))
        try:
            source_conn.backup(target_conn)
            target_conn.commit()
        finally:
            target_conn.close()
    finally:
        source_conn.close()
    # Verify that the backup can be opened and passes SQLite's integrity check.
    verify = sqlite3.connect(f"file:{backup.as_posix()}?mode=ro", uri=True)
    try:
        result = verify.execute("PRAGMA integrity_check").fetchone()
        if not result or result[0] != "ok":
            backup.unlink(missing_ok=True)
            raise RuntimeError(f"Backup integrity check failed: {result!r}")
    finally:
        verify.close()
    return backup


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="create a verified backup, then stamp Alembic head only if the schema is a clean match",
    )
    args = parser.parse_args()

    url = settings.database_url
    path = _sqlite_path(url)
    if not path.is_file():
        raise RuntimeError(f"Database file does not exist: {path}. Refusing to create/stamp a new database.")

    engine = create_engine(url, future=True)
    try:
        inspector = inspect(engine)
        actual_tables = set(inspector.get_table_names()) - {"alembic_version"}
        expected_tables = set(Base.metadata.tables)
        missing = sorted(expected_tables - actual_tables)
        unexpected = sorted(actual_tables - expected_tables)
        if missing or unexpected:
            print("SCHEMA CHECK FAILED: table set differs from current ORM metadata.")
            if missing:
                print("Missing tables:", ", ".join(missing))
            if unexpected:
                print("Unexpected tables:", ", ".join(unexpected))
            return 2

        with engine.connect() as connection:
            context = MigrationContext.configure(connection, opts={"compare_type": True})
            differences = compare_metadata(context, Base.metadata)
            if differences:
                print("SCHEMA CHECK FAILED: Alembic detected schema differences.")
                for difference in differences[:100]:
                    print(" -", repr(difference))
                if len(differences) > 100:
                    print(f" ... and {len(differences) - 100} more differences")
                print("No database changes were made. Review the differences and write a forward migration.")
                return 2

        raw = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
        try:
            fk_errors = raw.execute("PRAGMA foreign_key_check").fetchall()
            integrity = raw.execute("PRAGMA integrity_check").fetchone()
            current_versions = []
            if "alembic_version" in actual_tables or "alembic_version" in inspector.get_table_names():
                try:
                    current_versions = [
                        row[0] for row in raw.execute("SELECT version_num FROM alembic_version").fetchall()
                    ]
                except sqlite3.Error:
                    current_versions = []
        finally:
            raw.close()

        if integrity is None or integrity[0] != "ok":
            print("SCHEMA CHECK FAILED: SQLite integrity_check did not return 'ok'.")
            return 2
        if fk_errors:
            print(f"SCHEMA CHECK FAILED: {len(fk_errors)} foreign-key violation(s) found.")
            for error in fk_errors[:20]:
                print(" -", error)
            return 2

        if current_versions:
            print("Database already has Alembic revision(s):", ", ".join(current_versions))
            print("No changes made. Use ordinary migration review rather than schema adoption.")
            return 0

        config = Config(str(BACKEND_DIR / "alembic.ini"))
        print(f"Database: {path}")
        print(f"Tables checked: {len(expected_tables)}")
        print("SQLite integrity: ok; foreign keys: ok; ORM/Alembic schema comparison: no differences.")
        print("Current Alembic revision: none (unversioned).")
        if not args.apply:
            print("CHECK ONLY — no changes made. Re-run with --apply to back up and stamp Alembic head.")
            return 0

        backup = _backup_sqlite(path)
        print(f"Verified backup created: {backup}")
        command.stamp(config, "head")
        print("SUCCESS: Alembic head recorded. No application tables or application data were changed.")
        return 0
    finally:
        engine.dispose()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
