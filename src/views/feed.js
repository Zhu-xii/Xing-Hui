import '../styles/feed.css';
import { getAvatarBlob, getStickerBlob, setBlobImage } from '../lib/media-db.js';
import { pickRandom, randomChance } from '../lib/random.js';
import {
  CHARACTER_CHANGED_EVENT,
  FEED_CHANGED_EVENT,
  FEED_NOTICES_CHANGED_EVENT,
  SETTINGS_CHANGED_EVENT,
  applyNicknamePlaceholders,
  readCards,
  readCharacter,
  readFeedAutoPostState,
  readFeedNotices,
  readFeedPosts,
  readSettings,
  readStickers,
  writeFeedAutoPostState,
  writeFeedNotices,
  writeFeedPosts,
} from '../lib/storage.js';

const MAX_FEED_IMAGE_BYTES = 1.5 * 1024 * 1024;
const MAX_FEED_IMAGES = 9;

const MINUTE_MS = 60 * 1000;

const STAR_FALLBACK_POSTS = [
  '今天也有好好生活呀。',
  '刚刚看到一朵云，像棉花糖。',
  '突然想起你说过的一句话。',
  '晚饭吃得很满足。',
  '窗外的风很舒服，分享给你。',
  '有点困了，但还是想和你说声晚安。',
];

const FEED_GROUPS = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '本周' },
  { key: 'earlier', label: '更早' },
];

let viewRoot = null;
let elements = null;
let eventsBound = false;
let autoPostTimer = null;

const draftImages = [];
const commentDrafts = new Map();
const replyTargets = new Map();
const pendingStickers = new Map();
let stickerChoices = [];
let activeStickerPostId = '';

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

let feedToastTimer = null;

function showFeedToast(message) {
  const toast = elements?.toast;
  if (!toast || !message) return;
  window.clearTimeout(feedToastTimer);
  toast.textContent = message;
  toast.hidden = false;
  feedToastTimer = window.setTimeout(() => { toast.hidden = true; }, 2600);
}

// 星回按概率收藏我发的朋友圈动态。
function maybeStarFavoritePost(postId) {
  if (!randomChance(readSettings().starFavoriteFeed)) return false;
  let marked = false;
  updatePosts((posts) => {
    const post = posts.find((item) => item.id === postId);
    if (!post || post.starFavorited) return;
    post.starFavorited = true;
    marked = true;
  });
  if (marked) {
    showFeedToast(`${starDisplayName()}收藏了一条信息`);
    renderPosts();
  }
  return marked;
}

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`;
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const today = new Date();
  if (date.getFullYear() === today.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function startOfDay(timestamp) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfWeek(timestamp) {
  const date = new Date(startOfDay(timestamp));
  const shift = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - shift);
  return date.getTime();
}

function bucketKeyFor(timestamp) {
  const now = Date.now();
  if (timestamp >= startOfDay(now)) return 'today';
  if (timestamp >= startOfWeek(now)) return 'week';
  return 'earlier';
}

function userDisplayName(settings = readSettings()) {
  return settings.userName || '我';
}

function starDisplayName(character = readCharacter()) {
  return character.name || '星回';
}

function authorName(author) {
  return author === 'star' ? starDisplayName() : userDisplayName();
}

function stickerRefOf(sticker) {
  if (!sticker) return '';
  if (sticker.storage === 'indexeddb' || (!sticker.image && sticker.id)) {
    return sticker.id ? `idb:${sticker.id}` : '';
  }
  const image = typeof sticker.image === 'string' ? sticker.image.trim() : '';
  return /^data:image\//i.test(image) ? image : '';
}

function applyStickerRef(image, ref) {
  if (!image || !ref) return;
  if (/^idb:/i.test(ref)) {
    const stickerId = ref.slice(4);
    void getStickerBlob(stickerId)
      .then((blob) => {
        if (!blob) throw new Error('sticker-missing');
        setBlobImage(image, blob);
      })
      .catch(() => {
        image.dataset.missing = 'true';
        image.alt = '表情包不可用';
      });
    return;
  }
  if (/^data:image\//i.test(ref)) image.src = ref;
}

async function fillAvatar(container, kind) {
  if (!container) return;
  const character = readCharacter();
  const settings = readSettings();
  const source = kind === 'star' ? character.avatar : settings.userAvatar;
  const fallback = kind === 'star' ? (character.name || '星').slice(0, 1) : userDisplayName(settings).slice(0, 1);

  container.replaceChildren();
  if (!source) {
    container.textContent = fallback;
    return;
  }

  const image = document.createElement('img');
  image.alt = '';
  container.append(image);

  if (source === 'idb:star' || source === 'idb:user') {
    try {
      const blob = await getAvatarBlob(kind);
      if (!blob) throw new Error('avatar-missing');
      setBlobImage(image, blob);
    } catch {
      image.remove();
      container.textContent = fallback;
    }
    return;
  }

  image.src = source;
}

function renderComposerPreview() {
  if (!elements?.preview) return;
  elements.preview.replaceChildren();
  elements.preview.hidden = draftImages.length === 0;
  if (!draftImages.length) return;

  const grid = document.createElement('div');
  grid.className = 'feed-composer__grid';

  draftImages.forEach((source, index) => {
    const item = document.createElement('div');
    item.className = 'feed-composer__thumb';

    const image = document.createElement('img');
    image.src = source;
    image.alt = '朋友圈图片预览';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.feedAction = 'remove-image';
    remove.dataset.imageIndex = String(index);
    remove.textContent = '×';
    remove.setAttribute('aria-label', '移除图片');

    item.append(image, remove);
    grid.append(item);
  });

  elements.preview.append(grid);
}

function renderMedia(post) {
  if (!post.images.length) return null;
  const grid = document.createElement('div');
  grid.className = 'feed-media';
  if (post.images.length === 1) grid.classList.add('feed-media--single');

  post.images.forEach((source, index) => {
    const image = document.createElement('img');
    image.className = 'feed-media__item';
    image.src = source;
    image.alt = `朋友圈图片 ${index + 1}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    grid.append(image);
  });

  return grid;
}

