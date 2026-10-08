export const STORAGE_KEYS = Object.freeze({
  settings: 'xinghui_settings',
  cards: 'xinghui_cards',
  groups: 'xinghui_groups',
  stickers: 'xinghui_stickers',
  patCards: 'xinghui_pat_cards',
  questionnaireAnswers: 'xinghui_questionnaire_answers',
  statuses: 'xinghui_statuses',
  categoryMigration: 'xinghui_category_migration_v1',
  questionnaireDraft: 'xinghui_questionnaire_draft',
  promptQuestionnaires: 'xinghui_prompt_questionnaires',
  periodRecords: 'xinghui_period_records',
  moodCache: 'xinghui_chat_mood',
  chatMessages: 'xinghui_chat_messages',
  character: 'xinghui_character',
  firstLaunchAt: 'xinghui_first_launch_at',
  lastBackupAt: 'xinghui_last_backup_at',
});

export const SETTINGS_KEY = STORAGE_KEYS.settings;
export const CARD_STORAGE_KEY = STORAGE_KEYS.cards;
export const GROUP_STORAGE_KEY = STORAGE_KEYS.groups;
export const STICKER_STORAGE_KEY = STORAGE_KEYS.stickers;
export const PAT_CARD_STORAGE_KEY = STORAGE_KEYS.patCards;
export const QUESTIONNAIRE_ANSWER_STORAGE_KEY = STORAGE_KEYS.questionnaireAnswers;
export const STATUS_STORAGE_KEY = STORAGE_KEYS.statuses;
export const CATEGORY_MIGRATION_KEY = STORAGE_KEYS.categoryMigration;
export const QUESTIONNAIRE_DRAFT_KEY = STORAGE_KEYS.questionnaireDraft;
export const PROMPT_QUESTIONNAIRE_STORAGE_KEY = STORAGE_KEYS.promptQuestionnaires;
export const PERIOD_RECORD_STORAGE_KEY = STORAGE_KEYS.periodRecords;
export const MOOD_CACHE_KEY = STORAGE_KEYS.moodCache;
export const CHAT_STORAGE_KEY = STORAGE_KEYS.chatMessages;
export const CHARACTER_STORAGE_KEY = STORAGE_KEYS.character;
export const DEFAULT_GROUP_ID = 'group_default';
export const GREETING_GROUP_ID = 'group_greeting';
export const STICKER_GROUP_ID = 'group_stickers';
export const QUESTIONNAIRE_GROUP_ID = 'group_questionnaire';
export const STATUS_GROUP_ID = 'group_status';
export const STICKER_CATEGORY_NAME = '表情包';
export const QUESTIONNAIRE_CATEGORY_NAME = '问卷回答';
export const STATUS_CATEGORY_NAME = '状态';
export const MANAGE_CATEGORIES = Object.freeze([
  Object.freeze({ id: STICKER_GROUP_ID, name: STICKER_CATEGORY_NAME, type: 'stickers' }),
  Object.freeze({ id: QUESTIONNAIRE_GROUP_ID, name: QUESTIONNAIRE_CATEGORY_NAME, type: 'questionnaire' }),
  Object.freeze({ id: STATUS_GROUP_ID, name: STATUS_CATEGORY_NAME, type: 'status' }),
]);
export const BACKUP_REMINDER_DAYS = 7;
export const SETTINGS_CHANGED_EVENT = 'xinghui:settings-changed';
export const CHARACTER_CHANGED_EVENT = 'xinghui:character-changed';
export const DATA_RESTORED_EVENT = 'xinghui:data-restored';
export const BACKUP_STATUS_CHANGED_EVENT = 'xinghui:backup-status-changed';
export const CHAT_CHANGED_EVENT = 'xinghui:chat-changed';

