export function normalizeModelName(modelName, fallback) {
  return typeof modelName === 'string' && modelName.trim() ? modelName : fallback;
}

export function displayModelName(modelName, fallback = 'Model') {
  const normalized = typeof modelName === 'string' && modelName.trim()
    ? modelName
    : String(modelName || fallback);
  return normalized.split('/')[1] || normalized;
}