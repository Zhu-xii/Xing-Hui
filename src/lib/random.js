function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function randomBetween(min, max) {
  const lower = finiteNumber(min);
  const upper = finiteNumber(max, lower);
  const start = Math.min(lower, upper);
  const end = Math.max(lower, upper);
  return start + Math.random() * (end - start);
}

export function randomInt(min, max) {
  const lower = Math.ceil(Math.min(finiteNumber(min), finiteNumber(max)));
  const upper = Math.floor(Math.max(finiteNumber(min), finiteNumber(max)));
  if (upper < lower) return lower;
  return lower + Math.floor(Math.random() * (upper - lower + 1));
}

export function randomChance(percent) {
  const probability = Math.min(100, Math.max(0, finiteNumber(percent)));
  if (probability <= 0) return false;
  if (probability >= 100) return true;
  return Math.random() * 100 < probability;
}

export function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}