export const DEFAULT_SETTINGS = Object.freeze({
  replyDelayMin: 1,
  replyDelayMax: 3,
  typingIndicator: true,
  readNoReplyEnabled: true,
  readNoReply: 15,
  stickerReply: 10,
  starFavorite: 5,
  patReply: 70,
  promptQuestionnaireChance: 0.3,
  promptQuestionnaireIntervalHours: 0.5,
  lastPromptQuestionnaireCheckAt: 0,
  bubbleColor: '#DDEEFF',
  chatBackgroundType: 'color',
  chatBackgroundColor: '#F7FBFE',
  chatBackgroundImage: '',
  userAvatar: '',
  showTimestamp: true,
  fontSize: 'medium',
  currentGroupId: DEFAULT_GROUP_ID,
});

export const DEFAULT_CHARACTER = Object.freeze({
  name: '星回',
  avatar: '',
});

const FONT_SIZES = new Set(['small', 'medium', 'large']);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

function finiteNumber(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(value, fallback) {
  const color = String(value || '').trim();
  return HEX_COLOR.test(color) ? color.toUpperCase() : fallback;
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function readStorage(key, fallback = null) {
  const storage = getStorage();
  if (!storage) return fallback;
  try {
    const value = storage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readJson(key, fallback = null) {
  const raw = readStorage(key, null);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    return writeStorage(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

export function readArray(key) {
  const value = readJson(key, []);
  return Array.isArray(value) ? value : [];
}

const QUESTIONNAIRE_DRAFT_TTL_MS = 60 * 60 * 1000;

export function readQuestionnaireDraft(maxAgeMs = QUESTIONNAIRE_DRAFT_TTL_MS) {
  const draft = readJson(QUESTIONNAIRE_DRAFT_KEY, null);
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
  const savedAt = parseTimestamp(draft.savedAt);
  if (Date.now() - savedAt > maxAgeMs) {
    removeStorage(QUESTIONNAIRE_DRAFT_KEY);
    return null;
  }
  return draft.data && typeof draft.data === 'object' && !Array.isArray(draft.data) ? draft.data : null;
}

export function writeQuestionnaireDraft(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  return writeJson(QUESTIONNAIRE_DRAFT_KEY, { savedAt: Date.now(), data });
}

export function clearQuestionnaireDraft() {
  return removeStorage(QUESTIONNAIRE_DRAFT_KEY);
}

export function normalizePercentage(value, fallback, minimum = 0) {
  if (typeof value === 'boolean') return value ? fallback : 0;
  return clamp(finiteNumber(value, fallback), minimum, 100);
}

export function normalizeSettings(settings = {}) {
  const source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  const firstDelay = clamp(finiteNumber(source.replyDelayMin, DEFAULT_SETTINGS.replyDelayMin), 0, 600);
  const secondDelay = clamp(finiteNumber(source.replyDelayMax, DEFAULT_SETTINGS.replyDelayMax), 0, 600);

  return {
    replyDelayMin: Math.min(firstDelay, secondDelay),
    replyDelayMax: Math.max(firstDelay, secondDelay),
    typingIndicator: source.typingIndicator !== false,
    readNoReplyEnabled: source.readNoReplyEnabled !== false,
    readNoReply: normalizePercentage(source.readNoReply, DEFAULT_SETTINGS.readNoReply, 1),
    stickerReply: normalizePercentage(source.stickerReply, DEFAULT_SETTINGS.stickerReply, 1),
    starFavorite: normalizePercentage(source.starFavorite, DEFAULT_SETTINGS.starFavorite, 0),
    patReply: normalizePercentage(source.patReply, DEFAULT_SETTINGS.patReply, 1),
    promptQuestionnaireChance: clamp(finiteNumber(source.promptQuestionnaireChance, DEFAULT_SETTINGS.promptQuestionnaireChance), 0, 1),
    promptQuestionnaireIntervalHours: clamp(finiteNumber(source.promptQuestionnaireIntervalHours, DEFAULT_SETTINGS.promptQuestionnaireIntervalHours), 0, 12),
    lastPromptQuestionnaireCheckAt: Math.max(0, finiteNumber(source.lastPromptQuestionnaireCheckAt, DEFAULT_SETTINGS.lastPromptQuestionnaireCheckAt)),
    bubbleColor: normalizeHexColor(source.bubbleColor, DEFAULT_SETTINGS.bubbleColor),
    chatBackgroundType: source.chatBackgroundType === 'image' && typeof source.chatBackgroundImage === 'string' && /^data:image\//i.test(source.chatBackgroundImage)
      ? 'image'
      : 'color',
    chatBackgroundColor: normalizeHexColor(source.chatBackgroundColor, DEFAULT_SETTINGS.chatBackgroundColor),
    chatBackgroundImage: typeof source.chatBackgroundImage === 'string' && /^data:image\//i.test(source.chatBackgroundImage)
      ? source.chatBackgroundImage
      : '',
    userAvatar: (() => {
      const avatar = String(source.userAvatar || '').trim();
      return avatar === 'idb:user' || /^data:image\//i.test(avatar) ? avatar : '';
    })(),
    showTimestamp: source.showTimestamp !== false,
    fontSize: FONT_SIZES.has(source.fontSize) ? source.fontSize : DEFAULT_SETTINGS.fontSize,
    currentGroupId: String(source.currentGroupId || '').trim() || DEFAULT_GROUP_ID,
  };
}

export function readSettings() {
  return normalizeSettings(readJson(STORAGE_KEYS.settings, {}));
}

export function writeSettings(settings) {
  const normalized = normalizeSettings(settings);
  const saved = writeJson(STORAGE_KEYS.settings, normalized);
  if (saved && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: normalized }));
  }
  return saved ? normalized : null;
}

export function updateSettings(patch = {}) {
  const current = readSettings();
  const safePatch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  return writeSettings({ ...current, ...safePatch });
}

export function normalizeCharacter(character = {}) {
  const source = character && typeof character === 'object' && !Array.isArray(character) ? character : {};
  const avatarValue = typeof source.avatar === 'string' ? source.avatar.trim() : '';
  const avatar = avatarValue === 'idb:star' || /^data:image\//i.test(avatarValue) ? avatarValue : '';

  return {
    name: String(source.name || DEFAULT_CHARACTER.name).trim() || DEFAULT_CHARACTER.name,
    avatar,
  };
}

export function readCharacter() {
  return normalizeCharacter(readJson(STORAGE_KEYS.character, DEFAULT_CHARACTER));
}

export function writeCharacter(character) {
  const normalized = normalizeCharacter(character);
  const saved = writeJson(STORAGE_KEYS.character, normalized);
  if (saved && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHARACTER_CHANGED_EVENT, { detail: normalized }));
  }
  return saved ? normalized : null;
}

export function normalizeGroup(group) {
  if (!group || typeof group !== 'object' || Array.isArray(group)) return null;
  const id = String(group.id || '').trim();
  const name = String(group.name || '').trim();
  if (!id || !name) return null;
  const category = MANAGE_CATEGORIES.find((item) => item.type === group.category)?.type || '';
  return category ? { id, name, category } : { id, name };
}

export function normalizeCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
  const content = typeof card.content === 'string' ? card.content : '';
  return {
    id: String(card.id || createId('card')),
    groupId: String(card.groupId || DEFAULT_GROUP_ID).trim() || DEFAULT_GROUP_ID,
    content,
    disabled: Boolean(card.disabled),
  };
}

