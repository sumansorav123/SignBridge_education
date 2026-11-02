# Database Repair Report

Generated: 2026-11-02

## Finding

The SQLite database included in the submitted ZIP had the current 14 ORM tables and recent fields
(including `recordings.start_offset_ms` and `classroom_join_requests`) but its `alembic_version`
table was empty. Running `alembic upgrade head` against that database could attempt to recreate
tables that already existed and fail.

## Repair applied to the updated handover copy

- Compared the SQLite schema against the current SQLAlchemy ORM metadata using Alembic autogenerate comparison: **0 differences**.
- SQLite `PRAGMA integrity_check`: **ok**.
- SQLite `PRAGMA foreign_key_check`: **0 violations**.
- Recorded the existing migration head, `20261101_join_requests`, in `alembic_version` using Alembic's `stamp` operation.
- Verified the database still passes integrity and foreign-key checks after stamping.
- No application tables, rows, user records, or file-storage contents were intentionally modified by the stamp operation.

The uploaded ZIP itself was not changed. Its database file was copied to the working output, repaired there, and included in the updated ZIP.

## Safe handling of other databases

The bundled database result does not prove that another local, hosted, or production database has the same schema. Use `backend/scripts/adopt_existing_sqlite_schema.py` in check-only mode first. The helper refuses to stamp if it detects schema differences or foreign-key/integrity problems. It supports SQLite only. For production databases or any schema drift, take verified backups and rehearse a reviewed migration on a clone; do not blindly stamp or upgrade.
