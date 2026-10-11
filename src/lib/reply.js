import { pickRandom, randomBetween, randomChance, randomInt } from './random.js';
import {
  CARD_STORAGE_KEY,
  DEFAULT_GROUP_ID,
  SETTINGS_KEY,
  STICKER_STORAGE_KEY,
  applyNicknamePlaceholders,
  normalizeSettings,
  readCards,
  readImages,
  readRoasts,
  readSettings,
  readStickers,
  updateSettings,
} from './storage.js';
import {
  addChatMessage,
  markChatMessageRead,
  setStarTyping,
  STAR_REPLY_TRIGGER_EVENT,
} from '../views/chat.js';
import { MULTI_REPLY_TAG, SPELL_CARD_TAG, joinSpellCards } from './spell-cards.js';

export {
  CARD_STORAGE_KEY,
  DEFAULT_GROUP_ID,
  SETTINGS_KEY,
  STICKER_STORAGE_KEY,
};

export const FALLBACK_REPLY = '嗯嗯';
export const DEFAULT_REPLY_SETTINGS = Object.freeze({
  replyDelayMin: 1,
  replyDelayMax: 3,
  typingIndicator: true,
  readNoReplyEnabled: true,
  readNoReply: 15,
  stickerReply: 10,
  starFavorite: 5,
  patReply: 70,
});

let initialized = false;

// 连发多条时，上一条落地后先留一小段“在线”间隙，再重新显示“正在输入…”（对齐 mochi addInTyped 的节奏）
const MULTI_REPLY_BEAT_MS = 360;

// 「他的吐槽」：星回偶尔主动吐槽一句，受总冷却限制。
export const ROAST_TAG = '他的吐槽';
const ROAST_FALLBACK = [
  '你今天是不是又熬夜了，黑眼圈都快掉到下巴了。',
  '说好的早睡呢，怎么还在这儿玩手机。',
  '突然想吐槽你一句：你是不是又想我了。',
  '别光顾着笑，我说的就是你。',
];

let lastRoastAt = 0;

function maybeCreateRoastPayload(options, now = Date.now()) {
  if (!options.roastEnabled) return null;
  const gap = Math.max(0, Number(options.roastIntervalMinutes) || 0) * 60 * 1000;
  const last = Math.max(lastRoastAt, Number(options.lastRoastAt) || 0);
  if (gap > 0 && now - last < gap) return null;
  if (!randomChance(options.roastProbability)) return null;

  const card = pickRandom(readRoasts())?.content;
  const content = applyNicknamePlaceholders(String(card || pickRandom(ROAST_FALLBACK) || '').trim());
  if (!content) return null;

  lastRoastAt = now;
  updateSettings({ lastRoastAt: now });
  return createPayload(options, { content, tag: ROAST_TAG });
}

export const readReplySettings = readSettings;
export const normalizeReplySettings = normalizeSettings;

export function getReplyDelayMs(settings = readSettings()) {
  const options = normalizeSettings(settings);
  return Math.round(randomBetween(options.replyDelayMin, options.replyDelayMax) * 1000);
}

export function getAvailableCards(groupId, cards = readCards()) {
  const targetGroupId = String(groupId || DEFAULT_GROUP_ID).trim() || DEFAULT_GROUP_ID;
  const sourceCards = Array.isArray(cards) ? cards : [];

  return sourceCards
    .filter((card) => card && typeof card === 'object')
    .filter((card) => !card.disabled)
    .filter((card) => String(card.groupId || '') === targetGroupId)
    .map((card) => ({ ...card, content: typeof card.content === 'string' ? card.content.trim() : '' }))
    .filter((card) => card.content);
}

export function getEnabledStickers(stickers = readStickers()) {
  const sourceStickers = Array.isArray(stickers) ? stickers : [];

  return sourceStickers
    .filter((sticker) => sticker && typeof sticker === 'object' && sticker.enabled !== false)
    .map((sticker) => {
      const image = String(sticker.image || sticker.content || sticker.src || '').trim();
      return { ...sticker, image };
    })
    .filter((sticker) => sticker.image || (sticker.storage === 'indexeddb' && sticker.id));
}

function shuffle(items) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = randomInt(0, index);
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

// 同一批拼字优先抽不同字卡；张数超过去重后数量时允许复用，但绝不让相邻两张重复。
function pickUniqueTextCards(cards, count) {
  const texts = cards.map((card) => applyNicknamePlaceholders(card.content)).filter(Boolean);
  if (!texts.length) return [];

  const uniquePool = Array.from(new Set(texts));
  const segments = [];
  let last = '';

  for (let index = 0; index < count; index += 1) {
    const unused = uniquePool.filter((text) => !segments.includes(text));
    let candidates = (unused.length ? unused : uniquePool).filter((text) => text !== last);
    if (!candidates.length) candidates = texts.filter((text) => text !== last);
    if (!candidates.length) candidates = uniquePool;
    const picked = pickRandom(candidates);
    if (!picked) break;
    segments.push(picked);
    last = picked;
  }

  return segments;
}

function createPayload(options, { type = 'text', content = '', tag = '' } = {}) {
  return {
    role: 'star',
    type,
    content,
    tag,
    timestamp: Date.now(),
    read: false,
    favorited: false,
    starFavorited: false,
  };
}

function stickerPayload(options, sticker) {
  if (!sticker) return null;
  return createPayload(options, {
    type: 'sticker',
    content: sticker.storage === 'indexeddb' ? `idb:${sticker.id}` : sticker.image,
  });
}