export function normalizeSticker(sticker) {
  if (!sticker || typeof sticker !== 'object' || Array.isArray(sticker)) return null;
  const image = String(sticker.image || sticker.content || sticker.src || '').trim();
  const storage = sticker.storage === 'indexeddb' || (!image && sticker.id) ? 'indexeddb' : 'legacy';
  if (!image && storage !== 'indexeddb') return null;
  return {
    id: String(sticker.id || createId('sticker')),
    ...(image ? { image } : {}),
    storage,
    mimeType: String(sticker.mimeType || ''),
    size: Math.max(0, finiteNumber(sticker.size, 0)),
    createdAt: Math.max(0, finiteNumber(sticker.createdAt, Date.now())),
    enabled: sticker.enabled !== false,
  };
}

export function normalizeTextEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const content = typeof entry.content === 'string' ? entry.content.trim() : '';
  if (!content) return null;
  return {
    id: String(entry.id || createId('entry')),
    content,
  };
}

export function getManageCategory(groupOrId) {
  const groupId = typeof groupOrId === 'string' ? groupOrId : groupOrId?.id;
  const groupName = typeof groupOrId === 'string' ? groupOrId.trim() : '';
  const categoryType = typeof groupOrId === 'object' ? String(groupOrId?.category || '').trim() : '';
  return MANAGE_CATEGORIES.find((category) => (
    category.type === categoryType || category.id === groupId || category.name === groupName
  )) || null;
}