function findRootId(comment, byId) {
  let current = comment;
  const seen = new Set([comment.id]);
  while (current?.replyTo && byId.has(current.replyTo)) {
    const parent = byId.get(current.replyTo);
    if (!parent.replyTo || !byId.has(parent.replyTo)) return parent.id;
    if (seen.has(parent.id)) return parent.id;
    seen.add(parent.id);
    current = parent;
  }
  return null;
}

function createCommentRow(post, comment, isReply) {
  const row = document.createElement('div');
  row.className = isReply ? 'feed-comment feed-comment--reply' : 'feed-comment';
  row.dataset.commentId = comment.id;

  const name = document.createElement('strong');
  name.textContent = authorName(comment.author);
  row.append(name);

  if (isReply && comment.replyToName) {
    const separator = document.createElement('span');
    separator.className = 'feed-comment__sep';
    separator.textContent = '回复';
    const target = document.createElement('strong');
    target.textContent = comment.replyToName;
    row.append(separator, target);
  }

  row.append(document.createTextNode('：'));

  if (comment.content) row.append(document.createTextNode(comment.content));

  if (comment.sticker) {
    const sticker = document.createElement('img');
    sticker.className = 'feed-comment__sticker';
    sticker.alt = '表情包';
    sticker.loading = 'lazy';
    row.append(sticker);
    applyStickerRef(sticker, comment.sticker);
  }

  const reply = document.createElement('button');
  reply.type = 'button';
  reply.className = 'feed-comment__reply';
  reply.dataset.feedAction = 'reply';
  reply.dataset.postId = post.id;
  reply.dataset.commentId = comment.id;
  reply.dataset.commentAuthor = authorName(comment.author);
  reply.textContent = '回复';
  row.append(reply);

  return row;
}

