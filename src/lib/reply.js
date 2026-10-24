import { pickRandom, randomBetween, randomChance, randomInt } from './random.js';
import {
  CARD_STORAGE_KEY,
  DEFAULT_GROUP_ID,
  LETTER_GROUP_ID,
  REPLY_ALL_GROUPS_ID,
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
  CALL_CHECK_EVENT,
  addChatMessage,
  markChatMessageRead,
  setStarTyping,
  STAR_REPLY_TRIGGER_EVENT,
} from '../views/chat.js';
import { MULTI_REPLY_TAG, SPELL_CARD_TAG, joinSpellCards } from './spell-cards.js';

export {
  CARD_STORAGE_KEY,
  DEFAULT_GROUP_ID,
  REPLY_ALL_GROUPS_ID,
  SETTINGS_KEY,
  STICKER_STORAGE_KEY,
};

export const FALLBACK_REPLY = '嗯嗯';
const FALLBACK_REPLY_POOL = Object.freeze(['收到～', '好呀', '好～', '嗯嗯', '知道啦', '好哒', '嗯嗯，我在听']);
const EMOJI_REPLY_CHANCE = 5;
const IMAGE_REPLY_CHANCE = 5;
const KAOMOJI_REPLY_CHANCE = 5;

// 与 Mochi 相同：文字、颜文字、emoji 从内容本身判定，不新增分类设置或数据结构。
const CHAT_READABLE_RE = /[A-Za-z0-9\u4e00-\u9fff\u3041-\u3096\u30a1-\u30fa]/;
const CHAT_KAOMOJI_FACE_RE = /[｡◕‿・▽´｀￣﹏◠◡≧≦ω＾￢¬^•˙˘๑٩۶ฅヽノ]/;
const CHAT_BRACKET_SHELL_RE = /^[\s()（）[\]【】<>《》]+$/;

function isBracketedKaomojiCard(content) {
  return !CHAT_BRACKET_SHELL_RE.test(content)
    && /[\(（｡◕(◕)(づ｡(¬)]/.test(content)
    && /[\)）】)]/.test(content)
    && !(CHAT_READABLE_RE.test(content) && !CHAT_KAOMOJI_FACE_RE.test(content));
}

function isEmojiCard(content) {
  if (/[\uD800-\uDBFF]/.test(content)) return true;
  if (CHAT_READABLE_RE.test(content)) return false;
  if (isBracketedKaomojiCard(content) || CHAT_KAOMOJI_FACE_RE.test(content)) return false;
  for (const character of content) {
    const codePoint = character.codePointAt(0);
    if (
      (codePoint >= 0x1F000 && codePoint <= 0x1FAFF)
      || (codePoint >= 0x2600 && codePoint <= 0x27BF)
      || (codePoint >= 0x2B00 && codePoint <= 0x2BFF)
    ) return true;
  }
  return false;
}

function isKaomojiCard(content) {
  if (isBracketedKaomojiCard(content)) return true;
  if (CHAT_READABLE_RE.test(content)) return false;
  return CHAT_KAOMOJI_FACE_RE.test(content);
}

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
  const targetGroupId = String(groupId || REPLY_ALL_GROUPS_ID).trim() || REPLY_ALL_GROUPS_ID;
  const sourceCards = Array.isArray(cards) ? cards : [];

  return sourceCards
    .filter((card) => card && typeof card === 'object')
    .filter((card) => !card.disabled)
    .filter((card) => targetGroupId !== REPLY_ALL_GROUPS_ID || card.groupId !== LETTER_GROUP_ID)
    .filter((card) => (
      targetGroupId === REPLY_ALL_GROUPS_ID
      || String(card.groupId || '') === targetGroupId
    ))
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