export function hasManageCategory(category) {
  const target = getManageCategory(category) || MANAGE_CATEGORIES.find((item) => item.name === String(category || '').trim());
  if (!target) return false;
  return readGroups().some((group) => group.id === target.id || group.name === target.name);
}

export function migrateManageCategories() {
  const storage = getStorage();
  if (!storage || storage.getItem(CATEGORY_MIGRATION_KEY) !== null) return false;

  const groups = readGroups();
  const existingIds = new Set(groups.map((group) => group.id));
  const existingNames = new Set(groups.map((group) => group.name));
  MANAGE_CATEGORIES.forEach((category) => {
    const existing = groups.find((group) => group.id === category.id || group.name === category.name);
    if (existing) {
      existing.category = category.type;
      existingIds.add(existing.id);
      existingNames.add(existing.name);
      return;
    }
    groups.push({ id: category.id, name: category.name, category: category.type });
    existingIds.add(category.id);
    existingNames.add(category.name);
  });

  writeGroups(groups);
  writeStorage(CATEGORY_MIGRATION_KEY, '1');
  return true;
}

export function normalizePromptQuestionnaire(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const question = typeof item.question === 'string' ? item.question.trim().slice(0, 500) : '';
  if (!question) return null;
  const type = ['qa', 'single', 'multiple'].includes(item.type) ? item.type : 'qa';
  const options = Array.isArray(item.options)
    ? item.options.map((option) => String(option).trim()).filter(Boolean).slice(0, 100)
    : [];
  return {
    id: String(item.id || createId('prompt')),
    question,
    options,
    type,
    enabled: item.enabled !== false,
  };
}

export function normalizePeriodRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const startDate = typeof record.startDate === 'string' ? record.startDate.trim() : '';
  const endDate = typeof record.endDate === 'string' ? record.endDate.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
  return {
    id: String(record.id || createId('period')),
    startDate,
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : '',
    symptoms: typeof record.symptoms === 'string' ? record.symptoms.trim().slice(0, 500) : '',
    mood: typeof record.mood === 'string' ? record.mood.trim().slice(0, 200) : '',
    updatedAt: parseTimestamp(record.updatedAt),
  };
}

export function normalizePatCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
  const content = typeof card.content === 'string' ? card.content : '';
  if (!content) return null;
  return {
    id: String(card.id || createId('pat')),
    content,
  };
}