function renderComments(post) {
  const wrap = document.createElement('div');
  wrap.className = 'feed-comments';
  if (!post.comments.length) {
    wrap.hidden = true;
    return wrap;
  }

  const byId = new Map(post.comments.map((comment) => [comment.id, comment]));
  const roots = post.comments.filter((comment) => !comment.replyTo || !byId.has(comment.replyTo));
  const repliesByRoot = new Map();

  post.comments.forEach((comment) => {
    if (!comment.replyTo || !byId.has(comment.replyTo)) return;
    const rootId = findRootId(comment, byId);
    if (!rootId) return;
    if (!repliesByRoot.has(rootId)) repliesByRoot.set(rootId, []);
    repliesByRoot.get(rootId).push(comment);
  });

  roots.forEach((root) => {
    wrap.append(createCommentRow(post, root, false));
    const replies = (repliesByRoot.get(root.id) || []).sort((first, second) => first.createdAt - second.createdAt);
    if (!replies.length) return;
    const replyList = document.createElement('div');
    replyList.className = 'feed-replies';
    replies.forEach((reply) => replyList.append(createCommentRow(post, reply, true)));
    wrap.append(replyList);
  });

  return wrap;
}

function renderCommentArea(post) {
  const area = document.createElement('div');
  area.className = 'feed-comment-area';

  const reply = replyTargets.get(post.id);
  const sticker = pendingStickers.get(post.id);

  if (reply || sticker) {
    const chips = document.createElement('div');
    chips.className = 'feed-comment-chips';

    if (reply) {
      const chip = document.createElement('span');
      chip.className = 'feed-chip';
      chip.append(document.createTextNode(`回复 ${reply.name}`));
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.dataset.feedAction = 'cancel-reply';
      cancel.dataset.postId = post.id;
      cancel.textContent = '×';
      cancel.setAttribute('aria-label', '取消回复');
      chip.append(cancel);
      chips.append(chip);
    }

    if (sticker) {
      const chip = document.createElement('span');
      chip.className = 'feed-chip feed-chip--sticker';
      const image = document.createElement('img');
      image.alt = '表情包';
      applyStickerRef(image, sticker);
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.dataset.feedAction = 'cancel-sticker';
      cancel.dataset.postId = post.id;
      cancel.textContent = '×';
      cancel.setAttribute('aria-label', '移除表情包');
      chip.append(image, cancel);
      chips.append(chip);
    }

    area.append(chips);
  }

  const form = document.createElement('form');
  form.className = 'feed-comment-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'comment';
  input.maxLength = 500;
  input.placeholder = reply ? `回复 ${reply.name}…` : '写评论…';
  input.autocomplete = 'off';
  input.value = commentDrafts.get(post.id) || '';

  const stickerButton = document.createElement('button');
  stickerButton.type = 'button';
  stickerButton.className = 'feed-comment-sticker';
  stickerButton.dataset.feedAction = 'toggle-sticker';
  stickerButton.dataset.postId = post.id;
  stickerButton.textContent = '☺';
  stickerButton.title = '添加表情包';
  stickerButton.setAttribute('aria-label', '添加表情包');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'feed-comment-send';
  submit.textContent = '发送';

  form.append(input, stickerButton, submit);
  area.append(form);
  return area;
}

function createPostElement(post) {
  const card = document.createElement('article');
  card.className = 'feed-card';
  card.dataset.postId = post.id;

  const head = document.createElement('header');
  head.className = 'feed-card__head';

  const avatar = document.createElement('span');
  avatar.className = 'feed-avatar';
  head.append(avatar);

  const meta = document.createElement('div');
  meta.className = 'feed-card__meta';
  const name = document.createElement('strong');
  name.textContent = authorName(post.author);
  const time = document.createElement('small');
  time.textContent = formatTime(post.createdAt);
  meta.append(name, time);
  head.append(meta);

  if (post.author === 'user') {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'feed-card__delete';
    remove.dataset.feedAction = 'delete';
    remove.textContent = '删除';
    head.append(remove);
  }

  card.append(head);

  if (post.content) {
    const content = document.createElement('p');
    content.className = 'feed-card__content';
    content.textContent = post.content;
    card.append(content);
  }

  const media = renderMedia(post);
  if (media) card.append(media);

  const actions = document.createElement('div');
  actions.className = 'feed-card__actions';
  const like = document.createElement('button');
  like.type = 'button';
  like.dataset.feedAction = 'like';
  like.classList.toggle('is-active', post.likes.includes('user'));
  like.textContent = post.likes.length ? `♡ ${post.likes.length}` : '♡ 赞';
  actions.append(like);

  const favorite = document.createElement('button');
  favorite.type = 'button';
  favorite.dataset.feedAction = 'favorite';
  favorite.classList.toggle('is-active', Boolean(post.favorited));
  favorite.textContent = post.favorited ? '★ 已收藏' : '☆ 收藏';
  actions.append(favorite);
  card.append(actions);

  card.append(renderComments(post));
  card.append(renderCommentArea(post));

  void fillAvatar(avatar, post.author);
  return card;
}

