import './styles/fonts.css';
import './styles/tokens.css';
import './styles/themes.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/chat.css';

import { initChatView, onChatViewEnter } from './views/chat.js';
import { initRouter, navigateTo } from './lib/router.js';
import { pickRandom } from './lib/random.js';
import { initReplyEngine } from './lib/reply.js';
import { initFavoritesView, onFavoritesViewEnter } from './views/favorites.js';
import { initPatView } from './views/pat.js';
import { initManageView, onManageViewEnter } from './views/manage.js';
import { initQuestionnaireView, onQuestionnaireViewEnter } from './views/questionnaire.js';
import { initLetterView, onLetterViewEnter } from './views/letter.js';
import { initPeriodView, onPeriodViewEnter } from './views/period.js';
import { initFeedView, onFeedViewEnter } from './views/feed.js';
import { initPromptEngine } from './lib/prompt-engine.js';
import { initLetterEngine } from './lib/letter-engine.js';
import { getAvatarBlob, listStickerRecords, migrateLegacyMedia, setBlobImage } from './lib/media-db.js';
import { initSettingsView, onSettingsViewEnter } from './views/settings.js';
import { initBackupView, onBackupViewEnter } from './views/backup.js';
import './styles/polish.css';
import './styles/mochi-theme.css';
import {
  BACKUP_STATUS_CHANGED_EVENT,
  CARD_STORAGE_KEY,
  CHARACTER_CHANGED_EVENT,
  DATA_RESTORED_EVENT,
  DEFAULT_GROUP_ID,
  SETTINGS_CHANGED_EVENT,
  getBackupReminder,
  initStorage,
  readCharacter,
  readJson,
  readSettings,
  readStickers,
  removeStorage,
  updateSettings,
  writeCharacter,
  writeJson,
  writeStickers,
} from './lib/storage.js';
import { getCurrentStatus } from './lib/status.js';

const DAILY_GREETING_KEY = 'xinghui_daily_greeting';

const VIEWS = ['home', 'chat', 'questionnaire', 'letter', 'feed', 'period', 'manage', 'favorites', 'settings', 'backup', 'pat'];
const NAV_VIEWS = ['home', 'manage', 'settings'];
const HOME_PAGE_SIZE = 6;
const TITLES = {
  home: '首页',
  chat: '聊天',
  questionnaire: '小问题',
  letter: '信封',
  feed: '朋友圈',
  period: '经期记录',
  manage: '字卡',
  favorites: '收藏',
  settings: '设置',
  backup: '数据备份',
  pat: '拍一拍',
};

let homePageIndex = 0;

const initializedViews = new Set();
const lazyViewInitializers = {
  questionnaire: initQuestionnaireView,
  letter: initLetterView,
  period: initPeriodView,
  manage: initManageView,
  favorites: initFavoritesView,
  settings: initSettingsView,
  backup: initBackupView,
};

function ensureViewInitialized(view) {
  if (initializedViews.has(view)) return false;
  const initializer = lazyViewInitializers[view];
  if (!initializer) return false;
  const initialized = Boolean(initializer());
  if (initialized) initializedViews.add(view);
  return initialized;
}

// 按底色亮度自动取高对比文字色，避免浅底配白字看不清。
function bubbleInk(hex) {
  const value = String(hex || '').replace('#', '');
  if (value.length !== 6) return '#111111';
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.62 ? '#111111' : '#FFFFFF';
}

