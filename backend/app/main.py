from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.router import api_router
from app.api.websocket import router as websocket_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.database.session import engine, run_migrations
from app.seed import seed_demo_data
from app.sign_language.engine import get_engine
from app.sign_language.seed import seed_sign_language_animations
from app.translation.service import get_translation_service

logger = logging.getLogger("signbridge")

APP_VERSION = "1.0.0"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    logger.info(
        "Starting %s v%s (%s) with %s",
        settings.app_name,
        APP_VERSION,
        settings.environment,
        engine.dialect.name,
    )
    settings.ensure_directories()
    run_migrations()
    seed_sign_language_animations()
    if settings.seed_demo_data:
        seed_demo_data()
    logger.info("Startup complete. API ready at %s", settings.api_prefix)
    try:
        yield
    finally:
        engine.dispose()
        logger.info("SignBridge API stopped")


app = FastAPI(
    title=settings.app_name,
    version=APP_VERSION,
    description=(
        "Inclusive live-classroom API with real-time multilingual captions, "
        "translation, a rule-based ISL avatar pipeline, recordings and materials."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

_origins = settings.cors_origin_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins if _origins != ["*"] else ["*"],
    allow_credentials=_origins != ["*"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With", "X-Request-ID"],
    expose_headers=["X-Request-ID", "Content-Disposition"],
    max_age=600,
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), display-capture=(self)"
    if elapsed_ms > 1500:
        logger.warning(
            "Slow request %s %s -> %s in %.0f ms",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
    return response


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Something went wrong on our side. Please try again.",
            "code": "internal_error",
        },
    )


@app.get("/api/health", tags=["System"])
@app.get("/health", tags=["System"])
def health() -> dict:
    database = "unavailable"
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        database = "ok"
    except Exception:  # pragma: no cover - defensive
        logger.warning("Health check database probe failed", exc_info=True)
    translation = get_translation_service().status()
    isl_catalog = get_engine().get_catalog("isl")
    isl_entries = isl_catalog.entries if isl_catalog else []
    reviewed_isl_entries = sum(1 for entry in isl_entries if entry.verified)
    return {
        "status": "ok" if database == "ok" else "degraded",
        "version": APP_VERSION,
        "environment": settings.environment,
        "database": {"dialect": engine.dialect.name, "status": database},
        "translation": {
            "configured": translation["configured_provider"],
            "active_provider": translation["active_provider"],
            "available": translation["available"],
        },
        "sign_language": {
            "text_to_sign": True,
            "verified_isl_entries": reviewed_isl_entries,
            "experimental_isl_entries": len(isl_entries) - reviewed_isl_entries,
        },
        "websocket": {
            "path": "/ws/classroom/{classroom_id}",
            "auth": "Send {\"type\":\"auth\",\"token\":\"<access_token>\"} after connect.",
            "url_token_auth": False,
        },
    }


app.include_router(api_router, prefix=settings.api_prefix)
app.include_router(websocket_router)

__all__ = ["app"]