function renderPosts() {
  if (!elements?.list) return;
  const posts = readFeedPosts();
  elements.list.replaceChildren();

  if (!posts.length) {
    const empty = document.createElement('div');
    empty.className = 'feed-empty';
    const title = document.createElement('strong');
    title.textContent = '朋友圈还没有动态';
    const hint = document.createElement('p');
    hint.textContent = '发布第一条动态，星回也会来评论。';
    empty.append(title, hint);
    elements.list.append(empty);
    return;
  }

  const groups = new Map(FEED_GROUPS.map((group) => [group.key, []]));
  posts.forEach((post) => {
    const key = bucketKeyFor(post.createdAt);
    if (groups.has(key)) groups.get(key).push(post);
  });

  FEED_GROUPS.forEach((group) => {
    const items = groups.get(group.key);
    if (!items.length) return;
    const heading = document.createElement('h3');
    heading.className = 'feed-group-title';
    heading.textContent = group.label;
    elements.list.append(heading);
    items.forEach((post) => elements.list.append(createPostElement(post)));
  });
}

function render() {
  renderComposerPreview();
  renderPosts();
  renderUnreadBadge();
}

function updatePosts(mutator) {
  const posts = readFeedPosts();
  mutator(posts);
  return writeFeedPosts(posts);
}

function starReplyContent() {
  const cards = readCards().filter((card) => !card.disabled && card.content);
  return applyNicknamePlaceholders(pickRandom(cards)?.content || '看到啦，我给你点个赞。');
}

function addNotice(type, postId, text, author = 'star') {
  const viewing = typeof document !== 'undefined' && document.body.dataset.view === 'feed';
  const notices = readFeedNotices();
  notices.unshift({
    id: createId('feed_notice'),
    type,
    postId,
    text,
    author,
    createdAt: Date.now(),
    read: viewing,
  });
  writeFeedNotices(notices);
  renderUnreadBadge();
}

function unreadFeedCount() {
  return readFeedNotices().filter((notice) => !notice.read).length;
}

function renderUnreadBadge() {
  const count = unreadFeedCount();
  const text = count > 99 ? '99+' : String(count);

  const homeBadge = document.getElementById('feedEntryBadge');
  if (homeBadge) {
    homeBadge.hidden = count === 0;
    homeBadge.textContent = text;
  }

  if (elements?.unreadBadge) {
    elements.unreadBadge.hidden = count === 0;
    elements.unreadBadge.textContent = text;
  }
}

function markFeedRead() {
  const notices = readFeedNotices();
  if (!notices.some((notice) => !notice.read)) return;
  writeFeedNotices(notices.map((notice) => ({ ...notice, read: true })));
  renderUnreadBadge();
}

function reactAsStar(postId, userCommentId = '') {
  const settings = readSettings();
  window.setTimeout(() => {
    let responded = false;
    updatePosts((posts) => {
      const post = posts.find((item) => item.id === postId);
      if (!post) return;

      if (!post.likes.includes('star') && randomChance(settings.feedLikeProbability)) {
        post.likes = [...post.likes, 'star'];
      }

      // 我评论后走「回应我的评论」概率，否则走「评论我的动态」概率。
      const commentChance = userCommentId ? settings.feedReplyProbability : settings.feedCommentProbability;
      if (randomChance(commentChance)) {
        const replyTo = userCommentId && randomChance(settings.feedReplyToCommentProbability) ? userCommentId : '';
        post.comments.push({
          id: createId('feed_comment'),
          author: 'star',
          content: starReplyContent().slice(0, 500),
          sticker: '',
          replyTo,
          replyToName: replyTo ? userDisplayName() : '',
          createdAt: Date.now(),
        });
        responded = true;
      }
    });

    if (responded) addNotice('comment', postId, `${starDisplayName()} 回应了你的朋友圈动态`, 'star');
    renderPosts();
  }, 900 + Math.random() * 900);
}

