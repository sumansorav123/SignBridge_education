export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', speech: 'en-IN' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', speech: 'hi-IN' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', speech: 'ta-IN' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', speech: 'te-IN' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', speech: 'bn-IN' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', speech: 'as-IN' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', speech: 'ml-IN' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', speech: 'kn-IN' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', speech: 'mr-IN' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', speech: 'gu-IN' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', speech: 'pa-IN' },
  { code: 'fr', name: 'French', native: 'Français', speech: 'fr-FR' },
  { code: 'es', name: 'Spanish', native: 'Español', speech: 'es-ES' },
]

export const LANGUAGE_MAP = Object.fromEntries(LANGUAGES.map((item) => [item.code, item]))

export function languageName(code, { native = false } = {}) {
  const language = LANGUAGE_MAP[code]
  if (!language) return code?.toUpperCase() || 'Unknown'
  return native ? language.native : language.name
}

export const SIGN_LANGUAGES = [
  {
    code: 'isl',
    name: 'Indian Sign Language',
    short: 'ISL',
    note: 'Curated starter lexicon. Certified interpreter review is recommended before high-stakes use.',
  },
]

export const LEARNING_MODES = {
  normal: {
    label: 'Hearing mode',
    short: 'Normal',
    description: 'Spoken lecture with optional captions and avatar.',
  },
  deaf: {
    label: 'Deaf mode',
    short: 'Deaf',
    description: 'Captions and the ISL avatar are always in view beside the teacher video.',
  },
}
