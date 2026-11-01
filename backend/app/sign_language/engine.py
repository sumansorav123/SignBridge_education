from __future__ import annotations

import re
import threading
import time
from pathlib import Path
from typing import Any

from app.sign_language.lexicon import (
    CONTRACTIONS,
    DATA_DIR,
    STOPWORDS,
    Catalog,
    LexiconEntry,
    load_catalogs,
    normalize_alias,
)

TIME_FRONTING_CATEGORIES = {"time"}


def _expand_contractions(text: str) -> str:
    result = text.lower()
    for contraction, expansion in CONTRACTIONS.items():
        result = re.sub(rf"\b{re.escape(contraction)}\b", expansion, result)
    return result


def _tokenize(text: str) -> list[str]:
    expanded = _expand_contractions(text)
    expanded = re.sub(r"[^\w\s'\-]", " ", expanded)
    return [token for token in re.split(r"[\s\-]+", expanded) if token]


class SignLanguageEngine:
    """Rule-based text → sign-gloss mapper.

    This module intentionally does not translate English word order into sign
    order. It performs phrase-level lookup, removes English function words,
    fronts time markers, and places question signs at the end (with a question
    facial expression). Unknown tokens are flagged for a text fallback rather
    than being animated with an invented gesture.
    """

    def __init__(self, data_dir: Path = DATA_DIR) -> None:
        self.catalogs: dict[str, Catalog] = load_catalogs(data_dir)
        self._lock = threading.Lock()
        self._last_reload = time.time()

    def reload(self, data_dir: Path = DATA_DIR) -> None:
        with self._lock:
            self.catalogs = load_catalogs(data_dir)
            self._last_reload = time.time()

    def get_catalog(self, language: str) -> Catalog | None:
        return self.catalogs.get((language or "").lower())

    def list_languages(self) -> list[dict[str, Any]]:
        return [
            {
                "language": catalog.language,
                "name": catalog.name,
                "version": catalog.version,
                "verified_count": sum(1 for entry in catalog.entries if entry.verified),
                "total_count": len(catalog.entries),
                "experimental_count": sum(1 for entry in catalog.entries if not entry.verified),
                "note": catalog.note or "",
            }
            for catalog in self.catalogs.values()
        ]

    def _lookup(self, catalog: Catalog, token: str) -> LexiconEntry | None:
        direct = catalog.alias_index.get(token)
        if direct:
            return direct
        if token.endswith("ies") and len(token) > 4:
            candidate = catalog.alias_index.get(token[:-3] + "y")
            if candidate:
                return candidate
        for suffix in ("ing", "ed", "es", "s"):
            if token.endswith(suffix) and len(token) > len(suffix) + 2:
                candidate = catalog.alias_index.get(token[: -len(suffix)])
                if candidate:
                    return candidate
        return None

    def convert(self, text: str, language: str = "isl") -> dict[str, Any]:
        catalog = self.get_catalog(language)
        if catalog is None:
            raise ValueError(f"No sign-language catalog configured for '{language}'")

        tokens = _tokenize(text)
        max_phrase = catalog.max_phrase_tokens
        units: list[dict[str, Any]] = []
        phrase_matches: list[str] = []
        rules: set[str] = set()
        index = 0

        while index < len(tokens):
            matched: LexiconEntry | None = None
            matched_size = 1
            for size in range(min(max_phrase, len(tokens) - index), 0, -1):
                phrase = " ".join(tokens[index : index + size])
                entry = catalog.alias_index.get(phrase)
                if entry:
                    matched = entry
                    matched_size = size
                    if size > 1:
                        phrase_matches.append(phrase)
                        rules.add("Phrase-level mapping applied for multi-word signs")
                    break

            if matched is None:
                matched = self._lookup(catalog, tokens[index])

            if matched is not None:
                units.append(
                    {
                        "entry": matched,
                        "token": " ".join(tokens[index : index + matched_size]),
                        "raw": tokens[index],
                    }
                )
            else:
                raw = tokens[index]
                if raw not in STOPWORDS:
                    units.append({"entry": None, "token": raw, "raw": raw})
                else:
                    rules.add("English function words removed")
            index += matched_size

        glosses: list[dict[str, Any]] = []
        unsupported: list[str] = []
        for unit in units:
            entry: LexiconEntry | None = unit["entry"]
            if entry is None:
                unsupported.append(unit["raw"])
                glosses.append(
                    {
                        "gloss": unit["raw"].upper(),
                        "label": unit["raw"],
                        "token": unit["raw"],
                        "available": False,
                        "animation_id": None,
                        "animation": None,
                        "category": None,
                        "source": None,
                        "verified": False,
                        "review_status": "unsupported",
                    }
                )
            else:
                # Available = we hold animation data. Reviewed status is reported
                # separately so the UI can label experimental signs honestly.
                available = entry.animation is not None
                glosses.append(
                    {
                        "gloss": entry.gloss,
                        "label": entry.label,
                        "token": unit["token"],
                        "available": available,
                        "animation_id": None,
                        "animation": entry.animation.model_dump(mode="json") if available else None,
                        "category": entry.category,
                        "source": entry.source,
                        "verified": entry.verified,
                        "review_status": entry.review_status,
                    }
                )

        time_glosses = [g for g in glosses if g["category"] in TIME_FRONTING_CATEGORIES]
        if time_glosses and any(glosses.index(g) > 0 for g in time_glosses):
            others = [g for g in glosses if g["category"] not in TIME_FRONTING_CATEGORIES]
            glosses = time_glosses + others
            rules.add("Time signs moved to the start of the signed sentence")

        question_glosses = [g for g in glosses if g["category"] == "question"]
        if question_glosses:
            others = [g for g in glosses if g["category"] != "question"]
            glosses = others + question_glosses
            rules.add("Question signs placed at the end with a question facial expression")

        if any(g["gloss"] == "NOT" for g in glosses):
            rules.add("Negation retained as an explicit NOT sign")

        unique_unsupported: list[str] = []
        for token in unsupported:
            if token not in unique_unsupported:
                unique_unsupported.append(token)

        available_count = sum(1 for g in glosses if g["available"])
        coverage = round(available_count / len(glosses), 3) if glosses else 0.0
        fallback_message: str | None = None
        if unique_unsupported:
            quoted = ", ".join(f"'{word}'" for word in unique_unsupported)
            fallback_message = (
                f"No {catalog.name} sign is available for {quoted}. "
                "SignBridge shows a word card instead of generating an incorrect gesture."
            )

        if not glosses:
            fallback_message = "No signable content was detected in this caption."

        return {
            "language": catalog.language,
            "source_text": text,
            "glosses": glosses,
            "tokens": [g["gloss"] for g in glosses],
            "unsupported": unique_unsupported,
            "rules_applied": sorted(rules),
            "phrase_matches": sorted(set(phrase_matches)),
            "coverage": coverage,
            "verified_coverage": round(
                sum(1 for g in glosses if g.get("verified")) / len(glosses), 3
            ) if glosses else 0.0,
            "has_fallback": bool(unique_unsupported),
            "fallback_message": fallback_message,
            "grammar_note": (
                "Rule-based sign grammar approximation: phrase lookup, function-word removal, "
                "time-first ordering and wh-final questions. Validate with a certified "
                f"{catalog.name} interpreter before high-stakes use."
            ),
            "catalog_note": catalog.note,
        }

    def sign_dictionary(self, language: str) -> dict[str, dict[str, Any]]:
        catalog = self.get_catalog(language)
        if catalog is None:
            return {}
        return {
            entry.gloss: {
                "gloss": entry.gloss,
                "label": entry.label,
                "category": entry.category,
                "description": entry.description,
                "animation": entry.animation.model_dump(mode="json"),
                "verified": entry.verified,
                "review_status": entry.review_status,
                "source": entry.source,
            }
            for entry in catalog.entries
        }


_engine: SignLanguageEngine | None = None
_engine_lock = threading.Lock()


def get_engine() -> SignLanguageEngine:
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _engine = SignLanguageEngine()
    return _engine
