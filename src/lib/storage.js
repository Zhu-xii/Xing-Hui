export const STORAGE_KEYS = Object.freeze({
  settings: 'xinghui_settings',
  cards: 'xinghui_cards',
  groups: 'xinghui_groups',
  stickers: 'xinghui_stickers',
  images: 'xinghui_images',
  patCards: 'xinghui_pat_cards',
  questionnaireAnswers: 'xinghui_questionnaire_answers',
  statuses: 'xinghui_statuses',
  moods: 'xinghui_moods',
  roasts: 'xinghui_roasts',
  categoryMigration: 'xinghui_category_migration_v1',
  questionnaireDraft: 'xinghui_questionnaire_draft',
  promptQuestionnaires: 'xinghui_prompt_questionnaires',
  periodRecords: 'xinghui_period_records',
  moodCache: 'xinghui_chat_mood',
  chatMessages: 'xinghui_chat_messages',
  feedPosts: 'xinghui_feed_posts',
  feedNotices: 'xinghui_feed_notices',
  feedAutoPost: 'xinghui_feed_autopost',
  character: 'xinghui_character',
  firstLaunchAt: 'xinghui_first_launch_at',
  lastBackupAt: 'xinghui_last_backup_at',
});

export const SETTINGS_KEY = STORAGE_KEYS.settings;
export const CARD_STORAGE_KEY = STORAGE_KEYS.cards;
export const GROUP_STORAGE_KEY = STORAGE_KEYS.groups;
export const STICKER_STORAGE_KEY = STORAGE_KEYS.stickers;
export const IMAGE_STORAGE_KEY = STORAGE_KEYS.images;
export const PAT_CARD_STORAGE_KEY = STORAGE_KEYS.patCards;
export const QUESTIONNAIRE_ANSWER_STORAGE_KEY = STORAGE_KEYS.questionnaireAnswers;
export const STATUS_STORAGE_KEY = STORAGE_KEYS.statuses;
export const MOOD_CARD_STORAGE_KEY = STORAGE_KEYS.moods;
export const ROAST_STORAGE_KEY = STORAGE_KEYS.roasts;
export const CATEGORY_MIGRATION_KEY = STORAGE_KEYS.categoryMigration;
export const QUESTIONNAIRE_DRAFT_KEY = STORAGE_KEYS.questionnaireDraft;
export const PROMPT_QUESTIONNAIRE_STORAGE_KEY = STORAGE_KEYS.promptQuestionnaires;
export const PERIOD_RECORD_STORAGE_KEY = STORAGE_KEYS.periodRecords;
export const MOOD_CACHE_KEY = STORAGE_KEYS.moodCache;
export const CHAT_STORAGE_KEY = STORAGE_KEYS.chatMessages;
export const FEED_POSTS_STORAGE_KEY = STORAGE_KEYS.feedPosts;
export const FEED_NOTICES_STORAGE_KEY = STORAGE_KEYS.feedNotices;
export const FEED_AUTO_POST_STORAGE_KEY = STORAGE_KEYS.feedAutoPost;
export const CHARACTER_STORAGE_KEY = STORAGE_KEYS.character;
export const DEFAULT_GROUP_ID = 'group_default';
export const GREETING_GROUP_ID = 'group_greeting';
export const STICKER_GROUP_ID = 'group_stickers';
export const IMAGE_GROUP_ID = 'group_images';
export const QUESTIONNAIRE_GROUP_ID = 'group_questionnaire';
export const STATUS_GROUP_ID = 'group_status';
export const MOOD_GROUP_ID = 'group_mood';
export const ROAST_GROUP_ID = 'group_roast';
export const STICKER_CATEGORY_NAME = '表情包';
export const IMAGE_CATEGORY_NAME = '图片';
export const QUESTIONNAIRE_CATEGORY_NAME = '问卷回答';
export const STATUS_CATEGORY_NAME = '状态';
export const MOOD_CATEGORY_NAME = '心情';
export const ROAST_CATEGORY_NAME = '他的吐槽';
export const MANAGE_CATEGORIES = Object.freeze([
  Object.freeze({ id: STICKER_GROUP_ID, name: STICKER_CATEGORY_NAME, type: 'stickers' }),
  Object.freeze({ id: IMAGE_GROUP_ID, name: IMAGE_CATEGORY_NAME, type: 'images' }),
  Object.freeze({ id: QUESTIONNAIRE_GROUP_ID, name: QUESTIONNAIRE_CATEGORY_NAME, type: 'questionnaire' }),
  Object.freeze({ id: STATUS_GROUP_ID, name: STATUS_CATEGORY_NAME, type: 'status' }),
  Object.freeze({ id: MOOD_GROUP_ID, name: MOOD_CATEGORY_NAME, type: 'mood' }),
  Object.freeze({ id: ROAST_GROUP_ID, name: ROAST_CATEGORY_NAME, type: 'roast' }),
]);
export const BACKUP_REMINDER_DAYS = 7;
export const SETTINGS_CHANGED_EVENT = 'xinghui:settings-changed';
export const CHARACTER_CHANGED_EVENT = 'xinghui:character-changed';
export const DATA_RESTORED_EVENT = 'xinghui:data-restored';
export const BACKUP_STATUS_CHANGED_EVENT = 'xinghui:backup-status-changed';
export const CHAT_CHANGED_EVENT = 'xinghui:chat-changed';
export const FEED_CHANGED_EVENT = 'xinghui:feed-changed';
export const FEED_NOTICES_CHANGED_EVENT = 'xinghui:feed-notices-changed';

