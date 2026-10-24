import '../styles/letter.css';
import { readCharacter, readLetters, readSettings, writeLetters } from '../lib/storage.js';
import { writeUserLetter } from '../lib/letter-engine.js';

let viewRoot = null;
let elements = null;
let eventsBound = false;
let activeTab = 'star';
let activeLetterId = '';
let toastTimer = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatLetterDate(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const includeYear = date.getFullYear() !== now.getFullYear();
  return new Intl.DateTimeFormat('zh-CN', {
    year: includeYear ? 'numeric' : undefined,
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function names() {
  return {
    star: readCharacter().name || '星回',
    user: readSettings().userName || '我',
  };
}

function activeLetters() {
  return readLetters().filter((letter) => letter.direction === activeTab);
}

function showToast(message, tone = 'default') {
  if (!elements?.toast) return;
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.dataset.tone = tone;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    if (elements?.toast) elements.toast.hidden = true;
  }, 2600);
}

function renderList() {
  if (!elements?.list) return;
  const labels = names();
  const letters = activeLetters();
  const writeButton = elements.writeButton;
  if (writeButton) writeButton.hidden = activeTab !== 'user';

  elements.tabs.forEach((button) => {
    const selected = button.dataset.letterTab === activeTab;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  elements.count.textContent = `${letters.length} 封`;

  if (!letters.length) {
    elements.list.innerHTML = `
      <div class="letter-empty">
        <span class="letter-empty__seal" aria-hidden="true">${activeTab === 'star' ? '✦' : '✎'}</span>
        <strong>${activeTab === 'star' ? '还没有收到信' : '还没有写过信'}</strong>
        <p>${activeTab === 'star'
          ? '星回会在适合的时候，从「写信专用」里挑几句话写给你。'
          : '点「写一封信」，从「写信专用」字卡中随机抽几句寄出去。'}</p>
      </div>
    `;
    return;
  }

  elements.list.innerHTML = letters.map((letter) => {
    const from = letter.direction === 'star' ? labels.star : labels.user;
    const unread = letter.direction === 'star' && !letter.read;
    return `
      <button class="letter-card${unread ? ' is-unread' : ''}" type="button" data-letter-id="${escapeHtml(letter.id)}">
        <span class="letter-card__seal" aria-hidden="true">${unread ? '✦' : '✉'}</span>
        <span class="letter-card__copy">
          <span class="letter-card__meta">
            <strong>${escapeHtml(letter.title)}</strong>
            ${unread ? '<span class="letter-card__unread">未读</span>' : ''}
          </span>
          <span class="letter-card__excerpt">${escapeHtml(letter.content.replace(/\s+/g, ' '))}</span>
          <span class="letter-card__foot">${escapeHtml(from)} · ${escapeHtml(formatLetterDate(letter.createdAt))}</span>
        </span>
        <span class="letter-card__arrow" aria-hidden="true">›</span>
      </button>
    `;
  }).join('');
}

function closeLetter() {
  if (!elements?.modal) return;
  elements.modal.hidden = true;
  elements.modal.replaceChildren();
  activeLetterId = '';
}

function openLetter(letterId) {
  const letters = readLetters();
  const index = letters.findIndex((letter) => letter.id === letterId);
  if (index < 0 || !elements?.modal) return;
  const letter = letters[index];
  activeLetterId = letter.id;
  if (letter.direction === 'star' && !letter.read) {
    letter.read = true;
    writeLetters(letters);
  }
  const labels = names();
  const from = letter.direction === 'star' ? labels.star : labels.user;
  elements.modal.hidden = false;
  elements.modal.innerHTML = `
    <div class="letter-modal__backdrop" data-letter-action="close"></div>
    <article class="letter-paper" role="dialog" aria-modal="true" aria-labelledby="letterPaperTitle">
      <header class="letter-paper__head">
        <div>
          <p>${escapeHtml(from)}</p>
          <h3 id="letterPaperTitle">${escapeHtml(letter.title)}</h3>
        </div>
        <button class="letter-paper__close" type="button" data-letter-action="close" aria-label="关闭信件">×</button>
      </header>
      <p class="letter-paper__time">${escapeHtml(formatLetterDate(letter.createdAt))}</p>
      <div class="letter-paper__body">${escapeHtml(letter.content)}</div>
      <footer class="letter-paper__foot">
        <button type="button" class="letter-paper__delete" data-letter-action="delete" data-letter-id="${escapeHtml(letter.id)}">删除这封信</button>
        <button type="button" class="letter-paper__done" data-letter-action="close">收起</button>
      </footer>
    </article>
  `;
  renderList();
}

function deleteLetter(letterId) {
  const letters = readLetters();
  const next = letters.filter((letter) => letter.id !== letterId);
  if (next.length === letters.length) return;
  if (!writeLetters(next)) {
    showToast('删除失败，请检查浏览器存储空间。', 'warning');
    return;
  }
  closeLetter();
  renderList();
  showToast('信件已删除');
}

function handleClick(event) {
  const tab = event.target.closest('[data-letter-tab]');
  if (tab) {
    activeTab = tab.dataset.letterTab === 'user' ? 'user' : 'star';
    renderList();
    return;
  }

  const action = event.target.closest('[data-letter-action]')?.dataset.letterAction;
  if (action === 'write') {
    const letter = writeUserLetter();
    if (!letter) {
      showToast('请先在「写信专用」里添加可用字卡。', 'warning');
      return;
    }
    activeTab = 'user';
    renderList();
    openLetter(letter.id);
    return;
  }
  if (action === 'close') {
    closeLetter();
    return;
  }
  if (action === 'delete') {
    deleteLetter(event.target.closest('[data-letter-id]')?.dataset.letterId || activeLetterId);
    return;
  }

  const card = event.target.closest('.letter-card[data-letter-id]');
  if (card) openLetter(card.dataset.letterId);
}

function bindEvents() {
  if (!viewRoot || eventsBound) return;
  viewRoot.addEventListener('click', handleClick);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements?.modal && !elements.modal.hidden) closeLetter();
  });
  window.addEventListener('xinghui:letters-changed', () => {
    if (document.body.dataset.view === 'letter') renderList();
  });
  eventsBound = true;
}