function publishPost() {
  const content = elements?.text?.value.trim() || '';
  if (!content && !draftImages.length) {
    elements?.text?.focus();
    return;
  }

  const post = {
    id: createId('feed'),
    author: 'user',
    content: content.slice(0, 2000),
    images: draftImages.slice(),
    createdAt: Date.now(),
    likes: [],
    comments: [],
  };

  const saved = writeFeedPosts([post, ...readFeedPosts()]);
  if (!saved) return;

  maybeStarFavoritePost(post.id);

  elements.text.value = '';
  if (elements.imageInput) elements.imageInput.value = '';
  draftImages.length = 0;
  render();
  reactAsStar(post.id);
}

function addDraftImage(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > MAX_FEED_IMAGE_BYTES) {
    window.alert('朋友圈图片不能超过 1.5MB。');
    return;
  }
  if (draftImages.length >= MAX_FEED_IMAGES) {
    window.alert(`最多只能添加 ${MAX_FEED_IMAGES} 张图片。`);
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    if (typeof reader.result !== 'string') return;
    if (draftImages.length >= MAX_FEED_IMAGES) return;
    draftImages.push(reader.result);
    renderComposerPreview();
  });
  reader.readAsDataURL(file);
}

function handleImageChange(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  files.forEach(addDraftImage);
}

function renderStickerPanel() {
  if (!elements?.stickerGrid) return;
  stickerChoices = readStickers().filter((sticker) => sticker.enabled !== false).map(stickerRefOf).filter(Boolean);
  elements.stickerGrid.replaceChildren();

  if (!stickerChoices.length) {
    const empty = document.createElement('p');
    empty.className = 'feed-sticker-empty';
    empty.textContent = '还没有可用的表情包，去「管理」里添加吧。';
    elements.stickerGrid.append(empty);
    return;
  }

  stickerChoices.forEach((ref, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'feed-sticker-item';
    button.dataset.feedAction = 'pick-sticker';
    button.dataset.stickerIndex = String(index);

    const image = document.createElement('img');
    image.alt = '表情包';
    image.loading = 'lazy';
    applyStickerRef(image, ref);

    button.append(image);
    elements.stickerGrid.append(button);
  });
}

function openStickerPanel(postId) {
  if (!elements?.stickerPanel) return;
  activeStickerPostId = postId;
  renderStickerPanel();
  elements.stickerPanel.hidden = false;
}

function closeStickerPanel() {
  activeStickerPostId = '';
  if (elements?.stickerPanel) elements.stickerPanel.hidden = true;
}

function handleClick(event) {
  const button = event.target.closest('[data-feed-action]');
  if (!button) return;
  const action = button.dataset.feedAction;
  const card = button.closest('[data-post-id]');
  const postId = card?.dataset.postId || button.dataset.postId;

  if (action === 'remove-image') {
    const index = Number(button.dataset.imageIndex);
    if (Number.isInteger(index)) draftImages.splice(index, 1);
    if (elements?.imageInput) elements.imageInput.value = '';
    renderComposerPreview();
    return;
  }

  if (action === 'favorite' && postId) {
    updatePosts((posts) => {
      const post = posts.find((item) => item.id === postId);
      if (!post) return;
      post.favorited = !post.favorited;
    });
    renderPosts();
    showFeedToast('收藏状态已更新');
    return;
  }

  if (action === 'like' && postId) {
    updatePosts((posts) => {
      const post = posts.find((item) => item.id === postId);
      if (!post) return;
      post.likes = post.likes.includes('user')
        ? post.likes.filter((item) => item !== 'user')
        : [...post.likes, 'user'];
    });
    renderPosts();
    return;
  }

  if (action === 'delete' && postId) {
    if (!window.confirm('删除这条朋友圈动态？')) return;
    writeFeedPosts(readFeedPosts().filter((post) => post.id !== postId));
    replyTargets.delete(postId);
    pendingStickers.delete(postId);
    commentDrafts.delete(postId);
    renderPosts();
    return;
  }

  if (action === 'reply' && postId) {
    replyTargets.set(postId, { commentId: button.dataset.commentId, name: button.dataset.commentAuthor || '对方' });
    renderPosts();
    const cardEl = viewRoot?.querySelector(`[data-post-id="${postId}"]`);
    cardEl?.querySelector('input[name="comment"]')?.focus();
    return;
  }

  if (action === 'cancel-reply' && postId) {
    replyTargets.delete(postId);
    renderPosts();
    return;
  }

  if (action === 'toggle-sticker' && postId) {
    if (activeStickerPostId === postId && !elements.stickerPanel?.hidden) closeStickerPanel();
    else openStickerPanel(postId);
    return;
  }

  if (action === 'pick-sticker') {
    const index = Number(button.dataset.stickerIndex);
    const ref = stickerChoices[index];
    if (!activeStickerPostId || !ref) return;
    pendingStickers.set(activeStickerPostId, ref);
    closeStickerPanel();
    renderPosts();
    return;
  }

  if (action === 'cancel-sticker' && postId) {
    pendingStickers.delete(postId);
    renderPosts();
    return;
  }

  if (action === 'close-sticker') {
    closeStickerPanel();
  }
}

