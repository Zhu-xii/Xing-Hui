import { pickRandom, randomBetween } from './random.js';
import {
  MOOD_CACHE_KEY,
  STATUS_CATEGORY_NAME,
  hasManageCategory,
  readJson,
  readStatuses,
  writeJson,
} from './storage.js';

const HOUR_MS = 60 * 60 * 1000;

function chooseStatus(entries, previous) {
  const pool = entries.length > 1 && previous
    ? entries.filter((item) => item.content !== previous)
    : entries;
  return pickRandom(pool)?.content || '';
}

function statusSource() {
  if (hasManageCategory(STATUS_CATEGORY_NAME)) {
    return { entries: readStatuses() };
  }
  return { entries: [], missing: true };
}

export function getCurrentStatus({ force = false, now = Date.now() } = {}) {
  const source = statusSource();
  if (source.missing) return { text: '还没有设置状态', missing: true, rebuilt: false };
  if (!source.entries.length) return { text: '还没有设置状态', empty: true, rebuilt: false };

  const current = readJson(MOOD_CACHE_KEY, null);
  const currentText = current && typeof current.text === 'string' ? current.text : '';
  const expiresAt = Number(current?.expiresAt) || 0;
  const stillValid = currentText
    && source.entries.some((item) => item.content === currentText)
    && expiresAt > now;

  if (!force && stillValid) return { text: currentText, expiresAt, rebuilt: false };

  const text = chooseStatus(source.entries, currentText);
  const nextExpiresAt = now + Math.round(randomBetween(1, 5) * HOUR_MS);
  writeJson(MOOD_CACHE_KEY, { text, selectedAt: now, expiresAt: nextExpiresAt });
  return { text, expiresAt: nextExpiresAt, rebuilt: true };
}

export function maybeChangeStatus(chance = 0.35, now = Date.now()) {
  if (Math.random() < chance) return getCurrentStatus({ force: true, now });
  return getCurrentStatus({ now });
}