function applyAppearance(settings = readSettings()) {
  const root = document.documentElement;
  root.dataset.fontSize = settings.fontSize;
  root.style.setProperty('--chat-background-color', settings.chatBackgroundColor);
  root.style.setProperty('--bubble-color', settings.bubbleColor);
  root.style.setProperty('--bubble-color-user', settings.bubbleColor);
  root.style.setProperty('--bubble-ink-user', bubbleInk(settings.bubbleColor));
  root.style.setProperty('--bubble-color-star', settings.bubbleColorStar);
  root.style.setProperty('--bubble-ink-star', bubbleInk(settings.bubbleColorStar));

  if (settings.chatBackgroundType === 'image' && settings.chatBackgroundImage) {
    root.style.setProperty('--chat-background-image', `url("${settings.chatBackgroundImage}")`);
  } else {
    root.style.removeProperty('--chat-background-image');
  }
  const globalBackground = document.getElementById('globalBackground');
  if (globalBackground) {
    if (settings.globalBackgroundImage) {
      let image = globalBackground.querySelector('img');
      if (!image) {
        image = document.createElement('img');
        image.alt = '';
        globalBackground.append(image);
      }
      if (image.getAttribute('src') !== settings.globalBackgroundImage) {
        image.src = settings.globalBackgroundImage;
      }
      globalBackground.hidden = false;
    } else {
      globalBackground.replaceChildren();
      globalBackground.hidden = true;
    }
  }

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#E9E9E9');
}

async function renderHomeStarAvatar() {
  const container = document.getElementById('homeStarAvatar');
  if (!container) return;
  const { name, avatar } = readCharacter();
  const starName = String(name || '星回').trim().slice(0, 20) || '星回';
  container.replaceChildren();
  container.setAttribute('aria-label', starName + '头像，长按拍一拍');

  if (!avatar) {
    const fallback = document.createElement('span');
    fallback.textContent = starName.slice(0, 1);
    container.append(fallback);
    return;
  }

  const image = document.createElement('img');
  image.alt = starName + '头像';
  container.append(image);

  if (avatar === 'idb:star') {
    try {
      const blob = await getAvatarBlob('star');
      if (!blob) throw new Error('avatar-missing');
      setBlobImage(image, blob);
    } catch {
      image.remove();
      const fallback = document.createElement('span');
      fallback.textContent = starName.slice(0, 1);
      container.append(fallback);
    }
    return;
  }

  image.src = avatar;
}

async function renderHomeUserAvatar() {
  const container = document.getElementById('homeUserAvatar');
  if (!container) return;
  const { userAvatar, userName } = readSettings();
  const displayName = String(userName || '我').trim().slice(0, 20) || '我';
  container.replaceChildren();
  container.setAttribute('aria-label', displayName + '的头像');

  if (!userAvatar) {
    const fallback = document.createElement('span');
    fallback.textContent = displayName.slice(0, 1);
    container.append(fallback);
    return;
  }

  const image = document.createElement('img');
  image.alt = displayName + '头像';
  container.append(image);

  if (userAvatar === 'idb:user') {
    try {
      const blob = await getAvatarBlob('user');
      if (!blob) throw new Error('avatar-missing');
      setBlobImage(image, blob);
    } catch {
      image.remove();
      const fallback = document.createElement('span');
      fallback.textContent = displayName.slice(0, 1);
      container.append(fallback);
    }
    return;
  }

  image.src = userAvatar;
}

function renderHomeStatus() {
  const container = document.getElementById('homeStatus');
  const label = document.getElementById('homeStatusText');
  if (!container || !label) return;

  const status = getCurrentStatus();
  const content = String(status.text || '').trim();
  container.classList.toggle('is-warning', Boolean(status.missing || status.empty || !content));
  label.textContent = content || '还没有设置状态';
}
function renderBackupReminder() {
  const reminder = document.getElementById('homeBackupReminder');
  if (!reminder) return;

  const status = getBackupReminder();
  const shouldShow = status.isDue && !status.isDismissed;
  reminder.hidden = !shouldShow;
  if (!shouldShow) return;

  const label = reminder.querySelector('[data-backup-reminder-text]');
  if (label) {
    label.textContent = status.lastBackupAt
      ? `距离上次导出已超过 7 天，建议现在备份全部数据。`
      : `首次使用已超过 7 天且尚未导出，建议现在备份全部数据。`;
  }
}

function currentView() {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  return VIEWS.includes(raw) ? raw : 'home';
}

