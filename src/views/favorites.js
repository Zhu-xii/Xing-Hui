import '../styles/favorites.css';
import { CHAT_CHANGED_EVENT, DATA_RESTORED_EVENT, readChatMessages } from '../lib/storage.js';
import { getStickerBlob, setBlobImage } from '../lib/media-db.js';

let viewRoot = null;
let elements = null;
let eventsBound = false;

function formatFavoriteTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--';

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hours}:${minutes}`;
}

function senderName(message) {
  if (message.role === 'user') return '我';
  if (message.role === 'system') return '消息';
  return '星回';
}

function createQuestionnaireContent(message) {
  const wrapper = document.createElement('div');
  wrapper.className = 'favorite-card__questionnaire';
  const questionnaire = message.questionnaire || {};

  const question = document.createElement('strong');
  question.textContent = questionnaire.question || '（未填写问题）';
  wrapper.append(question);

  if (questionnaire.options?.length) {
    const list = document.createElement('ul');
    questionnaire.options.forEach((option) => {
      const item = document.createElement('li');
      const selected = questionnaire.selected?.includes(option);
      item.className = selected ? 'is-selected' : '';
      item.textContent = `${selected ? '√ ' : ''}${option}`;
      list.append(item);
    });
    wrapper.append(list);
  }

  if (questionnaire.answer) {
    const answer = document.createElement('p');
    answer.className = 'favorite-card__answer';
    answer.textContent = questionnaire.answer;
    wrapper.append(answer);
  }

  return wrapper;
}
function createMessageContent(message) {
  const content = document.createElement('div');
  content.className = 'favorite-card__content';

  if (message.withdrawn) {
    content.classList.add('is-withdrawn');
    content.textContent = '你撤回了一条消息';
    return content;
  }

  if (message.type === 'questionnaire') {
    content.classList.add('is-questionnaire');
    content.append(createQuestionnaireContent(message));
    return content;
  }

  if (message.type === 'sticker') {
    content.classList.add('is-sticker');
    if (/^idb:/i.test(message.content)) {
      const image = document.createElement('img');
      image.alt = '收藏的表情包';
      content.append(image);
      void getStickerBlob(message.content.slice(4))
        .then((blob) => { if (blob) setBlobImage(image, blob); })
        .catch(() => {});
    } else if (/^data:image\//i.test(message.content)) {
      const image = document.createElement('img');
      image.src = message.content;
      image.alt = '收藏的表情包';
      content.append(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.textContent = '☺ 表情包';
      content.append(placeholder);
    }
    return content;
  }

  content.textContent = message.content || '（空消息）';
  return content;
}

function createFavoriteCard(message) {
  const article = document.createElement('article');
  article.className = `favorite-card favorite-card--${message.role}`;

  const header = document.createElement('header');
  header.className = 'favorite-card__header';

  const sender = document.createElement('strong');
  sender.textContent = senderName(message);

  const time = document.createElement('time');
  time.dateTime = new Date(message.timestamp).toISOString();
  time.textContent = formatFavoriteTime(message.timestamp);

  header.append(sender, time);
  article.append(header, createMessageContent(message));
  return article;
}

function renderColumn(container, messages, emptyTitle, emptyHint) {
  if (!container) return;

  container.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'favorites-empty';

    const mark = document.createElement('span');
    mark.textContent = '☆';
    mark.setAttribute('aria-hidden', 'true');

    const title = document.createElement('strong');
    title.textContent = emptyTitle;

    const hint = document.createElement('p');
    hint.textContent = emptyHint;

    empty.append(mark, title, hint);
    container.append(empty);
    return;
  }

  messages.forEach((message) => container.append(createFavoriteCard(message)));
}

function renderFavorites() {
  if (!elements) return;

  const messages = readChatMessages();
  const mine = messages
    .filter((message) => message.favorited && message.type !== 'questionnaire')
    .sort((first, second) => second.timestamp - first.timestamp);
  const star = messages
    .filter((message) => message.starFavorited)
    .sort((first, second) => second.timestamp - first.timestamp);
  const questionnaires = messages
    .filter((message) => message.type === 'questionnaire' && message.favorited)
    .sort((first, second) => second.timestamp - first.timestamp);

  elements.mineCount.textContent = `${mine.length} 条`;
  elements.starCount.textContent = `${star.length} 条`;
  elements.questionnaireCount.textContent = `${questionnaires.length} 条`;

  renderColumn(
    elements.mineList,
    mine,
    '还没有收藏消息',
    '在聊天气泡的操作栏中点击“收藏”，消息会出现在这里。',
  );
  renderColumn(
    elements.starList,
    star,
    '星回还没有收藏消息',
    '星回回复时会按设置概率标记梦角收藏。',
  );
  renderColumn(
    elements.questionnaireList,
    questionnaires,
    '还没有收藏问卷',
    '在问卷卡片操作栏中点击“收藏”，问卷会出现在这里。',
  );
}

function bindEvents() {
  if (eventsBound || typeof window === 'undefined') return;

  window.addEventListener(CHAT_CHANGED_EVENT, renderFavorites);
  window.addEventListener(DATA_RESTORED_EVENT, renderFavorites);
  eventsBound = true;
}

export function initFavoritesView(root = document.getElementById('view-favorites')) {
  if (!root) return false;

  viewRoot = root;
  viewRoot.innerHTML = `
    <div class="favorites-page">
      <header class="favorites-header">
        <p class="favorites-eyebrow">SAVED MESSAGES</p>
        <h2 class="favorites-title">收藏</h2>
        <p class="favorites-intro">从聊天记录中整理我与星回想留住的片段。</p>
      </header>

      <div class="favorites-grid">
        <section class="favorites-panel" aria-labelledby="favoritesMineTitle">
          <div class="favorites-panel__heading">
            <div>
              <span class="favorites-panel__mark" aria-hidden="true">我</span>
              <h3 id="favoritesMineTitle">我收藏的</h3>
            </div>
            <span id="favoritesMineCount">0 条</span>
          </div>
          <div class="favorites-list" id="favoritesMineList"></div>
        </section>

        <section class="favorites-panel favorites-panel--star" aria-labelledby="favoritesStarTitle">
          <div class="favorites-panel__heading">
            <div>
              <span class="favorites-panel__mark" aria-hidden="true">星</span>
              <h3 id="favoritesStarTitle">梦角收藏的</h3>
            </div>
            <span id="favoritesStarCount">0 条</span>
          </div>
          <div class="favorites-list" id="favoritesStarList"></div>
        </section>

        <section class="favorites-panel favorites-panel--questionnaire" aria-labelledby="favoritesQuestionnaireTitle">
          <div class="favorites-panel__heading">
            <div>
              <span class="favorites-panel__mark" aria-hidden="true">问</span>
              <h3 id="favoritesQuestionnaireTitle">问卷收藏</h3>
            </div>
            <span id="favoritesQuestionnaireCount">0 条</span>
          </div>
          <div class="favorites-list" id="favoritesQuestionnaireList"></div>
        </section>
      </div>
    </div>
  `;

  elements = {
    mineCount: viewRoot.querySelector('#favoritesMineCount'),
    starCount: viewRoot.querySelector('#favoritesStarCount'),
    questionnaireCount: viewRoot.querySelector('#favoritesQuestionnaireCount'),
    mineList: viewRoot.querySelector('#favoritesMineList'),
    starList: viewRoot.querySelector('#favoritesStarList'),
    questionnaireList: viewRoot.querySelector('#favoritesQuestionnaireList'),
  };

  bindEvents();
  renderFavorites();
  return true;
}

export function onFavoritesViewEnter() {
  renderFavorites();
}