function parseTimestamp(timestamp) {
  if (Number.isFinite(Number(timestamp)) && Number(timestamp) > 0) return Number(timestamp);
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

export function normalizeQuestionnaire(questionnaire) {
  if (!questionnaire || typeof questionnaire !== 'object' || Array.isArray(questionnaire)) return null;

  const type = ['qa', 'single', 'multiple'].includes(questionnaire.type) ? questionnaire.type : 'qa';
  const options = Array.isArray(questionnaire.options)
    ? questionnaire.options.map((option) => String(option).trim()).filter(Boolean).slice(0, 100)
    : [];
  const question = typeof questionnaire.question === 'string' ? questionnaire.question.trim().slice(0, 500) : '';

  return {
    question,
    options,
    type,
    thinkMin: clamp(finiteNumber(questionnaire.thinkMin, 10), 1, 60),
    thinkMax: clamp(finiteNumber(questionnaire.thinkMax, 15), 1, 60),
    answerNow: clamp(finiteNumber(questionnaire.answerNow, 0.6), 0, 1),
    multiMin: clamp(finiteNumber(questionnaire.multiMin, 1), 1, 10),
    multiMax: clamp(finiteNumber(questionnaire.multiMax, options.length || 3), 1, 10),
    status: ['pending', 'thinking', 'awaiting-answer', 'delayed', 'answered', 'cancelled', 'withdrawn'].includes(questionnaire.status)
      ? questionnaire.status
      : 'pending',
    direction: questionnaire.direction === 'star-asked' ? 'star-asked' : 'user-asked',
    createdAt: parseTimestamp(questionnaire.createdAt),
    sequence: finiteNumber(questionnaire.sequence, Date.now()),
    answer: questionnaire.answer ?? '',
    selected: Array.isArray(questionnaire.selected)
      ? questionnaire.selected.map((item) => String(item)).filter(Boolean).slice(0, 100)
      : [],
    delayNotice: Boolean(questionnaire.delayNotice),
    answeredAt: questionnaire.answeredAt ? parseTimestamp(questionnaire.answeredAt) : 0,
  };
}

export function normalizeChatMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  const role = message.role === 'star' ? 'star' : message.role === 'system' ? 'system' : 'user';
  const type = message.type === 'sticker' ? 'sticker' : message.type === 'pat' ? 'pat' : message.type === 'questionnaire' ? 'questionnaire' : 'text';
  const turnId = message.turnId ? String(message.turnId) : '';
  const sequence = Number.isFinite(Number(message.sequence)) ? Number(message.sequence) : 0;
  return {
    id: String(message.id || createId('msg')),
    role,
    type,
    content: typeof message.content === 'string' ? message.content : '',
    timestamp: parseTimestamp(message.timestamp),
    read: Boolean(message.read),
    favorited: Boolean(message.favorited),
    starFavorited: Boolean(message.starFavorited),
    withdrawn: Boolean(message.withdrawn),
    turnId,
    sequence,
    questionnaire: type === 'questionnaire'
      ? (() => {
          const questionnaire = normalizeQuestionnaire(message.questionnaire || message.questionnaireData);
          if (questionnaire && !message.questionnaire?.direction) {
            questionnaire.direction = role === 'star' ? 'star-asked' : 'user-asked';
          }
          return questionnaire;
        })()
      : undefined,
  };
}

function readCollection(key, normalizer) {
  return readArray(key).map(normalizer).filter(Boolean);
}

export function readCards() {
  return readCollection(STORAGE_KEYS.cards, normalizeCard);
}

export function readGroups() {
  return readCollection(STORAGE_KEYS.groups, normalizeGroup);
}

export function readStickers() {
  return readCollection(STORAGE_KEYS.stickers, normalizeSticker);
}

export function readPatCards() {
  return readCollection(STORAGE_KEYS.patCards, normalizePatCard);
}

export function readQuestionnaireAnswers() {
  return readCollection(STORAGE_KEYS.questionnaireAnswers, normalizeTextEntry);
}

export function readStatuses() {
  return readCollection(STORAGE_KEYS.statuses, normalizeTextEntry);
}

export function readPromptQuestionnaires() {
  return readCollection(STORAGE_KEYS.promptQuestionnaires, normalizePromptQuestionnaire);
}

export function readPeriodRecords() {
  return readCollection(STORAGE_KEYS.periodRecords, normalizePeriodRecord)
    .sort((first, second) => second.startDate.localeCompare(first.startDate));
}

export function readChatMessages() {
  return readCollection(STORAGE_KEYS.chatMessages, normalizeChatMessage);
}

export function writeCards(cards) {
  const normalized = Array.isArray(cards) ? cards.map(normalizeCard).filter(Boolean) : [];
  return writeJson(STORAGE_KEYS.cards, normalized) ? normalized : null;
}

export function writeGroups(groups) {
  const normalized = Array.isArray(groups) ? groups.map(normalizeGroup).filter(Boolean) : [];
  return writeJson(STORAGE_KEYS.groups, normalized) ? normalized : null;
}

export function writeStickers(stickers) {
  const normalized = Array.isArray(stickers) ? stickers.map(normalizeSticker).filter(Boolean) : [];
  return writeJson(STORAGE_KEYS.stickers, normalized) ? normalized : null;
}

export function writePatCards(cards) {
  const normalized = Array.isArray(cards) ? cards.map(normalizePatCard).filter(Boolean) : [];
  return writeJson(STORAGE_KEYS.patCards, normalized) ? normalized : null;
}