function renderHomePage() {
  const grid = document.getElementById('homeEntryGrid');
  const pagination = document.getElementById('homePagination');
  const prevButton = document.getElementById('homePrevPage');
  const nextButton = document.getElementById('homeNextPage');
  const status = document.getElementById('homePageStatus');
  if (!grid || !pagination || !prevButton || !nextButton || !status) return;

  const slots = Array.from(grid.querySelectorAll('.entry-card, .entry-card-placeholder'));
  const totalPages = Math.max(1, Math.ceil(slots.length / HOME_PAGE_SIZE));
  homePageIndex = Math.min(Math.max(homePageIndex, 0), totalPages - 1);

  const start = homePageIndex * HOME_PAGE_SIZE;
  const end = start + HOME_PAGE_SIZE;
  slots.forEach((slot, index) => {
    slot.hidden = index < start || index >= end;
  });

  pagination.hidden = totalPages <= 1;
  prevButton.disabled = homePageIndex === 0;
  nextButton.disabled = homePageIndex === totalPages - 1;
  status.textContent = `${homePageIndex + 1} / ${totalPages}`;
  grid.dataset.page = String(homePageIndex + 1);
  grid.setAttribute('aria-label', `首页功能板块，第 ${homePageIndex + 1} 页，共 ${totalPages} 页`);
}

