import '../styles/pat.css';
import { pickRandom, randomChance } from '../lib/random.js';
import {
  CHARACTER_CHANGED_EVENT,
  readCharacter,
  readPatCards,
  readSettings,
} from '../lib/storage.js';
import { addChatMessage } from './chat.js';

export const PAT_ACTIVITY_EVENT = 'xinghui:pat-activity';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 16;
const PAT_REPLY_DELAY_MS = 560;

let viewRoot = null;
let elements = null;
let eventsBound = false;
let pressState = null;
let patLocked = false;

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function createMessageId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fillAvatar(container) {
  if (!container) return;
  const { avatar } = readCharacter();
  container.replaceChildren();

  if (avatar) {
    const image = document.createElement('img');
    image.src = avatar;
    image.alt = '';
    container.append(image);
    return;
  }

  const fallback = document.createElement('span');
  fallback.textContent = '星';
  container.append(fallback);
}

function renderAvatar() {
  fillAvatar(elements?.avatar);
}

function createActivityElement(activity) {
  const article = document.createElement('article');
  article.className = `pat-activity pat-activity--${activity.kind}`;

  if (activity.kind === 'pat') {
    const line = document.createElement('p');
    line.textContent = activity.message?.content || '你拍了拍星回';
    article.append(line);
    return article;
  }

  const avatar = document.createElement('span');
  avatar.className = 'pat-activity__avatar';
  avatar.textContent = '星';
  avatar.setAttribute('aria-hidden', 'true');

  const bubble = document.createElement('p');
  bubble.textContent = activity.message?.content || '';
  article.append(avatar, bubble);
  return article;
}

function appendActivity(activity) {
  if (!elements?.feed) return;

  elements.feed.querySelector('.pat-empty')?.remove();
  elements.feed.append(createActivityElement(activity));
  elements.feed.scrollTo({ top: elements.feed.scrollHeight, behavior: 'smooth' });
}

function dispatchActivity(activity) {
  window.dispatchEvent(new CustomEvent(PAT_ACTIVITY_EVENT, { detail: activity }));
}

function showFloatingMessage(target, message, tone = 'pat') {
  if (!target?.isConnected || typeof document === 'undefined') return;

  const rect = target.getBoundingClientRect();
  const bubble = document.createElement('div');
  bubble.className = `pat-floating pat-floating--${tone}`;
  bubble.textContent = message;
  document.body.append(bubble);

  const halfWidth = bubble.offsetWidth / 2;
  const left = Math.min(
    window.innerWidth - halfWidth - 12,
    Math.max(halfWidth + 12, rect.left + rect.width / 2),
  );
  bubble.style.left = `${left}px`;
  bubble.style.top = `${Math.max(12, rect.top - 8)}px`;

  window.requestAnimationFrame(() => bubble.classList.add('is-visible'));
  window.setTimeout(() => {
    bubble.classList.remove('is-visible');
    window.setTimeout(() => bubble.remove(), 180);
  }, 1900);
}

async function triggerPat(target) {
  if (patLocked || !target) return;
  patLocked = true;

  const settings = readSettings();
  const patMessage = addChatMessage(
    {
      id: createMessageId('pat'),
      role: 'system',
      type: 'pat',
      content: '你拍了拍星回',
      timestamp: Date.now(),
      read: true,
      favorited: false,
      starFavorited: false,
      withdrawn: false,
    },
    { persist: true, scroll: true },
  );

  if (!patMessage) {
    patLocked = false;
    return;
  }

  const patActivity = { kind: 'pat', message: patMessage };
  dispatchActivity(patActivity);
  appendActivity(patActivity);
  if (!viewRoot?.contains(target)) showFloatingMessage(target, patMessage.content, 'pat');

  try {
    if (!randomChance(settings.patReply)) return;

    const cards = readPatCards()
      .map((card) => ({ ...card, content: String(card.content || '').trim() }))
      .filter((card) => card.content);
    if (!cards.length) return;

    await wait(PAT_REPLY_DELAY_MS);
    const card = pickRandom(cards);
    if (!card) return;

    const replyMessage = addChatMessage(
      {
        id: createMessageId('msg'),
        role: 'star',
        type: 'text',
        content: card.content,
        timestamp: Date.now(),
        read: false,
        favorited: false,
        starFavorited: randomChance(settings.starFavorite),
        withdrawn: false,
      },
      { persist: true, scroll: true },
    );

    if (!replyMessage) return;
    const replyActivity = { kind: 'reply', message: replyMessage };
    dispatchActivity(replyActivity);
    appendActivity(replyActivity);
    if (!viewRoot?.contains(target)) showFloatingMessage(target, replyMessage.content, 'reply');
  } finally {
    patLocked = false;
  }
}