function pickN(items, count) {
  const copy = items.slice();
  const picked = [];
  while (copy.length && picked.length < count) {
    picked.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return picked;
}

function pickNonBlank(items) {
  if (!Array.isArray(items) || !items.length) return '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const value = pickRandom(items);
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function normalizeReplyText(value) {
  return applyNicknamePlaceholders(String(value ?? '').trim());
}

function buildReplyPool(cards, stickers, images) {
  const text = [];
  const kaomoji = [];
  const emoji = [];

  cards.forEach((card) => {
    const content = String(card?.content || '').trim();
    if (!content) return;
    if (isEmojiCard(content)) emoji.push(content);
    else if (isKaomojiCard(content)) kaomoji.push(content);
    else text.push(content);
  });

  return { text, kaomoji, emoji, sticker: stickers, image: images };
}

function replySignature(payload) {
  if (!payload) return '';
  const content = String(payload.content || '');
  return `${payload.type || 'text'}|${content.length}|${content.slice(0, 160)}|${content.slice(-64)}`;
}

let lastReplySignature = '';

function drawSingleReply(options, pool) {
  const stickerHit = pool.sticker.length > 0 && randomChance(options.stickerReply);
  const imageHit = pool.image.length > 0 && randomChance(IMAGE_REPLY_CHANCE);

  if (stickerHit) {
    const payload = stickerPayload(options, pickRandom(pool.sticker));
    if (payload) return payload;
  }

  if (pool.emoji.length && randomChance(EMOJI_REPLY_CHANCE)) {
    const content = pickNonBlank(pool.emoji);
    if (content) return createPayload(options, { content: normalizeReplyText(content) });
  }

  if (imageHit) {
    const payload = stickerPayload(options, pickRandom(pool.image));
    if (payload) return payload;
  }

  if (pool.text.length) {
    let content = normalizeReplyText(pickNonBlank(pool.text));
    if (content) {
      // Mochi 的普通文字回复会按颜文字概率追加一张颜文字卡，仍放在同一条文字消息里。
      if (options.spellCardEnabled && pool.kaomoji.length && randomChance(KAOMOJI_REPLY_CHANCE)) {
        const kaomoji = normalizeReplyText(pickNonBlank(pool.kaomoji));
        if (kaomoji) content += ` ${kaomoji}`;
      }
      return createPayload(options, { content });
    }
  }

  // 本地没有系统内置卡兜底；只有符号卡时仍从现有卡里出，不退化成固定空回复。
  const fallbackCard = pickNonBlank(pool.kaomoji) || pickNonBlank(pool.emoji);
  if (fallbackCard) return createPayload(options, { content: normalizeReplyText(fallbackCard) });

  return createPayload(options, { content: pickRandom(FALLBACK_REPLY_POOL) || FALLBACK_REPLY });
}

function drawSingleReplyWithReroll(options, pool) {
  let payload = drawSingleReply(options, pool);
  let signature = replySignature(payload);

  // 对齐 Mochi genOneReply：与上一条完全相同时，再抽一次；池子太小则接受重复。
  if (signature && signature === lastReplySignature) {
    const alternate = drawSingleReply(options, pool);
    const alternateSignature = replySignature(alternate);
    if (alternateSignature && alternateSignature !== signature) {
      payload = alternate;
      signature = alternateSignature;
    }
  }

  lastReplySignature = signature;
  return payload;
}

function drawMultiTextSegments(options, pool) {
  if (pool.text.length < 2) return [];
  const maxCount = Math.min(options.spellCardMax, pool.text.length);
  const minCount = Math.min(maxCount, Math.max(1, options.spellCardMin));
  const count = randomInt(minCount, maxCount);
  let segments = pickN(pool.text, count).map(normalizeReplyText).filter(Boolean);
  if (segments.length < 2) return [];

  const signature = `multi|${segments.join('\u0001')}`;
  if (signature === lastReplySignature) {
    segments = pickN(pool.text, count).map(normalizeReplyText).filter(Boolean);
  }
  lastReplySignature = `multi|${segments.join('\u0001')}`;
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
    options.replyGroupId,
    cards === undefined ? readCards() : cards,
  );
  const availableStickers = getEnabledStickers(
    stickers === undefined ? readStickers() : stickers,
  );
  // 「图片」字卡与表情包共用同一发送管线。
  const availableImages = getEnabledStickers(readImages());
  const pool = buildReplyPool(availableCards, availableStickers, availableImages);

  if (
    options.spellCardEnabled
    && pool.text.length >= 2
    && randomChance(options.spellCardChance)
  ) {
    // 「连发时也拼接」：连发 N 条，每条各自拼接 1 组字卡。
    if (options.spellCardMode === 'each') {
      const messageCount = options.multiReplyEnabled
        ? randomInt(options.multiReplyMin, options.multiReplyMax)
        : 1;
      const joined = [];
      for (let index = 0; index < messageCount; index += 1) {
        const segments = drawMultiTextSegments(options, pool);
        const content = joinSpellCards(segments, options);
        if (!content) continue;
        const payload = createPayload(options, { content, tag: SPELL_CARD_TAG });
        payload.timestamp = Date.now() + index;
        joined.push(payload);
      }
      if (joined.length) return joined;
    }

    const segments = drawMultiTextSegments(options, pool);
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
  const payloads = [];
  for (let index = 0; index < payloadCount; index += 1) {
    const payload = drawSingleReplyWithReroll(options, pool);
    if (payload) {
      payload.tag = payloadCount > 1 ? MULTI_REPLY_TAG : '';
      payload.timestamp = Date.now() + index;
      payloads.push(payload);
    }
  }

  return payloads.length ? payloads : [createPayload(options, { content: pickRandom(FALLBACK_REPLY_POOL) || FALLBACK_REPLY })];
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
        // 对齐远端新增的 turnId / sequence 字段
        payload.turnId = userMessage?.turnId || '';
        payload.sequence = index;
      }
      added.push(addMessage(payload, { persist: true, scroll: true }));
    }

    if (added.length && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CALL_CHECK_EVENT, { detail: { messages: added } }));
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
