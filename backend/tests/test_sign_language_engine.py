"""Engine/lexicon tests that need only pydantic (no DB, no FastAPI)."""
from __future__ import annotations

from app.sign_language.engine import SignLanguageEngine
from app.sign_language.lexicon import LexiconEntry

ANIMATION = {
    "duration_ms": 900,
    "hands": [
        {"hand": "right", "handshape": "open", "location": "chest", "movement": "static",
         "repetitions": 1, "palm": "forward"}
    ],
}


def test_no_entry_is_verified_without_reviewer_evidence() -> None:
    engine = SignLanguageEngine()
    catalog = engine.get_catalog("isl")
    assert catalog is not None and len(catalog.entries) == 100
    assert not any(entry.verified for entry in catalog.entries)
    assert all(entry.review_status == "experimental" for entry in catalog.entries)


def test_claiming_review_without_evidence_is_downgraded() -> None:
    entry = LexiconEntry(gloss="TEST", label="Test", animation=ANIMATION,
                         verified=True, review_status="interpreter_reviewed")
    assert entry.verified is False and entry.review_status == "experimental"


def test_review_with_evidence_is_verified() -> None:
    entry = LexiconEntry(gloss="TEST", label="Test", animation=ANIMATION,
                         review_status="interpreter_reviewed",
                         reviewed_by="Interpreter X", reviewed_at="2026-01-01")
    assert entry.verified is True


def test_convert_reports_experimental_and_unsupported() -> None:
    result = SignLanguageEngine().convert("hello zzyzx", "isl")
    by_gloss = {g["gloss"]: g for g in result["glosses"]}
    assert by_gloss["HELLO"]["available"] is True
    assert by_gloss["HELLO"]["animation"]["hands"]
    assert by_gloss["HELLO"]["review_status"] == "experimental"
    assert by_gloss["HELLO"]["verified"] is False
    assert by_gloss["ZZYZX"]["available"] is False
    assert by_gloss["ZZYZX"]["animation"] is None
    assert by_gloss["ZZYZX"]["review_status"] == "unsupported"
    assert result["verified_coverage"] == 0.0
    assert "ZZYZX".lower() in result["fallback_message"]
