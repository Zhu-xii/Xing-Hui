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

function chooseMood(statuses, previous) {
  const pool = statuses.length > 1 && previous
    ? statuses.filter((item) => item.content !== previous)
    : statuses;
  return pickRandom(pool)?.content || '';
}

export function getCurrentChatMood({ force = false, now = Date.now() } = {}) {
  const categoryExists = hasManageCategory(STATUS_CATEGORY_NAME);
  if (!categoryExists) return { text: '请先重建该类别', missing: true, rebuilt: false };

  const statuses = readStatuses();
  if (!statuses.length) return { text: '还没有设置状态', empty: true, rebuilt: false };

  const current = readJson(MOOD_CACHE_KEY, null);
  const currentText = current && typeof current.text === 'string' ? current.text : '';
  const expiresAt = Number(current?.expiresAt) || 0;
  const stillValid = currentText
    && statuses.some((item) => item.content === currentText)
    && expiresAt > now;

  if (!force && stillValid) return { text: currentText, expiresAt, rebuilt: false };

  const text = chooseMood(statuses, currentText);
  const nextExpiresAt = now + Math.round(randomBetween(1, 5) * HOUR_MS);
  writeJson(MOOD_CACHE_KEY, { text, selectedAt: now, expiresAt: nextExpiresAt });
  return { text, expiresAt: nextExpiresAt, rebuilt: true };
}

export function maybeChangeChatMood(chance = 0.35, now = Date.now()) {
  if (Math.random() < chance) return getCurrentChatMood({ force: true, now });
  return getCurrentChatMood({ now });
}