export function initLetterView(root = document.getElementById('view-letter')) {
  if (!root) return false;
  viewRoot = root;
  viewRoot.innerHTML = `
    <div class="letter-page">
      <header class="letter-header">
        <div>
          <p class="letter-eyebrow">LETTERS</p>
          <h2 class="letter-title">信封</h2>
          <p class="letter-intro">有些话，写下来会比字卡停留得更久。</p>
        </div>
        <button class="letter-write-button" type="button" data-letter-action="write">写一封信</button>
      </header>

      <section class="letter-panel" aria-labelledby="letterListTitle">
        <div class="letter-panel__head">
          <div class="letter-tabs" role="tablist" aria-label="信件分类">
            <button class="is-active" type="button" data-letter-tab="star" role="tab" aria-selected="true">他写的信</button>
            <button type="button" data-letter-tab="user" role="tab" aria-selected="false">我写的信</button>
          </div>
          <span class="letter-count" id="letterCount">0 封</span>
        </div>
        <div class="letter-list" id="letterList" aria-labelledby="letterListTitle"></div>
      </section>
    </div>
    <div class="letter-modal" id="letterModal" hidden></div>
    <div class="letter-toast" id="letterToast" role="status" aria-live="polite" hidden></div>
  `;
  elements = {
    tabs: Array.from(viewRoot.querySelectorAll('[data-letter-tab]')),
    count: viewRoot.querySelector('#letterCount'),
    list: viewRoot.querySelector('#letterList'),
    writeButton: viewRoot.querySelector('[data-letter-action="write"]'),
    modal: viewRoot.querySelector('#letterModal'),
    toast: viewRoot.querySelector('#letterToast'),
  };
  bindEvents();
  renderList();
  return true;
}

export function onLetterViewEnter() {
  renderList();
}
