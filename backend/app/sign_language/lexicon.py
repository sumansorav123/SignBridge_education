from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent / "data"

HANDSHAPES = {
    "open",
    "flat",
    "fist",
    "point",
    "peace",
    "thumbs_up",
    "thumbs_down",
    "cup",
    "pinch",
    "claw",
    "l_shape",
    "y_shape",
    "hooked",
    "one",
    "two",
    "three",
    "four",
    "five",
}
LOCATIONS = {
    "chest",
    "forehead",
    "chin",
    "mouth",
    "shoulder",
    "right_side",
    "left_side",
    "waist",
    "neutral",
    "forward",
    "head_top",
    "ear",
}
MOVEMENTS = {
    "static",
    "up",
    "down",
    "left",
    "right",
    "forward",
    "back",
    "wave",
    "circle",
    "arc",
    "shake",
    "twist",
    "open_close",
    "approach",
    "away",
    "tap",
}
FACES = {"neutral", "smile", "sad", "question", "surprise", "focus", "frown"}
HEADS = {"neutral", "nod", "shake", "tilt_left", "tilt_right", "forward"}
BODIES = {"neutral", "lean_forward", "lean_left", "lean_right"}
PALMS = {"forward", "inward", "down", "up", "left", "right", "self"}


class HandSpec(BaseModel):
    hand: str = Field(pattern="^(right|left)$")
    handshape: str
    location: str
    movement: str = "static"
    repetitions: int = Field(default=1, ge=1, le=4)
    palm: str = "forward"

    @field_validator("handshape")
    @classmethod
    def _handshape(cls, value: str) -> str:
        if value not in HANDSHAPES:
            raise ValueError(f"Unknown handshape: {value}")
        return value

    @field_validator("location")
    @classmethod
    def _location(cls, value: str) -> str:
        if value not in LOCATIONS:
            raise ValueError(f"Unknown location: {value}")
        return value

    @field_validator("movement")
    @classmethod
    def _movement(cls, value: str) -> str:
        if value not in MOVEMENTS:
            raise ValueError(f"Unknown movement: {value}")
        return value

    @field_validator("palm")
    @classmethod
    def _palm(cls, value: str) -> str:
        if value not in PALMS:
            raise ValueError(f"Unknown palm orientation: {value}")
        return value


class AnimationSpec(BaseModel):
    duration_ms: int = Field(default=1000, ge=250, le=4000)
    hands: list[HandSpec] = Field(default_factory=list, min_length=1, max_length=2)
    face: str = "neutral"
    head: str = "neutral"
    body: str = "neutral"
    notes: str | None = None

    @field_validator("face")
    @classmethod
    def _face(cls, value: str) -> str:
        if value not in FACES:
            raise ValueError(f"Unknown face expression: {value}")
        return value

    @field_validator("head")
    @classmethod
    def _head(cls, value: str) -> str:
        if value not in HEADS:
            raise ValueError(f"Unknown head movement: {value}")
        return value

    @field_validator("body")
    @classmethod
    def _body(cls, value: str) -> str:
        if value not in BODIES:
            raise ValueError(f"Unknown body movement: {value}")
        return value


class LexiconEntry(BaseModel):
    gloss: str
    label: str
    category: str = "general"
    aliases: list[str] = Field(default_factory=list)
    description: str | None = None
    animation: AnimationSpec
    verified: bool = False
    # experimental = animation built from a description, not reviewed by an interpreter.
    # interpreter_reviewed = requires reviewed_by + reviewed_at evidence.
    review_status: Literal["experimental", "interpreter_reviewed"] = "experimental"
    reviewed_by: str | None = None
    reviewed_at: str | None = None
    source: str | None = None

    @model_validator(mode="after")
    def _enforce_review_evidence(self) -> "LexiconEntry":
        # A sign is only 'verified' when real reviewer evidence is attached.
        has_evidence = bool(self.reviewed_by and self.reviewed_at)
        if self.review_status == "interpreter_reviewed" and has_evidence:
            self.verified = True
        else:
            self.verified = False
            self.review_status = "experimental"
        return self

    @field_validator("gloss")
    @classmethod
    def _gloss(cls, value: str) -> str:
        cleaned = value.strip().upper().replace(" ", "-")
        if not re.fullmatch(r"[A-Z0-9\-']{1,80}", cleaned):
            raise ValueError("Gloss must contain only letters, numbers, hyphens and apostrophes")
        return cleaned


class Catalog(BaseModel):
    language: str
    name: str
    version: str = "1.0"
    source: str | None = None
    note: str | None = None
    entries: list[LexiconEntry]

    _alias_index: dict[str, LexiconEntry] | None = None

    def model_post_init(self, __context: Any) -> None:
        self._alias_index = self._build_alias_index()

    def _build_alias_index(self) -> dict[str, LexiconEntry]:
        index: dict[str, LexiconEntry] = {}
        for entry in self.entries:
            candidates = [entry.gloss.replace("-", " "), entry.label, *entry.aliases]
            for candidate in candidates:
                key = normalize_alias(candidate)
                if key and key not in index:
                    index[key] = entry
        return index

    @property
    def alias_index(self) -> dict[str, LexiconEntry]:
        if self._alias_index is None:
            self._alias_index = self._build_alias_index()
        return self._alias_index

    @property
    def max_phrase_tokens(self) -> int:
        return max((len(key.split()) for key in self.alias_index), default=1)


def normalize_alias(value: str) -> str:
    value = value.lower().replace("_", " ").replace("-", " ")
    for contraction, expansion in CONTRACTIONS.items():
        value = re.sub(rf"\b{re.escape(contraction)}\b", expansion, value)
    value = re.sub(r"[^a-z0-9' ]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


CONTRACTIONS = {
    "don't": "do not",
    "dont": "do not",
    "doesn't": "does not",
    "didn't": "did not",
    "can't": "cannot",
    "cant": "cannot",
    "won't": "will not",
    "isn't": "is not",
    "aren't": "are not",
    "i'm": "i am",
    "im": "i am",
    "it's": "it is",
    "that's": "that is",
    "we're": "we are",
    "they're": "they are",
    "you're": "you are",
    "i've": "i have",
    "we've": "we have",
}

STOPWORDS = {
    "a",
    "an",
    "the",
    "is",
    "am",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "of",
    "to",
    "do",
    "does",
    "did",
    "will",
    "would",
    "shall",
    "should",
    "has",
    "have",
    "had",
    "can",
    "could",
    "may",
    "might",
    "must",
    "this",
    "that",
    "these",
    "those",
    "and",
    "or",
    "but",
    "so",
    "there",
    "here",
    "very",
    "just",
    "it",
}


def load_catalogs(data_dir: Path = DATA_DIR) -> dict[str, Catalog]:
    catalogs: dict[str, Catalog] = {}
    if not data_dir.exists():
        logger.warning("Sign language data directory not found: %s", data_dir)
        return catalogs
    for path in sorted(data_dir.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            catalog = Catalog.model_validate(payload)
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.error("Invalid sign catalog %s: %s", path.name, exc)
            continue
        catalogs[catalog.language] = catalog
        logger.info(
            "Loaded %s sign catalog: %s entries (%s verified)",
            catalog.language,
            len(catalog.entries),
            sum(1 for e in catalog.entries if e.verified),
        )
    return catalogs