function handleInput(event) {
  const input = event.target.closest('.feed-comment-form input[name="comment"]');
  if (!input) return;
  const card = input.closest('[data-post-id]');
  const postId = card?.dataset.postId;
  if (!postId) return;
  commentDrafts.set(postId, input.value);
}

function handleSubmit(event) {
  if (event.target === elements?.composer) {
    event.preventDefault();
    publishPost();
    return;
  }

  const form = event.target.closest('.feed-comment-form');
  if (!form) return;
  event.preventDefault();

  const card = form.closest('[data-post-id]');
  const postId = card?.dataset.postId;
  const input = form.querySelector('input[name="comment"]');
  const content = input?.value.trim() || '';
  const sticker = pendingStickers.get(postId) || '';
  if (!postId || (!content && !sticker)) return;

  const reply = replyTargets.get(postId);
  const commentId = createId('feed_comment');

  updatePosts((posts) => {
    const post = posts.find((item) => item.id === postId);
    if (!post) return;
    post.comments.push({
      id: commentId,
      author: 'user',
      content: content.slice(0, 500),
      sticker,
      replyTo: reply ? reply.commentId : '',
      replyToName: reply ? reply.name : '',
      createdAt: Date.now(),
    });
  });

  commentDrafts.delete(postId);
  replyTargets.delete(postId);
  pendingStickers.delete(postId);
  renderPosts();
  reactAsStar(postId, commentId);
}

function autoPostMinDelay(settings) {
  return Math.max(1, Number(settings.feedPostIntervalMin) || 30) * MINUTE_MS;
}

function autoPostMaxDelay(settings) {
  return Math.max(autoPostMinDelay(settings), Math.max(1, Number(settings.feedPostIntervalMax) || 180) * MINUTE_MS);
}

function maybeAutoPost() {
  const settings = readSettings();
  if (!settings.feedEnabled || !settings.feedAutoPostEnabled) return;

  const state = readFeedAutoPostState();
  if (!state.enabled) return;

  const now = Date.now();
  if (!state.nextAt && !state.lastPostAt) {
    // 首次初始化：先排下一班，不在首次进入时立刻发帖
    writeFeedAutoPostState({ ...state, nextAt: now + randomAutoPostDelay(settings) });
    return;
  }
  if (state.nextAt && now < state.nextAt) return;

  const day = todayKey();
  const dayCount = state.day === day ? state.dayCount : 0;
  if (dayCount >= settings.feedDailyMax) {
    writeFeedAutoPostState({ ...state, nextAt: now + autoPostMaxDelay(settings) });
    return;
  }

  if (!randomChance(settings.feedPostChance)) {
    writeFeedAutoPostState({ ...state, nextAt: now + randomAutoPostDelay(settings) });
    return;
  }

  const cards = readCards().filter((card) => !card.disabled && card.content);
  const content = applyNicknamePlaceholders(String(pickRandom(cards)?.content || pickRandom(STAR_FALLBACK_POSTS) || '').trim());
  if (!content) {
    writeFeedAutoPostState({ ...state, nextAt: now + randomAutoPostDelay(settings) });
    return;
  }

  const post = {
    id: createId('feed'),
    author: 'star',
    content: content.slice(0, 2000),
    images: [],
    createdAt: Date.now(),
    likes: [],
    comments: [],
  };

  const saved = writeFeedPosts([post, ...readFeedPosts()]);
  if (!saved) return;

  writeFeedAutoPostState({
    enabled: true,
    lastPostAt: now,
    nextAt: now + randomAutoPostDelay(settings),
    day,
    dayCount: dayCount + 1,
  });

  addNotice('post', post.id, `${starDisplayName()} 发布了一条新动态`, 'star');
  if (document.body.dataset.view === 'feed') renderPosts();
}

