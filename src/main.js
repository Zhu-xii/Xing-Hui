import './styles/tokens.css';
import './styles/themes.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/chat.css';

import { initChatView, onChatViewEnter } from './views/chat.js';
import { pickRandom } from './lib/random.js';
import { initReplyEngine } from './lib/reply.js';
import { initFavoritesView, onFavoritesViewEnter } from './views/favorites.js';
import { initPatView } from './views/pat.js';
import { initManageView, onManageViewEnter } from './views/manage.js';
import { initQuestionnaireView, onQuestionnaireViewEnter } from './views/questionnaire.js';
import { initPeriodView, onPeriodViewEnter } from './views/period.js';
import { initPromptEngine } from './lib/prompt-engine.js';
import { initSettingsView, onSettingsViewEnter } from './views/settings.js';
import { initBackupView, onBackupViewEnter } from './views/backup.js';
import './styles/polish.css';
import {
  BACKUP_STATUS_CHANGED_EVENT,
  CARD_STORAGE_KEY,
  CHARACTER_CHANGED_EVENT,
  DATA_RESTORED_EVENT,
  DEFAULT_GROUP_ID,
  GREETING_GROUP_ID,
  GROUP_STORAGE_KEY,
  SETTINGS_CHANGED_EVENT,
  STATUS_CATEGORY_NAME,
  getBackupReminder,
  hasManageCategory,
  initStorage,
  readCharacter,
  readJson,
  readSettings,
  readStatuses,
  removeStorage,
  writeJson,
} from './lib/storage.js';

const DAILY_GREETING_KEY = 'xinghui_daily_greeting';
const GREETING_GROUP_NAME = '问候语字卡';

const VIEWS = ['home', 'chat', 'questionnaire', 'period', 'manage', 'favorites', 'settings', 'backup', 'pat'];
const NAV_VIEWS = ['home', 'manage', 'settings'];
const HOME_PAGE_SIZE = 6;
const TITLES = {
  home: '首页',
  chat: '聊天',
  questionnaire: '问卷',
  period: '经期记录',
  manage: '管理',
  favorites: '收藏',
  settings: '设置',
  backup: '数据备份',
  pat: '拍一拍',
};

let homePageIndex = 0;

function applyAppearance(settings = readSettings()) {
  const root = document.documentElement;
  root.dataset.fontSize = settings.fontSize;
  root.style.setProperty('--chat-background-color', settings.chatBackgroundColor);
  root.style.setProperty('--bubble-color', settings.bubbleColor);

  if (settings.chatBackgroundType === 'image' && settings.chatBackgroundImage) {
    root.style.setProperty('--chat-background-image', `url("${settings.chatBackgroundImage}")`);
  } else {
    root.style.removeProperty('--chat-background-image');
  }

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#F7FBFE');
}

function renderHomeStarAvatar() {
  const container = document.getElementById('homeStarAvatar');
  if (!container) return;
  const { avatar } = readCharacter();

  container.replaceChildren();
  if (avatar) {
    const image = document.createElement('img');
    image.src = avatar;
    image.alt = '星回头像';
    container.append(image);
  } else {
    const fallback = document.createElement('span');
    fallback.textContent = '星';
    container.append(fallback);
  }
}

function renderHomeStatus() {
  const container = document.getElementById('homeStatus');
  const label = document.getElementById('homeStatusText');
  if (!container || !label) return;

  const exists = hasManageCategory(STATUS_CATEGORY_NAME);
  container.classList.toggle('is-warning', !exists);

  if (!exists) {
    label.textContent = '请先重建该类别';
    return;
  }

  const latest = readStatuses().at(-1);
  label.textContent = latest?.content || '还没有设置状态';
}