function render() {
  const view = currentView();
  const justInitialized = ensureViewInitialized(view);

  document.querySelectorAll('.view').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.view === view);
  });

  document.body.dataset.view = view;
  const app = document.getElementById('app');
  if (app) app.dataset.view = view;

  const showNav = NAV_VIEWS.includes(view);
  const bottomNav = document.getElementById('bottomNav');
  const backButton = document.getElementById('backButton');
  if (bottomNav) bottomNav.classList.toggle('is-visible', showNav);
  if (backButton) backButton.classList.toggle('is-visible', !showNav && view !== 'chat');

  document.querySelectorAll('.nav-item').forEach((item) => {
    const active = item.dataset.route === view;
    item.classList.toggle('is-active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });

  document.title = `${TITLES[view] || '星回'} · 星回`;

  if (view === 'home') {
    updateClock();
    renderHomeStarAvatar();
    renderHomeStatus();
    renderBackupReminder();
  }
  if (!justInitialized) {
    if (view === 'chat') onChatViewEnter();
    if (view === 'questionnaire') onQuestionnaireViewEnter();
    if (view === 'letter') onLetterViewEnter();
    if (view === 'feed') onFeedViewEnter();
    if (view === 'period') onPeriodViewEnter();
    if (view === 'favorites') onFavoritesViewEnter();
    if (view === 'manage') onManageViewEnter();
    if (view === 'settings') onSettingsViewEnter();
    if (view === 'backup') onBackupViewEnter();
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function readStoredJson(key, fallback) {
  return readJson(key, fallback);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getGreetingCards() {
  const cards = readStoredJson(CARD_STORAGE_KEY, []);

  if (!Array.isArray(cards)) return [];

  return cards
    .filter((card) => card && typeof card === 'object' && !card.disabled)
    .filter((card) => String(card.groupId || '') === DEFAULT_GROUP_ID)
    .map((card) => ({ ...card, content: typeof card.content === 'string' ? card.content.trim() : '' }))
    .filter((card) => card.content);
}

function greetingCycleDate(now = new Date()) {
  const cycle = new Date(now);
  if (cycle.getHours() < 8) cycle.setDate(cycle.getDate() - 1);
  return localDateKey(cycle);
}

function renderDailyGreeting(now = new Date()) {
  const greeting = document.getElementById('greeting');
  if (!greeting) return;

  const today = greetingCycleDate(now);
  const cards = getGreetingCards();
  const renderGreeting = (content = '') => {
    const text = String(content || '').trim();
    greeting.textContent = text || '还没有想说的话';
    greeting.classList.toggle('is-placeholder', !text);
    greeting.hidden = false;
  };

  if (!cards.length) {
    removeStorage(DAILY_GREETING_KEY);
    renderGreeting();
    return;
  }

  const stored = readStoredJson(DAILY_GREETING_KEY, null);
  const storedCard = stored?.date === today
    ? cards.find((card) => String(card.id) === String(stored.cardId))
    : null;

  if (storedCard) {
    renderGreeting(typeof stored.content === 'string' ? stored.content : storedCard.content);
    return;
  }

  const card = pickRandom(cards);
  if (!card) {
    renderGreeting();
    return;
  }

  writeJson(DAILY_GREETING_KEY, {
    date: today,
    cardId: String(card.id || ''),
    content: card.content,
  });

  renderGreeting(card.content);
}
function updateClock() {
  const timeEl = document.getElementById('clockTime');
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  if (timeEl) {
    const timeText = `${hh}:${mm}`;
    if (timeEl.textContent !== timeText) timeEl.textContent = timeText;
    timeEl.dateTime = now.toISOString();
  }
  renderDailyGreeting(now);
}

document.getElementById('backButton')?.addEventListener('click', () => {
  navigateTo('home');
});

document.getElementById('homePrevPage')?.addEventListener('click', () => {
  if (homePageIndex === 0) return;
  homePageIndex -= 1;
  renderHomePage();
});

document.getElementById('homeNextPage')?.addEventListener('click', () => {
  const grid = document.getElementById('homeEntryGrid');
  const totalPages = Math.max(1, Math.ceil((grid?.querySelectorAll('.entry-card, .entry-card-placeholder').length || 0) / HOME_PAGE_SIZE));
  if (homePageIndex >= totalPages - 1) return;
  homePageIndex += 1;
  renderHomePage();
});

initRouter(render);
window.addEventListener('xinghui:manage-data-changed', () => {
  renderDailyGreeting();
  renderHomeStatus();
});
window.addEventListener(SETTINGS_CHANGED_EVENT, (event) => {
  applyAppearance(event.detail || readSettings());
  void renderHomeUserAvatar();
});
window.addEventListener(CHARACTER_CHANGED_EVENT, () => renderHomeStarAvatar());
window.addEventListener(BACKUP_STATUS_CHANGED_EVENT, () => renderBackupReminder());
window.addEventListener(DATA_RESTORED_EVENT, () => {
  applyAppearance(readSettings());
  renderDailyGreeting();
  renderHomeStarAvatar();
  void renderHomeUserAvatar();
  renderHomeStatus();
  renderBackupReminder();
});

async function initializeMediaStorage() {
  try {
    const result = await migrateLegacyMedia({
      stickers: readStickers(),
      character: readCharacter(),
      settings: readSettings(),
    });
    const indexedStickers = await listStickerRecords();
    const stickerMap = new Map();
    [...result.stickers, ...readStickers(), ...indexedStickers].forEach((sticker) => {
      if (sticker?.id) stickerMap.set(sticker.id, sticker);
    });
    writeStickers([...stickerMap.values()]);
    const character = readCharacter();
    if (result.avatar && result.avatar !== character.avatar) writeCharacter({ ...character, avatar: result.avatar });
    const settings = readSettings();
    if (result.userAvatar && result.userAvatar !== settings.userAvatar) updateSettings({ userAvatar: result.userAvatar });
    window.dispatchEvent(new CustomEvent('xinghui:manage-data-changed'));
  } catch {
    // Keep legacy data untouched when media migration is unavailable or fails.
  }
}
initStorage();
await initializeMediaStorage();
applyAppearance();

if (!window.location.hash) {
  window.history.replaceState(null, '', '#/home');
}
renderHomePage();
initChatView();
initializedViews.add('chat');
initReplyEngine();
initFeedView();
initializedViews.add('feed');
initPromptEngine();
initLetterEngine();
initPatView();
initializedViews.add('pat');
renderHomeStarAvatar();
void renderHomeUserAvatar();
renderHomeStatus();
renderBackupReminder();
render();
setInterval(updateClock, 1000);

