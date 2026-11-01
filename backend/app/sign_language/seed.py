from __future__ import annotations

import logging

from app.database.base import Base
from app.database.session import SessionLocal, engine

logger = logging.getLogger(__name__)


def seed_sign_language_animations() -> None:
    """Upsert the bundled sign lexicon into the database.

    The JSON file is the source of truth for the starter library. Entries are
    upserted by (sign_language, gloss) so that editing the JSON and restarting
    the API updates the catalog without duplicating rows.
    """
    from sqlalchemy import select

    from app.models.lecture import SignLanguageAnimation
    from app.sign_language.engine import get_engine

    engine_data = get_engine()
    if not engine_data.catalogs:
        logger.warning("No sign-language catalogs found; skipping seed")
        return

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        created = 0
        updated = 0
        for language, catalog in engine_data.catalogs.items():
            for entry in catalog.entries:
                existing = db.scalar(
                    select(SignLanguageAnimation).where(
                        SignLanguageAnimation.sign_language == language,
                        SignLanguageAnimation.gloss == entry.gloss,
                    )
                )
                if existing is None:
                    db.add(
                        SignLanguageAnimation(
                            sign_language=language,
                            gloss=entry.gloss,
                            label=entry.label,
                            category=entry.category,
                            description=entry.description,
                            aliases=entry.aliases,
                            animation_data=entry.animation.model_dump(mode="json"),
                            is_verified=entry.verified,
                            source=entry.source or catalog.source,
                            version=catalog.version,
                        )
                    )
                    created += 1
                else:
                    existing.label = entry.label
                    existing.category = entry.category
                    existing.description = entry.description
                    existing.aliases = entry.aliases
                    existing.animation_data = entry.animation.model_dump(mode="json")
                    existing.is_verified = entry.verified
                    existing.source = entry.source or catalog.source
                    existing.version = catalog.version
                    updated += 1
        db.commit()
        logger.info(
            "Sign lexicon ready: %s languages, %s created, %s updated",
            len(engine_data.catalogs),
            created,
            updated,
        )
    except Exception:  # pragma: no cover - defensive startup guard
        db.rollback()
        logger.exception("Failed to seed sign-language animations")
        raise
    finally:
        db.close()
