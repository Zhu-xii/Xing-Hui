import { pickRandom, randomBetween, randomChance } from './random.js';
import {
  CARD_STORAGE_KEY,
  DEFAULT_GROUP_ID,
  SETTINGS_KEY,
  STICKER_STORAGE_KEY,
  normalizeSettings,
  readCards,
  readSettings,
  readStickers,
} from './storage.js';
import {
  addChatMessage,
  markChatMessageRead,
  setStarTyping,
  STAR_REPLY_TRIGGER_EVENT,
} from '../views/chat.js';

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

export function createReplyPayload({ settings, cards, stickers } = {}) {
  const options = normalizeSettings(settings || readSettings());

  // 已读不回是最高优先级：命中后不产生任何星回消息。
  if (options.readNoReplyEnabled && randomChance(options.readNoReply)) return null;

  let type = 'text';
  let content = '';

  const availableStickers = getEnabledStickers(
    stickers === undefined ? readStickers() : stickers,
  );
  if (availableStickers.length > 0 && randomChance(options.stickerReply)) {
    const sticker = pickRandom(availableStickers);
    type = 'sticker';
    content = sticker.storage === 'indexeddb' ? `idb:${sticker.id}` : sticker.image;
  } else {
    const availableCards = getAvailableCards(
      options.currentGroupId,
      cards === undefined ? readCards() : cards,
    );
    const card = pickRandom(availableCards);
    content = card?.content || FALLBACK_REPLY;
  }

  return {
    role: 'star',
    type,
    content,
    timestamp: Date.now(),
    read: false,
    favorited: false,
    starFavorited: randomChance(options.starFavorite),
  };
}

export async function scheduleStarReply(
  userMessage,
  {
    settings = readSettings(),
    wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
    onTypingChange = setStarTyping,
    createPayload = createReplyPayload,
    addMessage = addChatMessage,
    markRead = markChatMessageRead,
  } = {},
) {
  const options = normalizeSettings(settings);
  const delayMs = getReplyDelayMs(options);
  let typingShown = false;

  if (options.typingIndicator) {
    onTypingChange(true);
    typingShown = true;
  }

  try {
    await wait(delayMs);
    if (userMessage?.id) markRead(userMessage.id);

    const payload = createPayload({ settings: options });
    if (!payload) return null;

    payload.turnId = userMessage?.turnId || '';
    payload.sequence = 0;

    return addMessage(payload, { persist: true, scroll: true });
  } finally {
    if (typingShown) onTypingChange(false);
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