export const DEFAULT_SETTINGS = Object.freeze({
  replyDelayMin: 1,
  replyDelayMax: 3,
  typingIndicator: true,
  readNoReplyEnabled: true,
  readNoReply: 15,
  stickerReply: 10,
  starFavorite: 30,
  starFavoriteCard: 30,
  starFavoriteFeed: 30,
  patReply: 70,
  multiReplyEnabled: true,
  multiReplyMin: 1,
  multiReplyMax: 2,
  multiReplyGapMin: 0.5,
  multiReplyGapMax: 1.2,
  spellCardEnabled: true,
  spellCardChance: 15,
  spellCardMin: 2,
  spellCardMax: 4,
  spellCardMode: 'single',
  spellCardNewline: true,
  spellCardCustomSeparators: [],
  promptQuestionnaireChance: 30,
  promptQuestionnaireIntervalHours: 0.5,
  lastPromptQuestionnaireCheckAt: 0,
  bubbleColor: '#111111',
  bubbleColorStar: '#FFFFFF',
  chatBackgroundType: 'color',
  chatBackgroundColor: '#EFEFEF',
  chatBackgroundImage: '',
  userAvatar: '',
  userName: '我',
  // 朋友圈：星回自动发动态的间隔、频率与互动概率（分钟 / 百分比）
  feedEnabled: true,
  feedAutoPostEnabled: true,
  feedPostIntervalMin: 30,
  feedPostIntervalMax: 180,
  feedDailyMax: 4,
  feedPostChance: 50,
  feedLikeProbability: 60,
  feedCommentProbability: 75,
  feedReplyProbability: 50,
  feedReplyToCommentProbability: 50,
  // 他的吐槽：星回偶尔主动吐槽一句
  roastEnabled: true,
  roastProbability: 8,
  roastIntervalMinutes: 20,
  lastRoastAt: 0,
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

function isLightColor(hex) {
  const value = String(hex || '').replace('#', '');
  if (value.length !== 6) return false;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.62;
}

const LEGACY_COLOR_MAP = Object.freeze({
  '#DDEEFF': '#FFFFFF',
  '#F7FBFE': '#EFEFEF',
  '#EAF4FC': '#ECECEC',
});

function migrateLegacyColor(value) {
  const key = String(value || '').trim().toUpperCase();
  return LEGACY_COLOR_MAP[key] || value;
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

const MAX_CUSTOM_SEPARATORS = 20;
const MAX_SEPARATOR_LENGTH = 8;

// 自定义连接符：接受数组或按行输入的字符串；跳过空行、去重、限长限量。
export function normalizeSeparatorList(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/\r?\n/);
  const result = [];
  const seen = new Set();
  source.forEach((item) => {
    const separator = String(item ?? '').replace(/\r/g, '').slice(0, MAX_SEPARATOR_LENGTH);
    if (!separator.trim() || seen.has(separator)) return;
    seen.add(separator);
    result.push(separator);
  });
  return result.slice(0, MAX_CUSTOM_SEPARATORS);
}

export function normalizeSettings(settings = {}) {
  const source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  const firstDelay = clamp(finiteNumber(source.replyDelayMin, DEFAULT_SETTINGS.replyDelayMin), 0, 600);
  const secondDelay = clamp(finiteNumber(source.replyDelayMax, DEFAULT_SETTINGS.replyDelayMax), 0, 600);
  const firstMultiReply = clamp(Math.round(finiteNumber(source.multiReplyMin, DEFAULT_SETTINGS.multiReplyMin)), 1, 10);
  const secondMultiReply = clamp(Math.round(finiteNumber(source.multiReplyMax, DEFAULT_SETTINGS.multiReplyMax)), 1, 10);
  const firstSpellCard = clamp(Math.round(finiteNumber(source.spellCardMin, DEFAULT_SETTINGS.spellCardMin)), 1, 10);
  const secondSpellCard = clamp(Math.round(finiteNumber(source.spellCardMax, DEFAULT_SETTINGS.spellCardMax)), 1, 10);
  const rawBubble = normalizeHexColor(migrateLegacyColor(source.bubbleColor), DEFAULT_SETTINGS.bubbleColor);
  const rawBubbleStar = source.bubbleColorStar == null ? '' : normalizeHexColor(migrateLegacyColor(source.bubbleColorStar), DEFAULT_SETTINGS.bubbleColorStar);
  // 旧数据只有一个气泡颜色：浅色归「对方气泡」，我方回默认墨黑。
  const bubbleIsLegacy = !rawBubbleStar && isLightColor(rawBubble);
  const feedIntervalA = clamp(finiteNumber(source.feedPostIntervalMin, DEFAULT_SETTINGS.feedPostIntervalMin), 1, 1440);
  const feedIntervalB = clamp(finiteNumber(source.feedPostIntervalMax, DEFAULT_SETTINGS.feedPostIntervalMax), 1, 1440);
  // 旧版本概率以 0–1 存储，这里迁移到 0–100 百分比。
  const rawPromptChance = finiteNumber(source.promptQuestionnaireChance, DEFAULT_SETTINGS.promptQuestionnaireChance);
  const promptChance = rawPromptChance > 0 && rawPromptChance <= 1 ? rawPromptChance * 100 : rawPromptChance;

  return {
    replyDelayMin: Math.min(firstDelay, secondDelay),
    replyDelayMax: Math.max(firstDelay, secondDelay),
    typingIndicator: source.typingIndicator !== false,
    readNoReplyEnabled: source.readNoReplyEnabled !== false,
    readNoReply: normalizePercentage(source.readNoReply, DEFAULT_SETTINGS.readNoReply, 1),
    stickerReply: normalizePercentage(source.stickerReply, DEFAULT_SETTINGS.stickerReply, 1),
    starFavorite: normalizePercentage(source.starFavorite, DEFAULT_SETTINGS.starFavorite, 0),
    starFavoriteCard: normalizePercentage(source.starFavoriteCard, DEFAULT_SETTINGS.starFavoriteCard, 0),
    starFavoriteFeed: normalizePercentage(source.starFavoriteFeed, DEFAULT_SETTINGS.starFavoriteFeed, 0),
    patReply: normalizePercentage(source.patReply, DEFAULT_SETTINGS.patReply, 1),
    multiReplyEnabled: source.multiReplyEnabled !== false,
    multiReplyMin: Math.min(firstMultiReply, secondMultiReply),
    multiReplyMax: Math.max(firstMultiReply, secondMultiReply),
    multiReplyGapMin: clamp(finiteNumber(source.multiReplyGapMin, DEFAULT_SETTINGS.multiReplyGapMin), 0.2, 10),
    multiReplyGapMax: clamp(finiteNumber(source.multiReplyGapMax, DEFAULT_SETTINGS.multiReplyGapMax), 0.2, 10),
    spellCardEnabled: source.spellCardEnabled !== false,
    spellCardChance: normalizePercentage(source.spellCardChance, DEFAULT_SETTINGS.spellCardChance, 1),
    spellCardMin: Math.min(firstSpellCard, secondSpellCard),
    spellCardMax: Math.max(firstSpellCard, secondSpellCard),
    spellCardMode: ['split', 'each'].includes(source.spellCardMode) ? source.spellCardMode : 'single',
    spellCardNewline: source.spellCardNewline !== false,
    spellCardCustomSeparators: normalizeSeparatorList(source.spellCardCustomSeparators),
    promptQuestionnaireChance: clamp(promptChance, 0, 100),
    promptQuestionnaireIntervalHours: clamp(finiteNumber(source.promptQuestionnaireIntervalHours, DEFAULT_SETTINGS.promptQuestionnaireIntervalHours), 0, 12),
    lastPromptQuestionnaireCheckAt: Math.max(0, finiteNumber(source.lastPromptQuestionnaireCheckAt, DEFAULT_SETTINGS.lastPromptQuestionnaireCheckAt)),
    bubbleColor: bubbleIsLegacy ? DEFAULT_SETTINGS.bubbleColor : rawBubble,
    bubbleColorStar: bubbleIsLegacy ? rawBubble : (rawBubbleStar || DEFAULT_SETTINGS.bubbleColorStar),
    chatBackgroundType: source.chatBackgroundType === 'image' && typeof source.chatBackgroundImage === 'string' && /^data:image\//i.test(source.chatBackgroundImage)
      ? 'image'
      : 'color',
    chatBackgroundColor: normalizeHexColor(migrateLegacyColor(source.chatBackgroundColor), DEFAULT_SETTINGS.chatBackgroundColor),
    chatBackgroundImage: typeof source.chatBackgroundImage === 'string' && /^data:image\//i.test(source.chatBackgroundImage)
      ? source.chatBackgroundImage
      : '',
    userAvatar: (() => {
      const avatar = String(source.userAvatar || '').trim();
      return avatar === 'idb:user' || /^data:image\//i.test(avatar) ? avatar : '';
    })(),
    userName: String(source.userName || DEFAULT_SETTINGS.userName).trim().slice(0, 20) || DEFAULT_SETTINGS.userName,
    feedEnabled: source.feedEnabled !== false,
    feedAutoPostEnabled: source.feedAutoPostEnabled !== false,
    feedPostIntervalMin: Math.min(feedIntervalA, feedIntervalB),
    feedPostIntervalMax: Math.max(feedIntervalA, feedIntervalB),
    feedDailyMax: clamp(Math.round(finiteNumber(source.feedDailyMax, DEFAULT_SETTINGS.feedDailyMax)), 1, 24),
    feedPostChance: normalizePercentage(source.feedPostChance, DEFAULT_SETTINGS.feedPostChance, 0),
    feedLikeProbability: normalizePercentage(source.feedLikeProbability, DEFAULT_SETTINGS.feedLikeProbability, 0),
    feedCommentProbability: normalizePercentage(source.feedCommentProbability, DEFAULT_SETTINGS.feedCommentProbability, 0),
    feedReplyProbability: normalizePercentage(source.feedReplyProbability, DEFAULT_SETTINGS.feedReplyProbability, 0),
    feedReplyToCommentProbability: normalizePercentage(source.feedReplyToCommentProbability, DEFAULT_SETTINGS.feedReplyToCommentProbability, 0),
    roastEnabled: source.roastEnabled !== false,
    roastProbability: normalizePercentage(source.roastProbability, DEFAULT_SETTINGS.roastProbability, 0),
    roastIntervalMinutes: clamp(finiteNumber(source.roastIntervalMinutes, DEFAULT_SETTINGS.roastIntervalMinutes), 0, 1440),
    lastRoastAt: Math.max(0, finiteNumber(source.lastRoastAt, DEFAULT_SETTINGS.lastRoastAt)),
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
    name: String(source.name || DEFAULT_CHARACTER.name).trim().slice(0, 20) || DEFAULT_CHARACTER.name,
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

export const NICKNAME_MAX_LENGTH = 20;

export function readNicknames() {
  const character = readCharacter();
  const settings = readSettings();
  const star = String(character.name || DEFAULT_CHARACTER.name).trim().slice(0, NICKNAME_MAX_LENGTH) || DEFAULT_CHARACTER.name;
  const user = String(settings.userName || DEFAULT_SETTINGS.userName).trim().slice(0, NICKNAME_MAX_LENGTH) || DEFAULT_SETTINGS.userName;
  return { star, user };
}

export function applyNicknamePlaceholders(text, names = readNicknames()) {
  const star = String(names?.star || DEFAULT_CHARACTER.name).trim() || DEFAULT_CHARACTER.name;
  const user = String(names?.user || DEFAULT_SETTINGS.userName).trim() || DEFAULT_SETTINGS.userName;
  return String(text ?? '')
    .replace(/\{\s*(?:ta|star|星回)\s*\}/gi, star)
    .replace(/\{\s*(?:me|user|我)\s*\}/gi, user);
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
  // 迁移标记按版本推进：新增类别后提升版本号，保证老用户也会补齐新类别。
  const MIGRATION_VERSION = '3';
  if (!storage || storage.getItem(CATEGORY_MIGRATION_KEY) === MIGRATION_VERSION) return false;

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
  writeStorage(CATEGORY_MIGRATION_KEY, MIGRATION_VERSION);
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
    answerNow: (() => {
      const raw = finiteNumber(questionnaire.answerNow, 60);
      const percent = raw > 0 && raw <= 1 ? raw * 100 : raw;
      return clamp(percent, 0, 100);
    })(),
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
  const type = ['sticker', 'pat', 'questionnaire', 'image'].includes(message.type) ? message.type : 'text';
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
    tag: typeof message.tag === 'string' ? message.tag.trim().slice(0, 20) : '',
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

function isFeedImage(value) {
  return typeof value === 'string' && /^data:image\//i.test(value.trim());
}

function isStickerRef(value) {
  if (typeof value !== 'string') return false;
  const ref = value.trim();
  return /^idb:/i.test(ref) || /^data:image\//i.test(ref);
}

function normalizeFeedComment(comment) {
  if (!comment || typeof comment !== 'object' || Array.isArray(comment)) return null;
  const content = typeof comment.content === 'string' ? comment.content.trim().slice(0, 500) : '';
  const sticker = isStickerRef(comment.sticker) ? comment.sticker.trim() : '';
  if (!content && !sticker) return null;
  const replyTo = replyTargetId(comment.replyTo);
  return {
    id: String(comment.id || createId('feed_comment')),
    author: comment.author === 'star' ? 'star' : 'user',
    content,
    sticker,
    replyTo,
    replyToName: replyTo ? String(comment.replyToName || '').trim().slice(0, 40) : '',
    createdAt: parseTimestamp(comment.createdAt),
  };
}

function replyTargetId(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 80);
}

export function normalizeFeedPost(post) {
  if (!post || typeof post !== 'object' || Array.isArray(post)) return null;
  const content = typeof post.content === 'string' ? post.content.trim().slice(0, 2000) : '';
  const rawImages = Array.isArray(post.images) ? post.images : (post.image ? [post.image] : []);
  const images = rawImages
    .filter(isFeedImage)
    .map((item) => item.trim())
    .slice(0, 9);
  if (!content && !images.length) return null;
  const comments = Array.isArray(post.comments)
    ? post.comments.map(normalizeFeedComment).filter(Boolean)
    : [];
  const likes = Array.isArray(post.likes)
    ? post.likes.map((item) => (item === 'star' ? 'star' : 'user')).filter((item, index, list) => list.indexOf(item) === index)
    : [];
  return {
    id: String(post.id || createId('feed')),
    author: post.author === 'star' ? 'star' : 'user',
    content,
    images,
    createdAt: parseTimestamp(post.createdAt),
    likes,
    comments,
    favorited: Boolean(post.favorited),
    starFavorited: Boolean(post.starFavorited),
  };
}

function normalizeFeedNotice(notice) {
  if (!notice || typeof notice !== 'object' || Array.isArray(notice)) return null;
  const postId = String(notice.postId || '').trim().slice(0, 80);
  const text = typeof notice.text === 'string' ? notice.text.trim().slice(0, 300) : '';
  if (!postId && !text) return null;
  const type = ['post', 'like', 'comment'].includes(notice.type) ? notice.type : 'post';
  return {
    id: String(notice.id || createId('feed_notice')),
    type,
    postId,
    text,
    author: notice.author === 'user' ? 'user' : 'star',
    createdAt: parseTimestamp(notice.createdAt),
    read: notice.read === true,
  };
}

function normalizeFeedAutoPostState(state) {
  const source = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  return {
    enabled: source.enabled !== false,
    lastPostAt: Math.max(0, finiteNumber(source.lastPostAt, 0)),
    nextAt: Math.max(0, finiteNumber(source.nextAt, 0)),
    day: typeof source.day === 'string' ? source.day.slice(0, 20) : '',
    dayCount: Math.max(0, Math.floor(finiteNumber(source.dayCount, 0))),
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

export function readImages() {
  return readCollection(STORAGE_KEYS.images, normalizeSticker);
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

export function readFeedPosts() {
  return readCollection(STORAGE_KEYS.feedPosts, normalizeFeedPost)
    .sort((first, second) => second.createdAt - first.createdAt);
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

export function writeImages(images) {
  const normalized = Array.isArray(images) ? images.map(normalizeSticker).filter(Boolean) : [];
  return writeJson(STORAGE_KEYS.images, normalized) ? normalized : null;
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

export function readMoods() {
  return readCollection(STORAGE_KEYS.moods, normalizeTextEntry);
}

export function readRoasts() {
  return readCollection(STORAGE_KEYS.roasts, normalizeTextEntry);
}

export function writeMoods(entries) {
  const normalized = Array.isArray(entries) ? entries.map(normalizeTextEntry).filter(Boolean) : [];
  return writeJson(STORAGE_KEYS.moods, normalized) ? normalized : null;
}

export function writeRoasts(entries) {
  const normalized = Array.isArray(entries) ? entries.map(normalizeTextEntry).filter(Boolean) : [];
  return writeJson(STORAGE_KEYS.roasts, normalized) ? normalized : null;
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

export function writeFeedPosts(posts) {
  const normalized = Array.isArray(posts)
    ? posts.map(normalizeFeedPost).filter(Boolean).sort((first, second) => second.createdAt - first.createdAt)
    : [];
  const saved = writeJson(STORAGE_KEYS.feedPosts, normalized);
  if (saved && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FEED_CHANGED_EVENT, { detail: { posts: normalized } }));
  }
  return saved ? normalized : null;
}

export function readFeedNotices() {
  return readArray(STORAGE_KEYS.feedNotices)
    .map(normalizeFeedNotice)
    .filter(Boolean)
    .sort((first, second) => second.createdAt - first.createdAt);
}

export function writeFeedNotices(notices) {
  const normalized = Array.isArray(notices)
    ? notices.map(normalizeFeedNotice).filter(Boolean).sort((first, second) => second.createdAt - first.createdAt).slice(0, 100)
    : [];
  const saved = writeJson(STORAGE_KEYS.feedNotices, normalized);
  if (saved && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FEED_NOTICES_CHANGED_EVENT, { detail: { notices: normalized } }));
  }
  return saved ? normalized : null;
}

export function readFeedAutoPostState() {
  return normalizeFeedAutoPostState(readJson(STORAGE_KEYS.feedAutoPost, null));
}

export function writeFeedAutoPostState(state) {
  const normalized = normalizeFeedAutoPostState(state);
  return writeJson(STORAGE_KEYS.feedAutoPost, normalized) ? normalized : null;
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
    images: readImages(),
    chatMessages,
    feedPosts: readFeedPosts(),
    feedNotices: readFeedNotices(),
    feedAutoPost: readFeedAutoPostState(),
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
    moods: readMoods(),
    roasts: readRoasts(),
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

  const knownKeys = ['cards', 'stickers', 'chatMessages', 'feedPosts', 'feedNotices', 'feedAutoPost', 'favorites', 'settings', 'groups', 'promptQuestionnaires', 'periodRecords', 'questionnaireDraft', 'moodCache', 'mediaAssets', 'patCards', 'questionnaireAnswers', 'statuses', 'moods', 'roasts', 'images', 'character'];
  if (!knownKeys.some((key) => Object.prototype.hasOwnProperty.call(source, key))) {
    throw new Error('没有找到可导入的星回数据。');
  }

  return {
    version: Math.max(1, finiteNumber(parsed.version, 1)),
    exportedAt: String(parsed.exportedAt || ''),
    cards: Array.isArray(source.cards) ? source.cards.map(normalizeCard).filter(Boolean) : [],
    stickers: Array.isArray(source.stickers) ? source.stickers.map(normalizeSticker).filter(Boolean) : [],
    images: Array.isArray(source.images) ? source.images.map(normalizeSticker).filter(Boolean) : [],
    chatMessages: Array.isArray(source.chatMessages)
      ? source.chatMessages.map(normalizeChatMessage).filter(Boolean)
      : [],
    feedPosts: Array.isArray(source.feedPosts)
      ? source.feedPosts.map(normalizeFeedPost).filter(Boolean)
      : [],
    feedNotices: Array.isArray(source.feedNotices)
      ? source.feedNotices.map(normalizeFeedNotice).filter(Boolean)
      : [],
    feedAutoPost: source.feedAutoPost && typeof source.feedAutoPost === 'object' && !Array.isArray(source.feedAutoPost)
      ? normalizeFeedAutoPostState(source.feedAutoPost)
      : null,
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
    moods: Array.isArray(source.moods) ? source.moods.map(normalizeTextEntry).filter(Boolean) : [],
    roasts: Array.isArray(source.roasts) ? source.roasts.map(normalizeTextEntry).filter(Boolean) : [],
    character: source.character && typeof source.character === 'object' && !Array.isArray(source.character)
      ? normalizeCharacter(source.character)
      : null,
  };
}