export function writeQuestionnaireAnswers(entries) {
  const normalized = Array.isArray(entries) ? entries.map(normalizeTextEntry).filter(Boolean) : [];
  return writeJson(STORAGE_KEYS.questionnaireAnswers, normalized) ? normalized : null;
}

export function writeStatuses(entries) {
  const normalized = Array.isArray(entries) ? entries.map(normalizeTextEntry).filter(Boolean) : [];
  return writeJson(STORAGE_KEYS.statuses, normalized) ? normalized : null;
}

export function writePromptQuestionnaires(items) {
  const normalized = Array.isArray(items) ? items.map(normalizePromptQuestionnaire).filter(Boolean) : [];
  return writeJson(STORAGE_KEYS.promptQuestionnaires, normalized) ? normalized : null;
}

export function writePeriodRecords(records) {
  const normalized = Array.isArray(records) ? records.map(normalizePeriodRecord).filter(Boolean) : [];
  return writeJson(STORAGE_KEYS.periodRecords, normalized) ? normalized : null;
}

export function writeChatMessages(messages) {
  const normalized = Array.isArray(messages) ? messages.map(normalizeChatMessage).filter(Boolean) : [];
  const saved = writeJson(STORAGE_KEYS.chatMessages, normalized);
  if (saved && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHAT_CHANGED_EVENT, { detail: { messages: normalized } }));
  }
  return saved ? normalized : null;
}

function normalizeDateValue(value, fallback) {
  const number = finiteNumber(value, NaN);
  if (Number.isFinite(number) && number > 0) return number;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function ensureFirstLaunchAt(now = Date.now()) {
  const stored = normalizeDateValue(readStorage(STORAGE_KEYS.firstLaunchAt, null), 0);
  if (stored > 0) return stored;
  const timestamp = normalizeDateValue(now, Date.now());
  writeStorage(STORAGE_KEYS.firstLaunchAt, String(timestamp));
  return timestamp;
}

export function getLastBackupAt() {
  return normalizeDateValue(readStorage(STORAGE_KEYS.lastBackupAt, null), 0);
}

export function markBackupExported(timestamp = Date.now()) {
  const exportedAt = normalizeDateValue(timestamp, Date.now());
  const saved = writeStorage(STORAGE_KEYS.lastBackupAt, String(exportedAt));
  if (saved && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BACKUP_STATUS_CHANGED_EVENT, { detail: { lastBackupAt: exportedAt } }));
  }
  return saved;
}

export function getBackupReminder(now = Date.now()) {
  const firstLaunchAt = ensureFirstLaunchAt(now);
  const lastBackupAt = getLastBackupAt();
  const baselineAt = lastBackupAt || firstLaunchAt;
  const elapsedMs = Math.max(0, now - baselineAt);
  const elapsedDays = Math.floor(elapsedMs / DAY_MS);

  return {
    isDue: elapsedMs > BACKUP_REMINDER_DAYS * DAY_MS,
    elapsedDays,
    firstLaunchAt,
    lastBackupAt,
    baselineAt,
  };
}