function clearLongPress() {
  if (!pressState) return;
  window.clearTimeout(pressState.timer);
  pressState.target?.classList.remove('is-pressing');
  pressState = null;
}

function showPatPress(target) {
  target.classList.remove('is-pressing');
  target.classList.add('is-patted');
  window.setTimeout(() => target.classList.remove('is-patted'), 320);
}

function handlePointerDown(event) {
  const target = event.target.closest?.('[data-pat-avatar]');
  if (!target || event.isPrimary === false) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (target.matches(':disabled')) return;

  clearLongPress();
  target.classList.add('is-pressing');
  pressState = {
    pointerId: event.pointerId,
    target,
    pointerType: event.pointerType,
    startX: event.clientX,
    startY: event.clientY,
    timer: window.setTimeout(() => {
      const current = pressState;
      pressState = null;
      if (!current) return;
      showPatPress(current.target);
      void triggerPat(current.target);
    }, LONG_PRESS_MS),
  };
}

function handlePointerMove(event) {
  if (!pressState || event.pointerId !== pressState.pointerId) return;
  const distance = Math.hypot(event.clientX - pressState.startX, event.clientY - pressState.startY);
  if (distance > MOVE_TOLERANCE) clearLongPress();
}

function handlePointerEnd(event) {
  if (!pressState || event.pointerId !== pressState.pointerId) return;
  clearLongPress();
}

function handlePointerLeave(event) {
  if (!pressState || event.pointerId !== pressState.pointerId) return;
  if (pressState.pointerType === 'mouse') clearLongPress();
}

function handleKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (event.repeat) return;
  const target = event.target.closest?.('[data-pat-avatar]');
  if (!target) return;

  event.preventDefault();
  showPatPress(target);
  void triggerPat(target);
}

function bindEvents() {
  if (eventsBound || typeof document === 'undefined') return;

  document.addEventListener('pointerdown', handlePointerDown);
  document.addEventListener('pointermove', handlePointerMove);
  document.addEventListener('pointerup', handlePointerEnd);
  document.addEventListener('pointercancel', handlePointerEnd);
  document.addEventListener('pointerleave', handlePointerLeave);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('scroll', clearLongPress, { passive: true, capture: true });
  window.addEventListener('blur', clearLongPress);
  document.addEventListener('contextmenu', (event) => {
    if (event.target.closest?.('[data-pat-avatar]')) event.preventDefault();
  });
  window.addEventListener(CHARACTER_CHANGED_EVENT, renderAvatar);
  eventsBound = true;
}

export function initPatView(root = document.getElementById('view-pat')) {
  if (!root) return false;

  viewRoot = root;
  viewRoot.innerHTML = `
    <div class="pat-page">
      <header class="pat-header">
        <p class="pat-eyebrow">PAT &amp; POKE</p>
        <h2 class="pat-title">拍一拍</h2>
        <p class="pat-intro">长按星回头像，轻轻拍一拍。星回是否回应，由设置中的拍一拍回复概率决定。</p>
      </header>

      <section class="pat-stage" aria-label="拍一拍互动">
        <div class="pat-avatar-orbit" aria-hidden="true"></div>
        <button
          class="pat-avatar"
          id="patAvatar"
          type="button"
          data-pat-avatar
          aria-label="长按或按回车拍一拍星回"
        ></button>
        <p class="pat-hint"><span aria-hidden="true">○</span> 长按头像触发</p>
      </section>

      <section class="pat-feed-panel" aria-labelledby="patFeedTitle">
        <div class="pat-feed-heading">
          <h3 id="patFeedTitle">本次互动</h3>
          <span>拍一拍记录</span>
        </div>
        <div class="pat-feed" id="patFeed" role="log" aria-live="polite">
          <div class="pat-empty">
            <span aria-hidden="true">✦</span>
            <p>还没拍过，长按上面的头像试试。</p>
          </div>
        </div>
      </section>
    </div>
  `;

  elements = {
    avatar: viewRoot.querySelector('#patAvatar'),
    feed: viewRoot.querySelector('#patFeed'),
  };

  bindEvents();
  renderAvatar();
  return true;
}