function randomAutoPostDelay(settings = readSettings()) {
  const min = autoPostMinDelay(settings);
  const max = autoPostMaxDelay(settings);
  return min + Math.random() * (max - min);
}

function startAutoPostScheduler() {
  if (autoPostTimer) return;
  window.setTimeout(maybeAutoPost, 6000 + Math.random() * 12000);
  autoPostTimer = window.setInterval(maybeAutoPost, 60 * 1000);
}

function bindEvents() {
  if (!viewRoot || eventsBound) return;
  viewRoot.addEventListener('click', handleClick);
  viewRoot.addEventListener('input', handleInput);
  viewRoot.addEventListener('submit', handleSubmit);
  elements.imageInput?.addEventListener('change', handleImageChange);

  window.addEventListener(FEED_CHANGED_EVENT, () => {
    if (document.body.dataset.view === 'feed') renderPosts();
  });
  window.addEventListener(FEED_NOTICES_CHANGED_EVENT, () => renderUnreadBadge());
  const refreshNames = () => {
    if (document.body.dataset.view === 'feed') renderPosts();
  };
  window.addEventListener(CHARACTER_CHANGED_EVENT, refreshNames);
  window.addEventListener(SETTINGS_CHANGED_EVENT, refreshNames);
  eventsBound = true;
}

export function initFeedView(root = document.getElementById('view-feed')) {
  if (!root) return false;
  viewRoot = root;
  viewRoot.innerHTML = `
    <div class="feed-page">
      <header class="feed-hero">
        <p class="feed-eyebrow">FRIENDS</p>
        <h2 class="feed-title">朋友圈 <span class="feed-unread" id="feedUnreadBadge" hidden></span></h2>
        <p class="feed-intro">记录日常，也可以和星回互相点赞评论。</p>
      </header>

      <form class="feed-composer" id="feedComposer">
        <textarea id="feedComposerText" maxlength="2000" rows="3" placeholder="分享此刻的想法…"></textarea>
        <div class="feed-composer__actions">
          <label class="feed-image-button">
            <input id="feedImageInput" type="file" accept="image/*" multiple />
            <span>添加图片</span>
          </label>
          <button class="feed-publish" type="submit">发布</button>
        </div>
        <div class="feed-composer__preview" id="feedComposerPreview" hidden></div>
      </form>

      <section class="feed-list" id="feedList" aria-live="polite"></section>

      <div class="feed-sticker-panel" id="feedStickerPanel" hidden>
        <div class="feed-sticker-panel__head">
          <strong>选择表情包</strong>
          <button type="button" class="feed-sticker-panel__close" data-feed-action="close-sticker" aria-label="关闭">×</button>
        </div>
        <div class="feed-sticker-grid" id="feedStickerGrid"></div>
      </div>

      <div class="feed-toast" id="feedToast" role="status" aria-live="polite" hidden></div>
    </div>
  `;

  elements = {
    composer: viewRoot.querySelector('#feedComposer'),
    text: viewRoot.querySelector('#feedComposerText'),
    imageInput: viewRoot.querySelector('#feedImageInput'),
    preview: viewRoot.querySelector('#feedComposerPreview'),
    list: viewRoot.querySelector('#feedList'),
    unreadBadge: viewRoot.querySelector('#feedUnreadBadge'),
    stickerPanel: viewRoot.querySelector('#feedStickerPanel'),
    stickerGrid: viewRoot.querySelector('#feedStickerGrid'),
    toast: viewRoot.querySelector('#feedToast'),
  };

  bindEvents();
  startAutoPostScheduler();
  return true;
}

export function onFeedViewEnter() {
  render();
  markFeedRead();
}