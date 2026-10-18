import '../styles/favorites.css';
import {
  CHAT_CHANGED_EVENT,
  DATA_RESTORED_EVENT,
  FEED_CHANGED_EVENT,
  readCharacter,
  readChatMessages,
  readFeedPosts,
  readSettings,
  writeChatMessages,
  writeFeedPosts,
} from '../lib/storage.js';
import { getStickerBlob, setBlobImage } from '../lib/media-db.js';

let viewRoot = null;
let elements = null;
let eventsBound = false;
let toastTimer = null;

// 收藏分类：聊天（含表情包与图片）/ 卡片（问卷类信息）/ 朋友圈。
const KIND_LABEL = { chat: '聊天', card: '卡片', feed: '朋友圈' };

function showFavoritesToast(message) {
  const toast = elements?.toast;
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2400);
}

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
  if (message.role === 'user') return readSettings().userName || '我';
  if (message.role === 'system') return '消息';
  return readCharacter().name || '星回';
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

function createMediaContent(message, imageClass, altText) {
  const content = document.createElement('div');
  content.className = imageClass;
  if (/^idb:/i.test(message.content)) {
    const image = document.createElement('img');
    image.alt = altText;
    content.append(image);
    void getStickerBlob(message.content.slice(4))
      .then((blob) => { if (blob) setBlobImage(image, blob); })
      .catch(() => {});
  } else if (/^data:image\//i.test(message.content)) {
    const image = document.createElement('img');
    image.src = message.content;
    image.alt = altText;
    content.append(image);
  } else {
    const placeholder = document.createElement('span');
    placeholder.textContent = altText;
    content.append(placeholder);
  }
  return content;
}

function createMessageContent(message) {
  const content = document.createElement('div');
  content.className = 'favorite-card__content';

  if (message.withdrawn) {
    content.classList.add('is-withdrawn');
    const starName = readCharacter().name || '星回';
    content.textContent = message.role === 'user' ? '你撤回了一条消息' : starName + '撤回了一条消息';
    return content;
  }

  if (message.type === 'questionnaire') {
    content.classList.add('is-questionnaire');
    content.append(createQuestionnaireContent(message));
    return content;
  }

  if (message.type === 'image') {
    content.append(createMediaContent(message, 'favorite-card__image', '收藏的图片'));
    return content;
  }

  if (message.type === 'sticker') {
    content.classList.add('is-sticker');
    content.append(createMediaContent(message, 'favorite-card__sticker', '收藏的表情包'));
    return content;
  }

  if (message.tag) {
    content.classList.add('is-tagged');
    const tag = document.createElement('span');
    tag.className = 'favorite-card__tag';
    tag.textContent = message.tag;
    content.append(tag);
    const text = document.createElement('span');
    text.className = 'favorite-card__text';
    text.textContent = message.content || '（空消息）';
    content.append(text);
    return content;
  }

  content.textContent = message.content || '（空消息）';
  return content;
}

function createPostContent(post) {
  const content = document.createElement('div');
  content.className = 'favorite-card__content';
  const text = document.createElement('p');
  text.className = 'favorite-card__post-text';
  text.textContent = post.content || '（图片动态）';
  content.append(text);

  if (post.images?.length) {
    const media = document.createElement('div');
    media.className = 'favorite-card__images';
    post.images.slice(0, 3).forEach((source) => {
      const image = document.createElement('img');
      image.src = source;
      image.alt = '朋友圈图片';
      media.append(image);
    });
    content.append(media);
  }
  return content;
}

function createFavoriteCard(item) {
  const article = document.createElement('article');
  article.className = 'favorite-card';

  const header = document.createElement('header');
  header.className = 'favorite-card__header';

  const sender = document.createElement('strong');
  const isPost = item.type === 'post';
  sender.textContent = isPost
    ? (item.data.author === 'star' ? (readCharacter().name || '星回') : (readSettings().userName || '我'))
    : senderName(item.data);

  const time = document.createElement('time');
  time.dateTime = new Date(item.data.timestamp || item.data.createdAt).toISOString();
  time.textContent = formatFavoriteTime(item.data.timestamp || item.data.createdAt);

  header.append(sender, time);

  const chip = document.createElement('span');
  chip.className = `favorite-card__kind favorite-card__kind--${item.kind}`;
  chip.textContent = KIND_LABEL[item.kind] || '聊天';
  article.append(header, chip);
  article.append(isPost ? createPostContent(item.data) : createMessageContent(item.data));

  const footer = document.createElement('footer');
  footer.className = 'favorite-card__footer';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'favorite-card__remove';
  remove.dataset.favoriteRemove = item.id;
  remove.dataset.favoriteKind = item.column;
  remove.dataset.favoriteType = item.type;
  remove.textContent = '取消收藏';
  footer.append(remove);
  article.append(footer);
  return article;
}

