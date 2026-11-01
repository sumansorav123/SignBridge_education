from __future__ import annotations

from pydantic import BaseModel


class Language(BaseModel):
    code: str
    name: str
    native_name: str
    speech_code: str
    rtl: bool = False


SUPPORTED_LANGUAGES: list[Language] = [
    Language(code="en", name="English", native_name="English", speech_code="en-IN"),
    Language(code="hi", name="Hindi", native_name="हिन्दी", speech_code="hi-IN"),
    Language(code="ta", name="Tamil", native_name="தமிழ்", speech_code="ta-IN"),
    Language(code="te", name="Telugu", native_name="తెలుగు", speech_code="te-IN"),
    Language(code="bn", name="Bengali", native_name="বাংলা", speech_code="bn-IN"),
    Language(code="as", name="Assamese", native_name="অসমীয়া", speech_code="as-IN"),
    Language(code="ml", name="Malayalam", native_name="മലയാളം", speech_code="ml-IN"),
    Language(code="kn", name="Kannada", native_name="ಕನ್ನಡ", speech_code="kn-IN"),
    Language(code="mr", name="Marathi", native_name="मराठी", speech_code="mr-IN"),
    Language(code="gu", name="Gujarati", native_name="ગુજરાતી", speech_code="gu-IN"),
    Language(code="pa", name="Punjabi", native_name="ਪੰਜਾਬੀ", speech_code="pa-IN"),
    Language(code="fr", name="French", native_name="Français", speech_code="fr-FR"),
    Language(code="es", name="Spanish", native_name="Español", speech_code="es-ES"),
]

LANGUAGE_BY_CODE: dict[str, Language] = {language.code: language for language in SUPPORTED_LANGUAGES}


def get_language(code: str) -> Language | None:
    return LANGUAGE_BY_CODE.get((code or "").lower())


def is_supported(code: str) -> bool:
    return (code or "").lower() in LANGUAGE_BY_CODE
