from __future__ import annotations

from datetime import datetime, timezone


def ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def duration_seconds(start: datetime | None, end: datetime | None) -> int:
    start_utc = ensure_utc(start)
    end_utc = ensure_utc(end) or utcnow()
    if start_utc is None:
        return 0
    return max(0, int((end_utc - start_utc).total_seconds()))


def isoformat(value: datetime | None) -> str | None:
    aware = ensure_utc(value)
    return aware.isoformat() if aware else None