function renderColumn(container, items, emptyTitle, emptyHint) {
  if (!container) return;

  container.replaceChildren();
  if (!items.length) {
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

  items.forEach((item) => container.append(createFavoriteCard(item)));
}

function collectFavorites() {
  const messages = readChatMessages();
  const posts = readFeedPosts();
  const mine = [];
  const star = [];

  messages.forEach((message) => {
    const kind = message.type === 'questionnaire' ? 'card' : 'chat';
    if (message.favorited) mine.push({ id: message.id, kind, type: 'message', column: 'mine', data: message });
    if (message.starFavorited) star.push({ id: message.id, kind, type: 'message', column: 'star', data: message });
  });

  posts.forEach((post) => {
    if (post.favorited) mine.push({ id: post.id, kind: 'feed', type: 'post', column: 'mine', data: post });
    if (post.starFavorited) star.push({ id: post.id, kind: 'feed', type: 'post', column: 'star', data: post });
  });

  const timeOf = (item) => item.data.timestamp || item.data.createdAt || 0;
  mine.sort((a, b) => timeOf(b) - timeOf(a));
  star.sort((a, b) => timeOf(b) - timeOf(a));
  return { mine, star };
}

function renderFavorites() {
  if (!elements) return;

  const { mine, star } = collectFavorites();

  elements.mineCount.textContent = `${mine.length} 条`;
  elements.starCount.textContent = `${star.length} 条`;

  const countKind = (list, kind) => list.filter((item) => item.kind === kind).length;
  if (elements.stats) {
    elements.stats.textContent = `共 ${mine.length + star.length} 条 · 我收藏 ${mine.length} 条（聊天 ${countKind(mine, 'chat')} · 卡片 ${countKind(mine, 'card')} · 朋友圈 ${countKind(mine, 'feed')}） · 梦角收藏 ${star.length} 条`;
  }

  renderColumn(
    elements.mineList,
    mine,
    '还没有收藏内容',
    '聊天消息、问卷卡片与朋友圈动态都可以收藏，收藏后会出现在这里。',
  );
  renderColumn(
    elements.starList,
    star,
    '星回还没有收藏内容',
    '在设置里调整「星回自动收藏」概率后，星回会收藏你的消息、卡片或朋友圈。',
  );
}

function toggleFavorite(id, column, type) {
  if (type === 'post') {
    const posts = readFeedPosts();
    const post = posts.find((item) => item.id === id);
    if (!post) return false;
    if (column === 'star') post.starFavorited = false;
    else post.favorited = false;
    return Boolean(writeFeedPosts(posts));
  }

  const messages = readChatMessages();
  const target = messages.find((message) => message.id === id);
  if (!target) return false;
  if (column === 'star') target.starFavorited = false;
  else target.favorited = false;
  return Boolean(writeChatMessages(messages));
}

function handleFavoritesClick(event) {
  const button = event.target.closest('[data-favorite-remove]');
  if (!button) return;
  const id = button.dataset.favoriteRemove;
  const column = button.dataset.favoriteKind;
  const type = button.dataset.favoriteType;
  if (toggleFavorite(id, column, type)) {
    showFavoritesToast('已取消收藏');
  }
}

function bindEvents() {
  if (eventsBound || typeof window === 'undefined') return;

  const renderIfActive = () => {
    if (document.body.dataset.view === 'favorites') renderFavorites();
  };
  window.addEventListener(CHAT_CHANGED_EVENT, renderIfActive);
  window.addEventListener(FEED_CHANGED_EVENT, renderIfActive);
  window.addEventListener(DATA_RESTORED_EVENT, renderIfActive);
  viewRoot?.addEventListener('click', handleFavoritesClick);
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
        <p class="favorites-intro">按「聊天 / 卡片 / 朋友圈」整理我与星回想留住的片段。</p>
        <p class="favorites-stats" id="favoritesStats">—</p>
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
      </div>

      <div class="favorites-toast" id="favoritesToast" role="status" aria-live="polite" hidden></div>
    </div>
  `;

  elements = {
    mineCount: viewRoot.querySelector('#favoritesMineCount'),
    starCount: viewRoot.querySelector('#favoritesStarCount'),
    mineList: viewRoot.querySelector('#favoritesMineList'),
    starList: viewRoot.querySelector('#favoritesStarList'),
    stats: viewRoot.querySelector('#favoritesStats'),
    toast: viewRoot.querySelector('#favoritesToast'),
  };

  bindEvents();
  renderFavorites();
  return true;
}

export function onFavoritesViewEnter() {
  renderFavorites();
}
