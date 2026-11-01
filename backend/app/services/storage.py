from __future__ import annotations

import logging
import mimetypes
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings

logger = logging.getLogger(__name__)

# Never trust a browser-supplied Content-Type when serving an uploaded file.
# Deriving it from the already-validated extension prevents an HTML/JS payload
# disguised as a media file from being rendered on the API origin.
_SAFE_MIME_TYPES = {
    ".webm": "video/webm",
    ".mp4": "video/mp4",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".mkv": "video/x-matroska",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".zip": "application/zip",
}


class StorageError(Exception):
    pass


class UploadValidationError(StorageError):
    pass


def _safe_original_name(filename: str | None) -> str:
    name = Path(filename or "upload").name.strip()
    name = name.replace("\x00", "")
    return name[:255] or "upload"


def resolve_storage_key(storage_key: str) -> Path:
    root = settings.storage_path
    candidate = (root / storage_key).resolve()
    if not candidate.is_relative_to(root):
        raise StorageError("Invalid storage key")
    return candidate


async def save_upload(
    upload: UploadFile,
    *,
    subdir: str,
    allowed_extensions: set[str],
    max_bytes: int,
) -> dict:
    original_name = _safe_original_name(upload.filename)
    extension = Path(original_name).suffix.lower()
    if extension not in allowed_extensions:
        raise UploadValidationError(
            f"File type '{extension or 'unknown'}' is not allowed. "
            f"Allowed extensions: {', '.join(sorted(allowed_extensions))}"
        )

    directory = settings.storage_path / subdir
    directory.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{extension}"
    target = directory / stored_name
    storage_key = f"{subdir}/{stored_name}"
    size = 0
    try:
        with target.open("wb") as handle:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise UploadValidationError(
                        f"File is too large. Maximum size is {max_bytes // (1024 * 1024)} MB."
                    )
                handle.write(chunk)
        if size == 0:
            raise UploadValidationError("The uploaded file is empty.")
    except Exception:
        target.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()

    mime_type = (
        _SAFE_MIME_TYPES.get(extension)
        or mimetypes.guess_type(original_name)[0]
        or "application/octet-stream"
    )
    logger.info("Stored upload %s (%s bytes) at %s", original_name, size, storage_key)
    return {
        "storage_key": storage_key,
        "original_filename": original_name,
        "mime_type": mime_type,
        "size_bytes": size,
    }


def delete_storage_key(storage_key: str) -> None:
    try:
        path = resolve_storage_key(storage_key)
    except StorageError:
        return
    path.unlink(missing_ok=True)
