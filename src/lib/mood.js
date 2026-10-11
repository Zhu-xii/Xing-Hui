import { pickRandom, randomBetween } from './random.js';
import {
  MOOD_CACHE_KEY,
  MOOD_CATEGORY_NAME,
  STATUS_CATEGORY_NAME,
  hasManageCategory,
  readJson,
  readMoods,
  readStatuses,
  writeJson,
} from './storage.js';

const HOUR_MS = 60 * 60 * 1000;

function chooseMood(entries, previous) {
  const pool = entries.length > 1 && previous
    ? entries.filter((item) => item.content !== previous)
    : entries;
  return pickRandom(pool)?.content || '';
}

// 「心情」字卡优先；旧的「状态」类别作为兜底，保证老数据仍可用。
function moodSource() {
  if (hasManageCategory(MOOD_CATEGORY_NAME)) {
    const moods = readMoods();
    if (moods.length) return { entries: moods };
  }
  if (hasManageCategory(STATUS_CATEGORY_NAME)) {
    return { entries: readStatuses() };
  }
  return { entries: [], missing: true };
}

export function getCurrentChatMood({ force = false, now = Date.now() } = {}) {
  const source = moodSource();
  if (source.missing) return { text: '请先到字卡页添加心情字卡', missing: true, rebuilt: false };
  if (!source.entries.length) return { text: '还没有设置心情', empty: true, rebuilt: false };

  const current = readJson(MOOD_CACHE_KEY, null);
  const currentText = current && typeof current.text === 'string' ? current.text : '';
  const expiresAt = Number(current?.expiresAt) || 0;
  const stillValid = currentText
    && source.entries.some((item) => item.content === currentText)
    && expiresAt > now;

  if (!force && stillValid) return { text: currentText, expiresAt, rebuilt: false };

  const text = chooseMood(source.entries, currentText);
  const nextExpiresAt = now + Math.round(randomBetween(1, 5) * HOUR_MS);
  writeJson(MOOD_CACHE_KEY, { text, selectedAt: now, expiresAt: nextExpiresAt });
  return { text, expiresAt: nextExpiresAt, rebuilt: true };
}

export function maybeChangeChatMood(chance = 0.35, now = Date.now()) {
  if (Math.random() < chance) return getCurrentChatMood({ force: true, now });
  return getCurrentChatMood({ now });
}