export function initStorage() {
  const storage = getStorage();
  if (!storage) return { settings: { ...DEFAULT_SETTINGS }, character: { ...DEFAULT_CHARACTER } };

  if (storage.getItem(STORAGE_KEYS.settings) === null) {
    writeJson(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  }

  if (storage.getItem(STORAGE_KEYS.character) === null) {
    writeJson(STORAGE_KEYS.character, DEFAULT_CHARACTER);
  }

  ensureFirstLaunchAt();
  migrateManageCategories();
  return {
    settings: readSettings(),
    character: readCharacter(),
  };
}

export function getStorageSnapshot() {
  const chatMessages = readChatMessages();
  const mine = chatMessages.filter((message) => message.favorited).map((message) => ({ ...message }));
  const star = chatMessages.filter((message) => message.starFavorited).map((message) => ({ ...message }));

  return {
    cards: readCards(),
    stickers: readStickers(),
    chatMessages,
    favorites: { mine, star },
    settings: readSettings(),
    groups: readGroups(),
    promptQuestionnaires: readPromptQuestionnaires(),
    periodRecords: readPeriodRecords(),
    questionnaireDraft: readJson(QUESTIONNAIRE_DRAFT_KEY, null),
    moodCache: readJson(MOOD_CACHE_KEY, null),
    patCards: readPatCards(),
    questionnaireAnswers: readQuestionnaireAnswers(),
    statuses: readStatuses(),
    character: readCharacter(),
  };
}

export function createBackupPayload(exportedAt = new Date().toISOString()) {
  return {
    app: '星回',
    version: 1,
    exportedAt,
    ...getStorageSnapshot(),
  };
}

function sourceValue(source, key, fallback) {
  return Object.prototype.hasOwnProperty.call(source, key) ? source[key] : fallback;
}

export function normalizeBackupPayload(input) {
  let parsed = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      throw new Error('文件不是有效的 JSON。');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('备份内容格式不正确。');
  }

  const source = parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
    ? parsed.data
    : parsed;
  const favoriteSource = source.favorites && typeof source.favorites === 'object' && !Array.isArray(source.favorites)
    ? source.favorites
    : {};

  const knownKeys = ['cards', 'stickers', 'chatMessages', 'favorites', 'settings', 'groups', 'promptQuestionnaires', 'periodRecords', 'questionnaireDraft', 'moodCache', 'mediaAssets', 'patCards', 'questionnaireAnswers', 'statuses', 'character'];
  if (!knownKeys.some((key) => Object.prototype.hasOwnProperty.call(source, key))) {
    throw new Error('没有找到可导入的星回数据。');
  }

  return {
    version: Math.max(1, finiteNumber(parsed.version, 1)),
    exportedAt: String(parsed.exportedAt || ''),
    cards: Array.isArray(source.cards) ? source.cards.map(normalizeCard).filter(Boolean) : [],
    stickers: Array.isArray(source.stickers) ? source.stickers.map(normalizeSticker).filter(Boolean) : [],
    chatMessages: Array.isArray(source.chatMessages)
      ? source.chatMessages.map(normalizeChatMessage).filter(Boolean)
      : [],
    favorites: {
      mine: Array.isArray(sourceValue(favoriteSource, 'mine', []))
        ? favoriteSource.mine.map(normalizeChatMessage).filter(Boolean)
        : [],
      star: Array.isArray(sourceValue(favoriteSource, 'star', []))
        ? favoriteSource.star.map(normalizeChatMessage).filter(Boolean)
        : [],
    },
    settings: source.settings && typeof source.settings === 'object' && !Array.isArray(source.settings)
      ? normalizeSettings(source.settings)
      : null,
    groups: Array.isArray(source.groups) ? source.groups.map(normalizeGroup).filter(Boolean) : [],
    promptQuestionnaires: Array.isArray(source.promptQuestionnaires)
      ? source.promptQuestionnaires.map(normalizePromptQuestionnaire).filter(Boolean)
      : [],
    periodRecords: Array.isArray(source.periodRecords)
      ? source.periodRecords.map(normalizePeriodRecord).filter(Boolean)
      : [],
    questionnaireDraft: source.questionnaireDraft && typeof source.questionnaireDraft === 'object' && !Array.isArray(source.questionnaireDraft)
      ? source.questionnaireDraft
      : null,
    moodCache: source.moodCache && typeof source.moodCache === 'object' && !Array.isArray(source.moodCache)
      ? source.moodCache
      : null,
    mediaAssets: Array.isArray(source.mediaAssets) ? source.mediaAssets : [],
    patCards: Array.isArray(source.patCards) ? source.patCards.map(normalizePatCard).filter(Boolean) : [],
    questionnaireAnswers: Array.isArray(source.questionnaireAnswers)
      ? source.questionnaireAnswers.map(normalizeTextEntry).filter(Boolean)
      : [],
    statuses: Array.isArray(source.statuses) ? source.statuses.map(normalizeTextEntry).filter(Boolean) : [],
    character: source.character && typeof source.character === 'object' && !Array.isArray(source.character)
      ? normalizeCharacter(source.character)
      : null,
  };
}