function renderBackupReminder() {
  const reminder = document.getElementById('homeBackupReminder');
  if (!reminder) return;

  const status = getBackupReminder();
  reminder.hidden = !status.isDue;
  if (!status.isDue) return;

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

  const cards = Array.from(grid.querySelectorAll('.entry-card'));
  const totalPages = Math.max(1, Math.ceil(cards.length / HOME_PAGE_SIZE));
  homePageIndex = Math.min(Math.max(homePageIndex, 0), totalPages - 1);

  const start = homePageIndex * HOME_PAGE_SIZE;
  const end = start + HOME_PAGE_SIZE;
  cards.forEach((card, index) => {
    card.hidden = index < start || index >= end;
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
  if (view === 'chat') onChatViewEnter();
  if (view === 'questionnaire') onQuestionnaireViewEnter();
  if (view === 'period') onPeriodViewEnter();
  if (view === 'favorites') onFavoritesViewEnter();
  if (view === 'manage') onManageViewEnter();
  if (view === 'settings') onSettingsViewEnter();
  if (view === 'backup') onBackupViewEnter();
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
  const groups = readStoredJson(GROUP_STORAGE_KEY, []);
  const cards = readStoredJson(CARD_STORAGE_KEY, []);
  const greetingGroupIds = new Set([GREETING_GROUP_ID]);

  if (Array.isArray(groups)) {
    groups.forEach((group) => {
      if (group?.name === GREETING_GROUP_NAME && group.id) greetingGroupIds.add(String(group.id));
    });
  }

  if (!Array.isArray(cards)) return [];

  return cards
    .filter((card) => card && typeof card === 'object' && !card.disabled)
    .filter((card) => greetingGroupIds.has(String(card.groupId || '')))
    .map((card) => ({ ...card, content: typeof card.content === 'string' ? card.content.trim() : '' }))
    .filter((card) => card.content);
}

function renderDailyGreeting(now = new Date()) {
  const greeting = document.getElementById('greeting');
  if (!greeting) return;

  const today = localDateKey(now);
  const cards = getGreetingCards();

  if (!cards.length) {
    removeStorage(DAILY_GREETING_KEY);
    greeting.textContent = '';
    greeting.hidden = true;
    return;
  }

  const stored = readStoredJson(DAILY_GREETING_KEY, null);
  const storedCard = stored?.date === today
    ? cards.find((card) => String(card.id) === String(stored.cardId))
    : null;

  if (storedCard) {
    greeting.textContent = typeof stored.content === 'string' ? stored.content : storedCard.content;
    greeting.hidden = false;
    return;
  }

  if (stored?.date === today) {
    greeting.textContent = '';
    greeting.hidden = true;
    return;
  }

  const card = pickRandom(cards);
  if (!card) {
    greeting.textContent = '';
    greeting.hidden = true;
    return;
  }

  writeJson(DAILY_GREETING_KEY, {
    date: today,
    cardId: String(card.id || ''),
    content: card.content,
  });

  greeting.textContent = card.content;
  greeting.hidden = false;
}
function updateClock() {
  const timeEl = document.getElementById('clockTime');
  const dateEl = document.getElementById('clockDate');
  if (!timeEl || !dateEl) return;

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const dateText = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;

  timeEl.textContent = `${hh}:${mm}`;
  dateEl.textContent = dateText;
  renderDailyGreeting(now);
}

document.getElementById('backButton')?.addEventListener('click', () => {
  window.location.hash = '#/home';
});

document.getElementById('homePrevPage')?.addEventListener('click', () => {
  if (homePageIndex === 0) return;
  homePageIndex -= 1;
  renderHomePage();
});

document.getElementById('homeNextPage')?.addEventListener('click', () => {
  const grid = document.getElementById('homeEntryGrid');
  const totalPages = Math.max(1, Math.ceil((grid?.querySelectorAll('.entry-card').length || 0) / HOME_PAGE_SIZE));
  if (homePageIndex >= totalPages - 1) return;
  homePageIndex += 1;
  renderHomePage();
});

window.addEventListener('hashchange', render);
window.addEventListener('xinghui:manage-data-changed', () => {
  renderDailyGreeting();
  renderHomeStatus();
});
window.addEventListener(SETTINGS_CHANGED_EVENT, (event) => applyAppearance(event.detail || readSettings()));
window.addEventListener(CHARACTER_CHANGED_EVENT, () => renderHomeStarAvatar());
window.addEventListener(BACKUP_STATUS_CHANGED_EVENT, () => renderBackupReminder());
window.addEventListener(DATA_RESTORED_EVENT, () => {
  applyAppearance(readSettings());
  renderDailyGreeting();
  renderHomeStarAvatar();
  renderHomeStatus();
  renderBackupReminder();
});

initStorage();
applyAppearance();

if (!window.location.hash) {
  window.location.replace('#/home');
}
renderHomePage();
initChatView();
initReplyEngine();
initQuestionnaireView();
initPeriodView();
initPromptEngine();
initManageView();
initFavoritesView();
initPatView();
initSettingsView();
initBackupView();
renderHomeStarAvatar();
renderHomeStatus();
renderBackupReminder();
render();
setInterval(updateClock, 1000);