export function createReplyBatch({ settings, cards, stickers } = {}) {
  const options = normalizeSettings(settings || readSettings());

  // 已读不回是最高优先级：命中后不产生任何星回消息。
  if (options.readNoReplyEnabled && randomChance(options.readNoReply)) return [];

  // 「他的吐槽」：命中时星回主动吐槽一句。
  const roastPayload = maybeCreateRoastPayload(options);
  if (roastPayload) return [roastPayload];

  const availableCards = getAvailableCards(
    options.currentGroupId,
    cards === undefined ? readCards() : cards,
  );
  const availableStickers = getEnabledStickers(
    stickers === undefined ? readStickers() : stickers,
  );
  // 「图片」字卡与表情包共用同一发送管线。
  const availableImages = getEnabledStickers(readImages());
  const availableMedia = [...availableStickers, ...availableImages];

  if (
    options.spellCardEnabled
    && availableCards.length >= 2
    && randomChance(options.spellCardChance)
  ) {
    const maxCount = Math.min(options.spellCardMax, availableCards.length);
    const count = randomInt(Math.min(options.spellCardMin, maxCount), maxCount);

    // 「连发时也拼接」：连发 N 条，每条各自拼接 1 组字卡。
    if (options.spellCardMode === 'each') {
      const messageCount = options.multiReplyEnabled
        ? randomInt(options.multiReplyMin, options.multiReplyMax)
        : 1;
      const joined = [];
      for (let index = 0; index < messageCount; index += 1) {
        const segments = pickUniqueTextCards(availableCards, count);
        const content = joinSpellCards(segments, options);
        if (!content) continue;
        const payload = createPayload(options, { content, tag: SPELL_CARD_TAG });
        payload.timestamp = Date.now() + index;
        joined.push(payload);
      }
      if (joined.length) return joined;
    }

    const segments = pickUniqueTextCards(availableCards, count);
    if (segments.length >= 2) {
      if (options.spellCardMode === 'split') {
        return segments.map((content, index) => {
          const payload = createPayload(options, { content, tag: SPELL_CARD_TAG });
          payload.timestamp = Date.now() + index;
          return payload;
        });
      }
      return [createPayload(options, { content: joinSpellCards(segments, options), tag: SPELL_CARD_TAG })];
    }
  }

  const payloadCount = options.multiReplyEnabled
    ? randomInt(options.multiReplyMin, options.multiReplyMax)
    : 1;
  const textDeck = shuffle(availableCards);
  const payloads = [];
  for (let index = 0; index < payloadCount; index += 1) {
    const canSendSticker = availableMedia.length > 0 && randomChance(options.stickerReply);
    const payload = canSendSticker
      ? stickerPayload(options, pickRandom(availableMedia))
      : createPayload(options, {
          content: applyNicknamePlaceholders(textDeck[index % Math.max(1, textDeck.length)]?.content || FALLBACK_REPLY),
          tag: payloadCount > 1 ? MULTI_REPLY_TAG : '',
        });
    if (payload) {
      payload.timestamp = Date.now() + index;
      payloads.push(payload);
    }
  }

  return payloads.length ? payloads : [createPayload(options, { content: FALLBACK_REPLY })];
}

export function createReplyPayload(options = {}) {
  return createReplyBatch(options)[0] || null;
}

export async function scheduleStarReply(
  userMessage,
  {
    settings = readSettings(),
    wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
    onTypingChange = setStarTyping,
    createPayload = createReplyBatch,
    addMessage = addChatMessage,
    markRead = markChatMessageRead,
  } = {},
) {
  const options = normalizeSettings(settings);
  const delayMs = getReplyDelayMs(options);
  let typingShown = false;

  const showTyping = () => {
    if (!options.typingIndicator || typingShown) return;
    onTypingChange(true);
    typingShown = true;
  };
  const hideTyping = () => {
    if (!typingShown) return;
    onTypingChange(false);
    typingShown = false;
  };

  try {
    showTyping();
    await wait(delayMs);
    if (userMessage?.id) markRead(userMessage.id);

    const generated = createPayload({ settings: options });
    const payloads = (Array.isArray(generated) ? generated : [generated]).filter(Boolean);
    if (!payloads.length) return null;

    const added = [];
    let lastSentAt = 0;
    for (let index = 0; index < payloads.length; index += 1) {
      if (index > 0) {
        // 上一条已落地：先保持“在线”一小会儿，再重新显示“对方正在输入…”等待下一条。
        await wait(MULTI_REPLY_BEAT_MS);
        showTyping();
        await wait(randomBetween(options.multiReplyGapMin, options.multiReplyGapMax) * 1000);
      }
      hideTyping();

      // 时间戳按真实发送时刻单调递增，保证追加顺序与显示时间一致。
      const payload = payloads[index];
      if (payload) {
        payload.timestamp = Math.max(Date.now(), lastSentAt + 1);
        lastSentAt = payload.timestamp;
      }
      added.push(addMessage(payload, { persist: true, scroll: true }));
    }

    return added.length === 1 ? added[0] : added;
  } finally {
    hideTyping();
  }
}

export function initReplyEngine() {
  if (initialized || typeof window === 'undefined') return false;

  window.addEventListener(STAR_REPLY_TRIGGER_EVENT, (event) => {
    const message = event.detail?.message;
    if (!message) return;
    void scheduleStarReply(message);
  });

  initialized = true;
  return true;
}
