from __future__ import annotations

import time
from collections import defaultdict

from fastapi import HTTPException, status

_attempts: dict[str, list[float]] = defaultdict(list)


def _cleanup(key: str, window: int) -> None:
    cutoff = time.time() - window
    _attempts[key] = [stamp for stamp in _attempts[key] if stamp > cutoff]


def check_rate_limit(key: str, limit: int = 8, window: int = 300) -> None:
    _cleanup(key, window)
    if len(_attempts[key]) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please wait a few minutes and try again.",
        )


def record_attempt(key: str) -> None:
    _attempts[key].append(time.time())


def clear_attempts(key: str) -> None:
    _attempts.pop(key, None)
