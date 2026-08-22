const OPENROUTER_KEY_STORAGE = 'llm_council_openrouter_key';

export async function getKeyStatus() {
  return { openrouter: Boolean(localStorage.getItem(OPENROUTER_KEY_STORAGE)) };
}

export function saveKey(apiKey) {
  const trimmedKey = apiKey.trim();
  if (trimmedKey) {
    localStorage.setItem(OPENROUTER_KEY_STORAGE, trimmedKey);
  } else {
    localStorage.removeItem(OPENROUTER_KEY_STORAGE);
  }
  return { openrouter: Boolean(trimmedKey) };
}

export function clearKey() {
  localStorage.removeItem(OPENROUTER_KEY_STORAGE);
}
