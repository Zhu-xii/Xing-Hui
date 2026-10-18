import {
  CHARACTER_CHANGED_EVENT,
  CHAT_STORAGE_KEY,
  QUESTIONNAIRE_CATEGORY_NAME,
  SETTINGS_CHANGED_EVENT,
  STICKER_CATEGORY_NAME,
  hasManageCategory,
  clearQuestionnaireDraft,
  normalizeChatMessage,
  readCharacter,
  readChatMessages,
  readQuestionnaireAnswers,
  readQuestionnaireDraft,
  readSettings,
  readStickers,
  writeChatMessages,
  writeQuestionnaireDraft,
} from '../lib/storage.js';
import {
  buildQuestionnaireMessage,
  cancelQuestionnaire,
  notifyQuestionnaireQueued,
  startQuestionnaireEngine,
} from '../lib/questionnaire.js';
import { getCurrentChatMood, maybeChangeChatMood } from '../lib/mood.js';
import { compressImageFile, getAvatarBlob, getStickerBlob, putImageBlob, setBlobImage, detectOrphanStickers, putStickerBlob } from '../lib/media-db.js';
import { randomChance } from '../lib/random.js';
import { navigateTo } from '../lib/router.js';

const MESSAGE_ACTION_EVENT = 'xinghui:message-action';
const STAR_REPLY_TRIGGER_EVENT = 'xinghui:trigger-star-reply';
const CHAT_PLACEHOLDER_EVENT = 'xinghui:chat-placeholder';
const CALL_CHECK_EVENT = 'xinghui:maybe-incoming-call';
const CALL_RING_TIMEOUT_MS = 30_000;
const CALL_INCOMING_COOLDOWN_MS = 5 * 60_000;
const CALL_HANGUP_GRACE_MS = 3 * 60_000;
const CALL_LAST_INCOMING_KEY = 'xinghui_call_last_incoming_at';
const CHAT_RENDER_PAGE_SIZE = 80;

let viewRoot = null;
let elements = null;
let activeMessageId = null;
let typingRequestCount = 0;
let eventsBound = false;
let visualViewportFrame = null;
let stickerPanelToken = 0;
let chatToastTimer = null;
let chatRenderLimit = CHAT_RENDER_PAGE_SIZE;
const avatarDataUrlCache = new Map();
let activeCall = null;
let callPendingTimer = null;
let callTickTimer = null;
let callRingTimer = null;
let callHangupTimer = null;

function showChatToast(message) {
  const toast = elements?.toast;
  if (!toast || !message) return;
  window.clearTimeout(chatToastTimer);
  toast.textContent = message;
  toast.hidden = false;
  chatToastTimer = window.setTimeout(() => { toast.hidden = true; }, 2600);
}

function readLastIncomingCallAt() {
  try {
    return Number(localStorage.getItem(CALL_LAST_INCOMING_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeLastIncomingCallAt(timestamp) {
  try {
    localStorage.setItem(CALL_LAST_INCOMING_KEY, String(timestamp));
  } catch {
    // Ignore private-mode storage failures.
  }
}

function formatCallDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function clearCallTimers() {
  window.clearTimeout(callPendingTimer);
  window.clearTimeout(callRingTimer);
  window.clearInterval(callTickTimer);
  window.clearInterval(callHangupTimer);
  callPendingTimer = null;
  callRingTimer = null;
  callTickTimer = null;
  callHangupTimer = null;
}

function setCallButtons(mode) {
  if (!elements) return;
  if (elements.callAnswer) elements.callAnswer.hidden = mode !== 'ringing';
  if (elements.callReject) elements.callReject.hidden = mode !== 'ringing';
  if (elements.callHangup) elements.callHangup.hidden = !(mode === 'calling' || mode === 'connected');
}

function updateCallDurationDisplay() {
  if (!activeCall || !elements?.callDuration) return;
  if (activeCall.status === 'ringing') {
    const remaining = Math.max(0, Math.ceil((CALL_RING_TIMEOUT_MS - (Date.now() - activeCall.startedAt)) / 1000));
    elements.callDuration.textContent = `${remaining} 秒后自动挂断`;
    return;
  }
  if (activeCall.connectedAt) {
    elements.callDuration.textContent = formatCallDuration(Date.now() - activeCall.connectedAt);
    return;
  }
  elements.callDuration.textContent = '00:00';
}

function showCallPanel(statusText, mode) {
  if (!elements?.callPanel) return;
  const context = createChatRenderContext();
  if (elements.callName) elements.callName.textContent = context.starName;
  if (elements.callAvatar) fillStarAvatar(elements.callAvatar, context);
  if (elements.callStatus) elements.callStatus.textContent = statusText;
  elements.callPanel.hidden = false;
  setCallButtons(mode);
  updateCallDurationDisplay();
}

function addCallSystemMessage(content) {
  addChatMessage(
    {
      id: createMessageId(),
      role: 'system',
      type: 'text',
      content,
      timestamp: Date.now(),
      sequence: nextSequence(),
      read: true,
      favorited: false,
      starFavorited: false,
    },
    { persist: true, scroll: true },
  );
}

function finishCall(resultText) {
  if (!activeCall) return;
  const connectedAt = activeCall.connectedAt;
  const duration = connectedAt ? Date.now() - connectedAt : 0;
  clearCallTimers();
  if (elements?.callPanel) elements.callPanel.hidden = true;
  activeCall = null;

  const content = connectedAt
    ? `语音通话 · ${resultText} · ${formatCallDuration(duration)}`
    : `语音通话 · ${resultText}`;
  addCallSystemMessage(content);
  showChatToast(content);
}

function startCallTick() {
  window.clearInterval(callTickTimer);
  updateCallDurationDisplay();
  callTickTimer = window.setInterval(updateCallDurationDisplay, 1000);
}

function startCounterpartHangupMonitor() {
  window.clearInterval(callHangupTimer);
  const callRef = activeCall;
  if (!callRef) return;
  callHangupTimer = window.setInterval(() => {
    if (!activeCall || activeCall !== callRef || activeCall.status !== 'connected' || !activeCall.connectedAt) return;
    if (Date.now() - activeCall.connectedAt < CALL_HANGUP_GRACE_MS) return;
    const settings = readSettings();
    if (settings.callNoHangup) return;
    if (Math.random() * 100 < settings.callHangupProbability) finishCall('对方已挂断');
  }, 60_000);
}

function connectCall() {
  if (!activeCall) return;
  window.clearTimeout(callRingTimer);
  callRingTimer = null;
  activeCall.status = 'connected';
  activeCall.connectedAt = Date.now();
  if (elements?.callStatus) elements.callStatus.textContent = '通话中…';
  setCallButtons('connected');
  startCallTick();
  startCounterpartHangupMonitor();
  showChatToast('通话已接通');
}

function startOutboundCall() {
  if (activeCall) {
    showChatToast('已有通话中');
    return;
  }
  const settings = readSettings();
  activeCall = { direction: 'out', status: 'calling', startedAt: Date.now(), connectedAt: 0 };
  const callRef = activeCall;
  showCallPanel('正在呼叫…', 'calling');

  const roll = Math.random() * 100;
  const busy = Number(settings.callBusyProbability) || 0;
  const reject = Number(settings.callRejectProbability) || 0;
  const pickup = Number(settings.callPickupProbability) || 0;

  callPendingTimer = window.setTimeout(() => {
    if (activeCall !== callRef || callRef.status !== 'calling') return;
    if (roll < busy) finishCall('对方忙线中');
    else if (roll < busy + reject) finishCall('对方已拒绝');
    else if (roll < busy + reject + pickup) connectCall();
    else finishCall('对方未接通');
  }, 1800 + Math.random() * 1500);
}

function maybeTriggerIncomingCall() {
  if (activeCall || document.body.dataset.view !== 'chat') return;
  const now = Date.now();
  if (now - readLastIncomingCallAt() < CALL_INCOMING_COOLDOWN_MS) return;
  const settings = readSettings();
  if (Math.random() * 100 >= settings.callIncomingProbability) return;

  writeLastIncomingCallAt(now);
  activeCall = { direction: 'in', status: 'ringing', startedAt: now, connectedAt: 0 };
  showCallPanel('来电中…', 'ringing');
  startCallTick();
  callRingTimer = window.setTimeout(() => {
    if (activeCall && activeCall.status === 'ringing') finishCall('未接听');
  }, CALL_RING_TIMEOUT_MS);
}

function answerIncomingCall() {
  if (activeCall?.status === 'ringing') connectCall();
}

function rejectIncomingCall() {
  if (activeCall?.status === 'ringing') finishCall('已拒绝来电');
}

function hangupCurrentCall() {
  if (!activeCall) return;
  if (activeCall.status === 'connected') finishCall('已挂断');
  else finishCall('已取消呼叫');
}

// 「梦角收藏」：星回按概率收藏我发出的聊天消息 / 卡片。
function maybeStarFavorite(messageId, chance) {
  if (!messageId || !randomChance(chance)) return false;
  const messages = readStoredMessages();
  const target = messages.find((message) => message.id === messageId);
  if (!target || target.starFavorited) return false;
  target.starFavorited = true;
  if (!writeStoredMessages(messages)) return false;
  showChatToast(`${readCharacter().name || '星回'}收藏了一条信息`);
  return true;
}

// 发送本地图片：压缩后存 IndexedDB，再作为一条图片消息发出。
async function sendChatImages(files) {
  const list = (Array.isArray(files) ? files : Array.from(files || [])).filter((file) => String(file.type || '').startsWith('image/'));
  if (!list.length) return;
  const settings = readSettings();
  for (const file of list) {
    let blob = file;
    try {
      blob = (await compressImageFile(file)) || file;
    } catch {
      blob = file;
    }
    const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      await putImageBlob(id, blob, { enabled: true, createdAt: Date.now() });
    } catch {
      showChatToast('图片保存失败，请检查浏览器存储空间');
      continue;
    }
    const saved = addChatMessage(
      {
        id: createMessageId(),
        role: 'user',
        type: 'image',
        content: `idb:${id}`,
        timestamp: Date.now(),
        read: false,
        favorited: false,
        starFavorited: false,
      },
      { persist: true, scroll: true },
    );
    if (saved) maybeStarFavorite(saved.id, settings.starFavorite);
  }
}
let messageSequenceCounter = 0;

function createMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createTurnId() {
  return `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nextSequence() {
  messageSequenceCounter += 1;
  return messageSequenceCounter;
}

function sortMessages(messages) {
  return messages.slice().sort((a, b) => {
    const aHas = Boolean(a.turnId);
    const bHas = Boolean(b.turnId);
    if (aHas && bHas && a.turnId !== b.turnId) {
      return a.timestamp - b.timestamp;
    }
    if (aHas && !bHas) return 1;
    if (!aHas && bHas) return -1;
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    return a.timestamp - b.timestamp;
  });
}

function formatMessageTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--:--';

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function markChatMessageRead(messageId) {
  if (!messageId) return false;

  const messages = readStoredMessages();
  let changed = false;

  messages.forEach((message) => {
    if (message.id !== messageId || message.read) return;
    message.read = true;
    changed = true;
  });

  if (!changed) return true;
  return writeStoredMessages(messages);
}

function readStoredMessages() {
  return readChatMessages();
}

function writeStoredMessages(messages) {
  return Boolean(writeChatMessages(messages));
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : ''), { once: true });
    reader.addEventListener('error', () => resolve(''), { once: true });
    reader.readAsDataURL(blob);
  });
}

function cachedAvatarDataUrl(role, source) {
  const key = `${role}:${source}`;
  if (!avatarDataUrlCache.has(key)) {
    avatarDataUrlCache.set(
      key,
      getAvatarBlob(role)
        .then((blob) => (blob ? blobToDataUrl(blob) : ''))
        .catch(() => ''),
    );
  }
  return avatarDataUrlCache.get(key);
}

function invalidateAvatarCache() {
  avatarDataUrlCache.clear();
}

async function fillAvatar(container, source, fallback, role = '') {
  if (!container) return;
  container.replaceChildren();
  if (!source) {
    container.textContent = fallback;
    return;
  }

  const image = document.createElement('img');
  image.alt = '';
  container.append(image);

  if (source === 'idb:star' || source === 'idb:user') {
    const resolvedRole = role || (source === 'idb:star' ? 'star' : 'user');
    const src = await cachedAvatarDataUrl(resolvedRole, source);
    if (!image.isConnected) return;
    if (src) {
      image.src = src;
    } else {
      image.remove();
      container.textContent = fallback;
    }
    return;
  }

  image.src = source;
}

function nicknameInitial(name, fallback) {
  const text = String(name || '').trim();
  return text ? text.slice(0, 1) : fallback;
}

function createChatRenderContext() {
  const character = readCharacter();
  const settings = readSettings();
  const starName = String(character.name || '星回').trim().slice(0, 20) || '星回';
  const userName = String(settings.userName || '我').trim().slice(0, 20) || '我';
  return {
    starName,
    userName,
    showTimestamp: settings.showTimestamp !== false,
    starAvatar: character.avatar || '',
    userAvatar: settings.userAvatar || '',
  };
}

function fillStarAvatar(container, context = createChatRenderContext()) {
  return fillAvatar(container, context.starAvatar, nicknameInitial(context.starName, '星'), 'star');
}

function fillUserAvatar(container, context = createChatRenderContext()) {
  return fillAvatar(container, context.userAvatar, nicknameInitial(context.userName, '我'), 'user');
}

function updateChatProfileAvatar() {
  const context = createChatRenderContext();
  if (elements?.profileAvatar) {
    fillStarAvatar(elements.profileAvatar, context);
    elements.profileAvatar.setAttribute('aria-label', context.starName + '的头像，长按拍一拍');
    elements.profileAvatar.setAttribute('title', context.starName + '的头像');
  }
  if (elements?.title) elements.title.textContent = context.starName;
  if (elements?.messageList) elements.messageList.setAttribute('aria-label', '与' + context.starName + '的聊天记录');
}

function updateChatMood({ force = false } = {}) {
  if (!elements?.mood) return;
  const mood = getCurrentChatMood({ force });
  elements.mood.textContent = `心情 · ${mood.text}`;
  elements.mood.classList.toggle('is-warning', Boolean(mood.missing || mood.empty));
}

function createMessageAvatar(role, context = createChatRenderContext()) {
  const avatar = document.createElement('span');
  avatar.className = `chat-message__avatar chat-message__avatar--${role}`;
  avatar.setAttribute('aria-hidden', 'true');

  if (role === 'star') fillStarAvatar(avatar, context);
  else fillUserAvatar(avatar, context);

  return avatar;
}

let questionnaireThinkingCount = 0;

function createQuestionnaireBubble(message) {
  const questionnaire = message.questionnaire || {};
  const isAwaitingAnswer = message.role === 'star'
    && questionnaire.direction === 'star-asked'
    && questionnaire.status === 'awaiting-answer';
  const bubble = document.createElement('div');
  bubble.className = `bubble message-bubble message-bubble--questionnaire bubble--${message.role}`;

  const question = document.createElement('p');
  question.className = 'questionnaire-bubble__question';
  question.textContent = questionnaire.question || '（未填写问题）';
  bubble.append(question);

  if (isAwaitingAnswer && questionnaire.type === 'qa') {
    const form = document.createElement('form');
    form.className = 'questionnaire-answer-form';
    form.dataset.questionnaireAnswerForm = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'answer';
    input.maxLength = 500;
    input.placeholder = '写下你的回答…';
    input.setAttribute('aria-label', '问卷回答');
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = '发送';
    form.append(input, submit);
    bubble.append(form);
  } else if (isAwaitingAnswer) {
    const options = document.createElement('div');
    options.className = 'questionnaire-answer-options';
    questionnaire.options.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'questionnaire-answer-option';
      button.dataset.questionOption = option;
      button.textContent = option;
      options.append(button);
    });
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'questionnaire-answer-submit';
    submit.dataset.questionnaireSubmit = '';
    submit.textContent = '确认';
    bubble.append(options, submit);
  } else if (questionnaire.options?.length) {
    const list = document.createElement('ul');
    list.className = 'questionnaire-bubble__options';
    questionnaire.options.forEach((option) => {
      const item = document.createElement('li');
      const checked = questionnaire.selected?.includes(option);
      item.className = `questionnaire-bubble__option${checked ? ' is-selected' : ''}`;
      item.textContent = `${checked ? '√ ' : ''}${option}`;
      list.append(item);
    });
    bubble.append(list);
  }

  if (questionnaire.answer && !isAwaitingAnswer) {
    const answer = document.createElement('p');
    answer.className = 'questionnaire-bubble__answer';
    answer.textContent = questionnaire.answer;
    bubble.append(answer);
  }

  const state = document.createElement('span');
  state.className = 'questionnaire-bubble__state';
  if (isAwaitingAnswer) state.textContent = '等待你的回答';
  else if (questionnaire.status === 'thinking') state.textContent = '对方正在思考中';
  else if (questionnaire.status === 'delayed') state.textContent = '已延后作答';
  else if (questionnaire.status === 'answered') state.textContent = '已作答';
  else if (questionnaire.status === 'cancelled' || questionnaire.status === 'withdrawn') state.textContent = '已取消';
  else state.textContent = '等待作答';
  bubble.append(state);

  return bubble;
}
function createMessageBubble(message, context = createChatRenderContext()) {
  const bubble = document.createElement('div');
  bubble.className = `bubble message-bubble bubble--${message.role}`;

  if (message.withdrawn) {
    bubble.classList.add('message-bubble--withdrawn');
    bubble.textContent = message.role === 'user' ? '你撤回了一条消息' : context.starName + '撤回了一条消息';
    return bubble;
  }

  if (message.type === 'questionnaire') {
    return createQuestionnaireBubble(message);
  }

  if (message.type === 'image') {
    bubble.classList.add('message-bubble--image');
    const ref = String(message.content || '');
    const image = document.createElement('img');
    image.className = 'message-image__image';
    image.alt = '图片';
    bubble.append(image);
    if (/^idb:/i.test(ref)) {
      void getStickerBlob(ref.slice(4))
        .then((blob) => { if (blob) setBlobImage(image, blob); else image.alt = '图片不可用'; })
        .catch(() => { image.alt = '图片读取失败'; });
    } else if (/^data:image\//i.test(ref)) {
      image.src = ref;
    } else {
      image.remove();
      bubble.textContent = '图片';
    }
    return bubble;
  }

  if (message.type === 'sticker') {
    bubble.classList.add('message-bubble--sticker');

    if (/^idb:/i.test(message.content)) {
      const stickerId = message.content.slice(4);
      const image = document.createElement('img');
      image.className = 'message-sticker__image';
      image.alt = '表情包';
      bubble.append(image);
      void getStickerBlob(stickerId)
        .then((blob) => {
          if (blob) {
            setBlobImage(image, blob);
            image.addEventListener('load', () => scrollToLatestIfAtBottom(), { once: true });
          } else {
            image.alt = '表情包不可用';
          }
        })
        .catch(() => { image.alt = '表情包读取失败'; });
    } else if (/^data:image\//i.test(message.content)) {
      const image = document.createElement('img');
      image.className = 'message-sticker__image';
      image.src = message.content;
      image.alt = '表情包';
      image.addEventListener('load', () => scrollToLatestIfAtBottom(), { once: true });
      bubble.append(image);
    } else {
      const icon = document.createElement('span');
      icon.className = 'message-sticker__icon';
      icon.textContent = '☺';

      const label = document.createElement('span');
      label.className = 'message-sticker__label';
      label.textContent = '表情包占位';

      const note = document.createElement('small');
      note.textContent = 'STICKER';

      bubble.append(icon, label, note);
    }
  } else {
    bubble.classList.add('message-bubble--text');
    if (message.tag) {
      bubble.classList.add('message-bubble--tagged');
      const text = document.createElement('span');
      text.className = 'message-bubble__text';
      text.textContent = message.content || ' ';
      const tag = document.createElement('span');
      tag.className = 'message-bubble__tag';
      tag.textContent = message.tag === '拼接字卡' ? '字卡拼接' : message.tag;
      bubble.append(text, tag);
    } else {
      bubble.textContent = message.content || ' ';
    }
  }

  return bubble;
}

// 自己发的消息可撤回；带来源标签的字卡消息（梦角拼字 / 多字卡回复）同样允许撤回。
function canWithdrawMessage(message) {
  if (!message || message.withdrawn) return false;
  return message.role === 'user' || Boolean(message.tag);
}

function createMessageElement(message, context = createChatRenderContext()) {
  const isSystem = message.role === 'system';
  const article = document.createElement('article');
  article.className = `chat-message chat-message--${message.role}${message.withdrawn ? ' is-withdrawn' : ''}`;
  article.dataset.messageId = message.id;
  article.tabIndex = isSystem ? -1 : 0;
  article.setAttribute('role', isSystem ? 'status' : 'button');
  article.setAttribute('aria-expanded', 'false');
  article.setAttribute(
    'aria-label',
    isSystem
      ? message.content || '拍一拍消息'
      : `${message.role === 'user' ? context.userName : context.starName}的消息，点击查看操作`,
  );

  const actions = document.createElement('div');
  actions.className = 'chat-message__actions';
  actions.setAttribute('aria-label', '消息操作');

  const availableActions = message.withdrawn
    ? [['delete', '删除']]
    : [
        ['delete', '删除'],
        ['withdraw', '撤回'],
        ['favorite', message.favorited ? '取消收藏' : '收藏'],
      ];

  availableActions.forEach(([action, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-message__action';
    button.dataset.messageAction = action;
    button.textContent = label;

    if (action === 'withdraw' && !canWithdrawMessage(message)) {
      button.disabled = true;
      button.title = context.starName + '的消息不可撤回';
      button.setAttribute('aria-disabled', 'true');
    }

    if (action === 'favorite' && message.favorited) {
      button.textContent = '取消收藏';
      button.title = '取消这条收藏';
    }

    actions.append(button);
  });

  const content = document.createElement('div');
  content.className = 'chat-message__content';
  content.append(createMessageBubble(message, context));

  const meta = document.createElement('div');
  meta.className = 'chat-message__meta';

  if (context.showTimestamp) {
    const time = document.createElement('time');
    time.dateTime = new Date(message.timestamp).toISOString();
    time.textContent = formatMessageTime(message.timestamp);
    time.dataset.messageTime = '';
    meta.append(time);
  }

  if (message.role === 'user' && !message.withdrawn) {
    const read = document.createElement('span');
    read.className = 'chat-message__read';
    read.textContent = '已读';
    meta.append(read);
  }

  if (meta.childElementCount > 0) content.append(meta);
  if (isSystem) article.append(content);
  else article.append(actions, createMessageAvatar(message.role, context), content);
  return article;
}

function createEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'chat-empty';

  const icon = document.createElement('span');
  icon.className = 'chat-empty__icon';
  icon.textContent = '✦';

  const title = document.createElement('p');
  title.textContent = '还没有消息';

  const hint = document.createElement('small');
  hint.textContent = '从一句“你好”开始吧';

  empty.append(icon, title, hint);
  return empty;
}

function isAtBottom() {
  const list = elements?.messageList;
  if (!list) return true;
  return list.scrollHeight - list.scrollTop - list.clientHeight < 80;
}

function scrollToLatest({ behavior = 'auto' } = {}) {
  const list = elements?.messageList;
  if (!list) return;

  window.requestAnimationFrame(() => {
    if (behavior === 'smooth') {
      list.scrollTo({ top: list.scrollHeight, behavior });
      return;
    }

    list.scrollTop = list.scrollHeight;
  });
}

function scrollToLatestIfAtBottom() {
  if (isAtBottom()) scrollToLatest();
}

function syncVisualViewport() {
  if (visualViewportFrame !== null) {
    window.cancelAnimationFrame(visualViewportFrame);
  }

  visualViewportFrame = window.requestAnimationFrame(() => {
    visualViewportFrame = null;
    const viewport = window.visualViewport;
    const keyboardInset = viewport
      ? Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))
      : 0;
    const appHeight = Math.max(1, Math.round(viewport?.height || window.innerHeight));

    document.documentElement.style.setProperty('--app-height', `${appHeight}px`);
    document.documentElement.style.setProperty('--keyboard-inset', `${keyboardInset}px`);

    if (keyboardInset > 0 || document.activeElement === elements?.input) {
      scrollToLatest();
    }
  });
}

function scheduleLatestScroll() {
  [0, 120, 320].forEach((delay) => {
    window.setTimeout(() => scrollToLatest(), delay);
  });
}

function setActiveMessage(messageId) {
  const list = elements?.messageList;
  if (!list) return;

  activeMessageId = activeMessageId === messageId ? null : messageId;

  list.querySelectorAll('.chat-message').forEach((messageElement) => {
    const isActive = messageElement.dataset.messageId === activeMessageId;
    messageElement.classList.toggle('is-actions-open', isActive);
    messageElement.setAttribute('aria-expanded', String(isActive));
  });
}

function closeActiveMessage() {
  if (!activeMessageId) return;
  activeMessageId = null;

  elements?.messageList.querySelectorAll('.chat-message.is-actions-open').forEach((messageElement) => {
    messageElement.classList.remove('is-actions-open');
    messageElement.setAttribute('aria-expanded', 'false');
  });
}

function questionnaireDraftFromForm() {
  return {
    question: elements.questionnaireQuestion.value.trim(),
    options: elements.questionnaireOptions.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    type: elements.questionnaireType.value,
    thinkMin: Number(elements.questionnaireThinkMin.value) || 5,
    thinkMax: Number(elements.questionnaireThinkMax.value) || 15,
    multiMin: Number(elements.questionnaireMultiMin.value) || 1,
    multiMax: Number(elements.questionnaireMultiMax.value) || 3,
  };
}

function hydrateQuestionnairePanel(draft) {
  if (!elements.questionnaireQuestion) return;
  const data = draft && typeof draft === 'object' ? draft : {};
  elements.questionnaireQuestion.value = data.question || '';
  elements.questionnaireOptions.value = Array.isArray(data.options) ? data.options.join('\n') : '';
  elements.questionnaireType.value = ['qa', 'single', 'multiple'].includes(data.type) ? data.type : 'qa';
  elements.questionnaireThinkMin.value = String(data.thinkMin ?? 5);
  elements.questionnaireThinkMax.value = String(data.thinkMax ?? 15);
  elements.questionnaireMultiMin.value = String(data.multiMin ?? 1);
  elements.questionnaireMultiMax.value = String(data.multiMax ?? 3);
  updateQuestionnairePanelControls();
}

function updateQuestionnairePanelControls() {
  if (!elements.questionnaireType) return;
  const type = elements.questionnaireType.value;
  const hasOptions = type !== 'qa';
  elements.questionnaireOptionsField.hidden = !hasOptions;
  elements.questionnaireMultiField.hidden = type !== 'multiple';
}

function openQuestionnairePanel() {
  if (!elements.questionnairePanel) return;
  closeToolPanel();
  hydrateQuestionnairePanel(readQuestionnaireDraft());
  elements.questionnairePanel.hidden = false;
  elements.questionnairePanel.dataset.open = 'true';
  elements.toolButtons?.forEach((button) => {
    button.setAttribute('aria-expanded', String(button.dataset.chatPlaceholder === 'survey'));
  });
  syncVisualViewport();
  scheduleLatestScroll();
}

function closeQuestionnairePanel() {
  if (!elements.questionnairePanel) return;
  elements.questionnairePanel.hidden = true;
  elements.questionnairePanel.dataset.open = '';
  elements.toolButtons?.forEach((button) => {
    if (button.dataset.chatPlaceholder === 'survey') button.setAttribute('aria-expanded', 'false');
  });
}

function handleQuestionnaireSubmit(event) {
  event.preventDefault();
  const draft = questionnaireDraftFromForm();
  if (!draft.question) {
    setQuestionnaireError('请先输入问题。');
    return;
  }
  if (draft.type !== 'qa' && draft.options.length < 2) {
    setQuestionnaireError('单选题或多选题至少需要两个选项。');
    return;
  }

  writeQuestionnaireDraft(draft);
  const turnId = createTurnId();
  const questionnaire = buildQuestionnaireMessage(draft);
  const message = {
    id: createMessageId(),
    role: 'user',
    type: 'questionnaire',
    content: questionnaire.question,
    timestamp: Date.now(),
    turnId,
    sequence: nextSequence(),
    read: false,
    favorited: false,
    starFavorited: false,
    questionnaire,
  };

  const saved = addChatMessage(message, { persist: true, scroll: true });
  if (!saved) {
    setQuestionnaireError('问卷发送失败，请重试。');
    return;
  }

  maybeStarFavorite(saved.id, readSettings().starFavoriteCard);

  closeQuestionnairePanel();
  scheduleLatestScroll();
  notifyQuestionnaireQueued();
}

function setQuestionnaireError(message) {
  if (!elements.questionnaireError) return;
  elements.questionnaireError.textContent = message;
  elements.questionnaireError.hidden = !message;
}
function closeToolMenu() {
  if (elements?.toolMenu) elements.toolMenu.hidden = true;
  elements?.toolToggle?.setAttribute('aria-expanded', 'false');
}

function closeToolPanel() {
  if (elements?.toolPanel) {
    elements.toolPanel.hidden = true;
    elements.toolPanel.dataset.kind = '';
  }
  closeQuestionnairePanel();
  elements.toolButtons?.forEach((button) => {
    if (button.dataset.chatPlaceholder === 'sticker') button.setAttribute('aria-expanded', 'false');
  });
  closeToolMenu();
}

function openToolMenu() {
  const menu = elements?.toolMenu;
  if (!menu) return;

  if (elements?.toolPanel) {
    elements.toolPanel.hidden = true;
    elements.toolPanel.dataset.kind = '';
  }
  closeQuestionnairePanel();
  elements.toolButtons?.forEach((button) => button.setAttribute('aria-expanded', 'false'));
  menu.hidden = false;
  elements.toolToggle?.setAttribute('aria-expanded', 'true');
}

function toggleToolMenu() {
  if (elements?.toolMenu?.hidden) openToolMenu();
  else closeToolMenu();
}

function stickerMessageContent(sticker) {
  if (!sticker) return '';
  if (sticker.storage === 'indexeddb') return sticker.id ? `idb:${sticker.id}` : '';
  return typeof sticker.image === 'string' ? sticker.image.trim() : '';
}

function createStickerPanelImage(sticker, token) {
  const image = document.createElement('img');
  image.alt = '表情包';
  image.loading = 'lazy';
  image.decoding = 'async';

  if (sticker.storage === 'indexeddb') {
    void getStickerBlob(sticker.id)
      .then((blob) => {
        if (token !== stickerPanelToken || !image.isConnected) return;
        if (!blob) throw new Error('sticker-missing');
        setBlobImage(image, blob);
      })
      .catch(() => {
        if (token !== stickerPanelToken || !image.isConnected) return;
        const parent = image.parentElement;
        const button = image.closest('.chat-sticker-item');
        if (button) {
          button.disabled = true;
          button.title = '表情包不可用';
          button.dataset.missing = 'true';
        }
        image.remove();
        const fallback = document.createElement('span');
        fallback.className = 'chat-sticker-item__missing';
        fallback.textContent = '不可用';
        parent?.append(fallback);
      });
  } else if (sticker.image) {
    image.src = sticker.image;
  }

  image.addEventListener('error', () => {
    if (image.dataset.failed === 'true') return;
    image.dataset.failed = 'true';
    const button = image.closest('.chat-sticker-item');
    if (!button || button.dataset.missing === 'true') return;
    button.dataset.missing = 'true';
    button.disabled = true;
    button.title = '表情包不可用';
    image.remove();
    const fallback = document.createElement('span');
    fallback.className = 'chat-sticker-item__missing';
    fallback.textContent = '不可用';
    button.append(fallback);
  });

  return image;
}

function sendStickerMessage(sticker) {
  const content = stickerMessageContent(sticker);
  if (!content) return false;

  const message = {
    id: createMessageId(),
    role: 'user',
    type: 'sticker',
    content,
    timestamp: Date.now(),
    read: false,
    favorited: false,
    starFavorited: false,
  };

  const savedMessage = addChatMessage(message, { persist: true, scroll: true });
  if (!savedMessage) return false;

  closeToolPanel();
  maybeChangeChatMood(0.35);
  updateChatMood();
  scheduleLatestScroll();
  window.dispatchEvent(
    new CustomEvent(STAR_REPLY_TRIGGER_EVENT, {
      detail: { message: savedMessage, storageKey: CHAT_STORAGE_KEY },
    }),
  );
  return true;
}

async function renderStickerPanel() {
  const panel = elements?.toolPanel;
  if (!panel) return;

  const stickers = readStickers().filter((sticker) => sticker.enabled !== false);
  const token = ++stickerPanelToken;
  panel.replaceChildren();

  if (!stickers.length) {
    const empty = document.createElement('p');
    empty.className = 'chat-sticker-empty';
    empty.textContent = hasManageCategory(STICKER_CATEGORY_NAME)
      ? '还没有可用的表情包，请先到管理里导入。'
      : '请先重建“表情包”类别，再导入表情包。';
    panel.append(empty);
    return;
  }

  const header = document.createElement('div');
  header.className = 'chat-sticker-panel__head';

  const title = document.createElement('strong');
  title.textContent = '表情包';

  const count = document.createElement('small');
  count.textContent = `${stickers.length} 张`;

  header.append(title, count);

  const grid = document.createElement('div');
  grid.className = 'chat-sticker-grid';
  grid.setAttribute('role', 'list');
  grid.setAttribute('aria-label', '选择表情包发送');

  stickers.forEach((sticker) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-sticker-item';
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-label', '发送这张表情包');
    button.append(createStickerPanelImage(sticker, token));
    button.addEventListener('click', () => {
      if (button.disabled) return;
      sendStickerMessage(sticker);
    });
    grid.append(button);
  });

  panel.append(header, grid);
}

function toggleToolPanel(kind) {
  const panel = elements?.toolPanel;
  if (!panel) return;

  closeToolMenu();
  const shouldOpen = panel.hidden || panel.dataset.kind !== kind;
  panel.dataset.kind = shouldOpen ? kind : '';
  panel.hidden = !shouldOpen;
  if (kind === 'survey') {
    openQuestionnairePanel();
    return;
  } else if (kind === 'sticker') {
    void renderStickerGrid();
  } else {
    panel.textContent = '';
  }
  elements.toolButtons?.forEach((button) => {
    button.setAttribute('aria-expanded', String(shouldOpen && button.dataset.chatPlaceholder === kind));
  });
}

function appendMessage(message) {
  const list = elements?.messageList;
  if (!list) return;

  list.querySelector('.chat-empty')?.remove();
  list.append(createMessageElement(message, createChatRenderContext()));
}

function findChatMessageElement(messageId) {
  const list = elements?.messageList;
  if (!list || !messageId) return null;
  return Array.from(list.querySelectorAll('[data-message-id]'))
    .find((element) => element.dataset.messageId === messageId) || null;
}

function replaceChatMessageElement(message) {
  const element = findChatMessageElement(message?.id);
  if (!element) return false;
  if (activeMessageId === message.id) activeMessageId = null;
  element.replaceWith(createMessageElement(message, createChatRenderContext()));
  return true;
}

function loadOlderChatMessages() {
  const list = elements?.messageList;
  if (!list) return;
  const previousHeight = list.scrollHeight;
  const previousTop = list.scrollTop;
  chatRenderLimit += CHAT_RENDER_PAGE_SIZE;
  renderChatMessages({ scroll: false });
  window.requestAnimationFrame(() => {
    list.scrollTop = Math.max(0, list.scrollHeight - previousHeight + previousTop);
  });
}

function renderStickerGrid() {
  const panel = elements?.toolPanel;
  if (!panel) return;
  panel.replaceChildren();

  if (!hasManageCategory(STICKER_CATEGORY_NAME)) {
    const hint = document.createElement('p');
    hint.className = 'sticker-grid__empty';
    hint.textContent = '请先在管理页面创建表情包类别';
    panel.append(hint);
    return;
  }

  const stickers = readStickers().filter((sticker) => sticker.enabled !== false);
  if (!stickers.length) {
    const hint = document.createElement('p');
    hint.className = 'sticker-grid__empty';
    hint.textContent = '还没有表情包，去管理页面添加吧';
    panel.append(hint);
    return;
  }

  const idbStickers = stickers.filter((s) => s.storage === 'indexeddb');
  void detectOrphanStickers(idbStickers).then((orphanIds) => {
    if (orphanIds.length > 0 && panel.dataset.kind === 'sticker') {
      const existing = panel.querySelector('.sticker-grid__repair');
      if (existing) existing.remove();
      const repair = document.createElement('div');
      repair.className = 'sticker-grid__repair';
      repair.innerHTML = `<p>${orphanIds.length} 张表情包图片丢失，需要重新导入。</p>`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sticker-grid__repair-btn';
      button.dataset.stickerRepair = '';
      button.textContent = '重新导入表情包';
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'sticker-grid__repair-dismiss';
      dismiss.dataset.stickerRepairDismiss = '';
      dismiss.textContent = '忽略';
      repair.append(button, dismiss);
      panel.prepend(repair);
    }
  });

  const grid = document.createElement('div');
  grid.className = 'sticker-grid';

  stickers.forEach((sticker) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'sticker-grid__item';
    item.dataset.stickerId = sticker.id;
    item.dataset.stickerStorage = sticker.storage;
    item.setAttribute('aria-label', '发送表情包');

    const img = document.createElement('img');
    img.className = 'sticker-grid__image';
    img.alt = '表情包';
    item.append(img);

    if (sticker.storage === 'indexeddb') {
      void getStickerBlob(sticker.id)
        .then((blob) => {
          if (blob) {
            setBlobImage(img, blob);
          } else {
            item.classList.add('is-unavailable');
            item.disabled = true;
            img.alt = '不可用';
          }
        })
        .catch(() => {
          item.classList.add('is-unavailable');
          item.disabled = true;
          img.alt = '不可用';
        });
    } else if (sticker.image) {
      img.src = sticker.image;
    } else {
      item.classList.add('is-unavailable');
      item.disabled = true;
      img.alt = '不可用';
    }

    grid.append(item);
  });

  panel.append(grid);
}

async function handleStickerRepair() {
  const panel = elements?.toolPanel;
  if (!panel) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.style.display = 'none';
  document.body.append(input);

  input.click();

  const files = await new Promise((resolve) => {
    input.addEventListener('change', () => {
      const result = Array.from(input.files || []);
      input.remove();
      resolve(result);
    });
  });

  if (!files.length) return;

  const stickers = readStickers();
  const idbStickers = stickers.filter((s) => s.storage === 'indexeddb');
  const orphanIds = await detectOrphanStickers(idbStickers);
  if (!orphanIds.length) return;

  let repaired = 0;
  const maxRepairs = Math.min(files.length, orphanIds.length);
  for (let i = 0; i < maxRepairs; i += 1) {
    const stickerId = orphanIds[i];
    const file = files[i];
    try {
      const sticker = stickers.find((s) => s.id === stickerId);
      await putStickerBlob(stickerId, file, {
        enabled: true,
        createdAt: sticker?.createdAt || Date.now(),
      });
      repaired += 1;
    } catch {
      // skip failed repair
    }
  }

  if (repaired > 0) renderStickerGrid();
}

function sendSticker(sticker) {
  const content = sticker.storage === 'indexeddb' ? `idb:${sticker.id}` : sticker.image;
  if (!content) return null;

  const turnId = createTurnId();
  const message = {
    id: createMessageId(),
    role: 'user',
    type: 'sticker',
    content,
    timestamp: Date.now(),
    turnId,
    sequence: nextSequence(),
    read: false,
    favorited: false,
    starFavorited: false,
  };

  const saved = addChatMessage(message, { persist: true, scroll: true });
  if (!saved) return null;

  closeToolPanel();
  maybeChangeChatMood(0.35);
  updateChatMood();
  scheduleLatestScroll();

  window.dispatchEvent(
    new CustomEvent(STAR_REPLY_TRIGGER_EVENT, {
      detail: { message: saved, storageKey: CHAT_STORAGE_KEY },
    }),
  );
  return saved;
}

function handleStickerGridClick(event) {
  const item = event.target.closest('[data-sticker-id]');
  if (!item || item.disabled) return;

  const stickerId = item.dataset.stickerId;
  const storage = item.dataset.stickerStorage;
  const stickers = readStickers();
  const sticker = stickers.find((s) => s.id === stickerId && s.enabled !== false);
  if (!sticker) return;

  if (storage === 'indexeddb') {
    sticker.storage = 'indexeddb';
  } else {
    sticker.storage = 'legacy';
  }

  sendSticker(sticker);
}

export function getChatMessages() {
  return readStoredMessages();
}

export function addChatMessage(message, { persist = true, scroll = true } = {}) {
  const normalized = normalizeChatMessage(message);
  if (!normalized) return null;

  if (!normalized.sequence) {
    normalized.sequence = nextSequence();
  } else {
    messageSequenceCounter = Math.max(messageSequenceCounter, normalized.sequence);
  }

  const messages = readStoredMessages();
  messages.push(normalized);
  const sorted = sortMessages(messages);

  if (persist && !writeStoredMessages(sorted)) return null;

  appendMessage(normalized);
  if (scroll) scrollToLatest({ behavior: 'smooth' });
  if (normalized.role === 'star') {
    maybeChangeChatMood(0.25);
    updateChatMood();
    if (normalized.starFavorited) {
      showChatToast(`${readCharacter().name || '星回'}收藏了一条信息`);
    }
  }
  return normalized;
}

function syncChatStatus() {
  if (!elements?.status) return;
  const questionnaireActive = questionnaireThinkingCount > 0;
  const typingActive = typingRequestCount > 0;
  const active = questionnaireActive || typingActive;
  elements.status.textContent = questionnaireActive
    ? '对方正在思考中'
    : typingActive
      ? '对方正在输入…'
      : '在线';
  elements.status.classList.toggle('is-typing', active);
}

export function setStarTyping(isTyping) {
  typingRequestCount = Math.max(0, typingRequestCount + (isTyping ? 1 : -1));
  syncChatStatus();
}

export function setQuestionnaireThinking(isThinking) {
  questionnaireThinkingCount = Math.max(0, questionnaireThinkingCount + (isThinking ? 1 : -1));
  syncChatStatus();
}

export function renderChatMessages({ scroll = true } = {}) {
  const list = elements?.messageList;
  if (!list) return;

  const messages = sortMessages(readStoredMessages());
  list.replaceChildren();
  activeMessageId = null;

  if (!messages.length) {
    list.append(createEmptyState());
    return;
  }

  const visibleMessages = messages.slice(-chatRenderLimit);
  const hiddenCount = messages.length - visibleMessages.length;
  const fragment = document.createDocumentFragment();
  if (hiddenCount > 0) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'chat-history-more';
    more.dataset.chatHistoryMore = '';
    more.textContent = `加载更早消息（还有 ${hiddenCount} 条）`;
    fragment.append(more);
  }

  const context = createChatRenderContext();
  visibleMessages.forEach((message) => fragment.append(createMessageElement(message, context)));
  list.append(fragment);
  if (scroll) scrollToLatest();
}

function emitMessageAction(action, message, changed) {
  window.dispatchEvent(
    new CustomEvent(MESSAGE_ACTION_EVENT, {
      detail: {
        action,
        message,
        changed,
        phase: 'complete',
      },
    }),
  );
}

export function performChatMessageAction(action, messageOrId) {
  const messageId = typeof messageOrId === 'string' ? messageOrId : messageOrId?.id;
  if (!messageId) return false;

  const messages = readStoredMessages();
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) return false;

  const current = messages[index];

  if (action === 'delete') {
    if (current.type === 'questionnaire') cancelQuestionnaire(messageId);
    messages.splice(index, 1);
    if (!writeStoredMessages(messages)) return false;
    notifyQuestionnaireQueued();
    const element = findChatMessageElement(messageId);
    element?.remove();
    if (!messages.length && elements?.messageList) {
      elements.messageList.replaceChildren(createEmptyState());
    }
    return true;
  }

  if (action === 'withdraw') {
    if (!canWithdrawMessage(current)) return false;
    current.withdrawn = true;
    if (current.type === 'questionnaire') {
      current.questionnaire = { ...(current.questionnaire || {}), status: 'cancelled' };
      cancelQuestionnaire(messageId);
    }
    if (!writeStoredMessages(messages)) return false;
    notifyQuestionnaireQueued();
    replaceChatMessageElement(current);
    return true;
  }

  if (action === 'favorite') {
    const nextFavorited = !current.favorited;
    current.favorited = nextFavorited;
    if (!writeStoredMessages(messages)) return false;
    const button = findChatMessageElement(messageId)?.querySelector('[data-message-action="favorite"]');
    if (button) {
      button.textContent = nextFavorited ? '取消收藏' : '收藏';
      button.title = nextFavorited ? '取消这条收藏' : '';
    }
    const myName = readSettings().userName || '我';
    showChatToast(nextFavorited ? `${myName}收藏了一条信息` : `${myName}取消了一条收藏`);
    return true;
  }

  return false;
}

function submitStarQuestionnaireAnswer(messageElement, answerValue = '') {
  const messages = readStoredMessages();
  const message = messages.find((item) => item.id === messageElement.dataset.messageId);
  if (!message || message.type !== 'questionnaire' || !message.questionnaire) return;

  const questionnaire = message.questionnaire;
  if (questionnaire.status !== 'awaiting-answer') return;

  if (questionnaire.type === 'qa') {
    const answer = answerValue.trim();
    if (!answer) return;
    questionnaire.answer = answer;
    questionnaire.selected = [];
  } else {
    const selected = Array.from(messageElement.querySelectorAll('.questionnaire-answer-option.is-selected'))
      .map((button) => button.dataset.questionOption);
    if (questionnaire.type === 'single' && selected.length !== 1) return;
    if (questionnaire.type === 'multiple' && selected.length < 1) return;
    questionnaire.selected = selected;
    questionnaire.answer = selected.join('、');
  }

  questionnaire.status = 'answered';
  questionnaire.answeredAt = Date.now();
  if (!writeStoredMessages(messages)) return;
  replaceChatMessageElement(message);
  scheduleLatestScroll();
  maybeStarFavorite(message.id, readSettings().starFavoriteCard);
}

function handleQuestionnaireAnswerSubmit(event) {
  const form = event.target.closest('[data-questionnaire-answer-form]');
  if (!form) return;
  event.preventDefault();
  event.stopPropagation();
  const messageElement = form.closest('[data-message-id]');
  if (!messageElement) return;
  submitStarQuestionnaireAnswer(messageElement, form.querySelector('input[name="answer"]')?.value || '');
}
function handleMessageListClick(event) {
  if (event.target.closest('[data-chat-history-more]')) {
    event.preventDefault();
    loadOlderChatMessages();
    return;
  }

  const actionButton = event.target.closest('[data-message-action]');
  const messageElement = event.target.closest('[data-message-id]');
  if (!messageElement) return;
  if (messageElement.classList.contains('chat-message--system')) return;

  const optionButton = event.target.closest('[data-question-option]');
  if (optionButton) {
    event.preventDefault();
    event.stopPropagation();
    const questionnaire = getChatMessages().find((item) => item.id === messageElement.dataset.messageId)?.questionnaire;
    if (questionnaire?.type === 'single') {
      messageElement.querySelectorAll('.questionnaire-answer-option.is-selected').forEach((button) => {
        if (button !== optionButton) button.classList.remove('is-selected');
      });
      optionButton.classList.add('is-selected');
    } else {
      optionButton.classList.toggle('is-selected');
    }
    return;
  }

  const submitButton = event.target.closest('[data-questionnaire-submit]');
  if (submitButton) {
    event.preventDefault();
    event.stopPropagation();
    submitStarQuestionnaireAnswer(messageElement);
    return;
  }

  if (actionButton) {
    event.preventDefault();
    event.stopPropagation();

    if (actionButton.disabled) return;

    const message = getChatMessages().find((item) => item.id === messageElement.dataset.messageId);
    if (message) {
      const changed = performChatMessageAction(actionButton.dataset.messageAction, message);
      emitMessageAction(actionButton.dataset.messageAction, message, changed);
    }
    closeActiveMessage();
    return;
  }

  setActiveMessage(messageElement.dataset.messageId);
}

function handleMessageListKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (event.target.closest('[data-message-action], .questionnaire-answer-form, .questionnaire-answer-options, [data-questionnaire-submit]')) return;

  const messageElement = event.target.closest('[data-message-id]');
  if (!messageElement) return;

  event.preventDefault();
  setActiveMessage(messageElement.dataset.messageId);
}

function handleSendMessage(event) {
  event.preventDefault();

  const input = elements?.input;
  if (!input) return;

  const content = input.value.trim();
  if (!content) {
    input.focus();
    return;
  }

  const turnId = createTurnId();
  const message = {
    id: createMessageId(),
    role: 'user',
    type: 'text',
    content,
    timestamp: Date.now(),
    turnId,
    sequence: nextSequence(),
    read: false,
    favorited: false,
    starFavorited: false,
  };

  const savedMessage = addChatMessage(message, { persist: true, scroll: true });
  if (!savedMessage) return;

  maybeStarFavorite(savedMessage.id, readSettings().starFavorite);

  input.value = '';
  closeToolPanel();
  maybeChangeChatMood(0.35);
  updateChatMood();
  input.focus({ preventScroll: true });
  scheduleLatestScroll();

  window.dispatchEvent(
    new CustomEvent(STAR_REPLY_TRIGGER_EVENT, {
      detail: { message: savedMessage, storageKey: CHAT_STORAGE_KEY },
    }),
  );
}

function bindEvents() {
  if (!elements || eventsBound) return;

  elements.form.addEventListener('submit', handleSendMessage);
  elements.toolToggle?.addEventListener('click', toggleToolMenu);
  elements.imageButton?.addEventListener('click', () => {
    closeToolMenu();
    elements.imageInput?.click();
  });
  elements.callButton?.addEventListener('click', () => {
    closeToolMenu();
    startOutboundCall();
  });
  elements.callAnswer?.addEventListener('click', answerIncomingCall);
  elements.callReject?.addEventListener('click', rejectIncomingCall);
  elements.callHangup?.addEventListener('click', hangupCurrentCall);
  window.addEventListener(CALL_CHECK_EVENT, maybeTriggerIncomingCall);
  elements.imageInput?.addEventListener('change', (event) => {
    // 先取出快照再清空 input，否则 FileList 会被一并清掉。
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    void sendChatImages(files);
  });
  elements.messageList.addEventListener('click', handleMessageListClick);
  elements.messageList.addEventListener('submit', handleQuestionnaireAnswerSubmit);
  elements.messageList.addEventListener('keydown', handleMessageListKeydown);
  elements.input.addEventListener('focus', () => {
    syncVisualViewport();
    scheduleLatestScroll();
  });
  elements.input.addEventListener('blur', () => {
    window.setTimeout(syncVisualViewport, 80);
  });

  window.addEventListener(SETTINGS_CHANGED_EVENT, () => {
    invalidateAvatarCache();
    if (document.body.dataset.view === 'chat') renderChatMessages({ scroll: false });
  });
  window.addEventListener('xinghui:manage-data-changed', () => {
    updateChatMood();
    if (elements?.toolPanel?.dataset.kind === 'sticker') void renderStickerGrid();
  });
  window.addEventListener(CHARACTER_CHANGED_EVENT, () => {
    invalidateAvatarCache();
    updateChatProfileAvatar();
    if (document.body.dataset.view === 'chat') renderChatMessages({ scroll: false });
  });

  elements.backButton?.addEventListener('click', () => {
    navigateTo('home');
  });

  elements.toolButtons?.forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.chatPlaceholder;
      toggleToolPanel(action);
      window.dispatchEvent(
        new CustomEvent(CHAT_PLACEHOLDER_EVENT, {
          detail: { action, open: !elements.toolPanel.hidden },
        }),
      );
    });
  });

  elements.toolPanel?.addEventListener('click', (event) => {
    if (event.target.closest('[data-sticker-id]')) {
      handleStickerGridClick(event);
    }
    if (event.target.closest('[data-sticker-repair]')) {
      event.preventDefault();
      event.stopPropagation();
      void handleStickerRepair();
    }
    if (event.target.closest('[data-sticker-repair-dismiss]')) {
      event.preventDefault();
      event.stopPropagation();
      elements.toolPanel.querySelector('.sticker-grid__repair')?.remove();
    }
  });

  elements.questionnaireForm?.addEventListener('submit', handleQuestionnaireSubmit);
  elements.questionnaireType?.addEventListener('change', updateQuestionnairePanelControls);
  elements.questionnaireClear?.addEventListener('click', () => {
    clearQuestionnaireDraft();
    hydrateQuestionnairePanel({});
    setQuestionnaireError('');
  });

  document.addEventListener('click', (event) => {
    if (!viewRoot?.contains(event.target) || !event.target.closest('.chat-message')) {
      closeActiveMessage();
    }
    if (!event.target.closest('.chat-composer__tool, .chat-tool-menu, .chat-tool-panel, .chat-questionnaire-panel, .sticker-grid')) {
      closeToolPanel();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeActiveMessage();
    closeToolPanel();
  });

  window.visualViewport?.addEventListener('resize', syncVisualViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncVisualViewport, { passive: true });
  window.addEventListener('orientationchange', scheduleLatestScroll, { passive: true });

  eventsBound = true;
}

export function initChatView(root = document.getElementById('view-chat')) {
  if (!root) return false;

  viewRoot = root;
  viewRoot.innerHTML = `
    <div class="chat-shell">
      <div class="chat-toast" id="chatToast" role="status" aria-live="polite" hidden></div>
      <header class="chat-topbar">
        <button class="chat-topbar__back" id="chatBackButton" type="button" aria-label="返回首页">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <span class="chat-profile__avatar" data-pat-avatar role="button" tabindex="0" aria-label="星回头像，长按拍一拍">星</span>
        <span class="chat-topbar__copy">
          <strong id="chatTitle">星回</strong>
          <span class="chat-topbar__meta">
            <span class="chat-status-line">
              <span class="chat-status-line__label">状态：</span>
              <span class="chat-profile__status" id="chatStatus">在线</span>
            </span>
            <span class="chat-topbar__mood" id="chatMood">心情 · 还没有设置状态</span>
          </span>
        </span>
      </header>

      <div class="chat-call-panel" id="chatCallPanel" role="dialog" aria-modal="true" aria-labelledby="chatCallName" hidden>
        <div class="chat-call-card">
          <div class="chat-call-avatar" id="chatCallAvatar" aria-hidden="true">星</div>
          <strong class="chat-call-name" id="chatCallName">星回</strong>
          <span class="chat-call-status" id="chatCallStatus">正在呼叫…</span>
          <span class="chat-call-duration" id="chatCallDuration">00:00</span>
          <div class="chat-call-actions">
            <button class="chat-call-action chat-call-action--reject" id="chatCallReject" type="button" hidden>拒接</button>
            <button class="chat-call-action chat-call-action--answer" id="chatCallAnswer" type="button" hidden>接听</button>
            <button class="chat-call-action chat-call-action--hangup" id="chatCallHangup" type="button" hidden>挂断</button>
          </div>
        </div>
      </div>

      <div class="chat-conversation">
        <div
          class="chat-message-list"
          id="chatMessageList"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="与星回的聊天记录"
        ></div>

        <div class="chat-composer-area">
          <div class="chat-tool-menu" id="chatToolMenu" aria-label="聊天工具" hidden>
            <button class="chat-tool-menu__item" type="button" id="chatImageButton" aria-label="发送图片">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="14" rx="2.5"></rect>
                <circle cx="9" cy="10" r="1.3"></circle>
                <path d="m5 16.5 4.5-4.5 3.2 3.2 2.6-2.6 4.2 4.2"></path>
              </svg>
              <span>发送图片</span>
            </button>
            <button class="chat-tool-menu__item" type="button" data-chat-placeholder="survey" aria-label="打开问卷面板" aria-expanded="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M5 5.5h14v10H9l-4 3.2z"></path>
                <circle cx="9" cy="10.5" r=".7" fill="currentColor" stroke="none"></circle>
                <circle cx="12" cy="10.5" r=".7" fill="currentColor" stroke="none"></circle>
                <circle cx="15" cy="10.5" r=".7" fill="currentColor" stroke="none"></circle>
              </svg>
              <span>问卷</span>
            </button>
            <button class="chat-tool-menu__item" type="button" data-chat-placeholder="sticker" aria-label="打开表情包面板" aria-expanded="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8"></circle>
                <path d="M9 10h.01M15 10h.01M8.8 14.2c1.7 1.7 4.7 1.7 6.4 0"></path>
              </svg>
              <span>表情包</span>
            </button>
            <button class="chat-tool-menu__item" type="button" id="chatCallButton" aria-label="发起语音通话">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.8 12.8 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.8 12.8 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
              <span>通话</span>
            </button>
          </div>
          <div class="chat-tool-panel" id="chatToolPanel" role="status" hidden></div>
          <div class="chat-questionnaire-panel" id="chatQuestionnairePanel" hidden>
            <form class="questionnaire-form" id="chatQuestionnaireForm">
              <div class="questionnaire-form__header">
                <div>
                  <strong>问卷设置</strong>
                  <small>发送后星回按概率思考与作答</small>
                </div>
                <button type="button" class="questionnaire-form__clear" id="chatQuestionnaireClear">清空</button>
              </div>

              <label class="questionnaire-field">
                <span>问题</span>
                <textarea id="chatQuestionnaireQuestion" rows="2" maxlength="500" placeholder="想问星回什么？"></textarea>
              </label>

              <label class="questionnaire-field" id="chatQuestionnaireOptionsField">
                <span>选项（每行一个）</span>
                <textarea id="chatQuestionnaireOptions" rows="4" placeholder="选项 A&#10;选项 B&#10;选项 C"></textarea>
              </label>

              <label class="questionnaire-field">
                <span>类型</span>
                <select id="chatQuestionnaireType">
                  <option value="qa">问答问卷</option>
                  <option value="single">单选题</option>
                  <option value="multiple">多选题</option>
                </select>
              </label>

              <div class="questionnaire-form__row">
                <label class="questionnaire-field">
                  <span>最短思考（秒）</span>
                  <input id="chatQuestionnaireThinkMin" type="number" min="1" max="60" step="1" inputmode="numeric" />
                </label>
                <label class="questionnaire-field">
                  <span>最长思考（秒）</span>
                  <input id="chatQuestionnaireThinkMax" type="number" min="1" max="60" step="1" inputmode="numeric" />
                </label>
              </div>

              <div class="questionnaire-form__row" id="chatQuestionnaireMultiField" hidden>
                <label class="questionnaire-field">
                  <span>最少选择</span>
                  <input id="chatQuestionnaireMultiMin" type="number" min="1" max="10" step="1" inputmode="numeric" />
                </label>
                <label class="questionnaire-field">
                  <span>最多选择</span>
                  <input id="chatQuestionnaireMultiMax" type="number" min="1" max="10" step="1" inputmode="numeric" />
                </label>
              </div>

              <p class="questionnaire-form__error" id="chatQuestionnaireError" hidden></p>
              <button class="questionnaire-form__send" type="submit">发送问卷</button>
            </form>
          </div>
          <form class="chat-composer" id="chatComposer">
            <button class="chat-composer__tool chat-composer__menu-toggle" type="button" id="chatToolsToggle" aria-label="更多聊天工具" aria-controls="chatToolMenu" aria-expanded="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5"></circle>
                <circle cx="8.2" cy="12" r="1" fill="currentColor" stroke="none"></circle>
                <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"></circle>
                <circle cx="15.8" cy="12" r="1" fill="currentColor" stroke="none"></circle>
              </svg>
            </button>
            <input id="chatImageInput" type="file" accept="image/*" multiple hidden />
            <input
              class="chat-composer__input"
              id="chatInput"
              name="message"
              type="text"
              autocomplete="off"
              enterkeyhint="send"
              inputmode="text"
              aria-label="输入消息"
              placeholder="写点什么…"
            />
            <button class="chat-composer__send" id="chatSend" type="submit" aria-label="发送" title="发送">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 3 10.5 13.5"></path><path d="m21 3-6.8 18-3.7-7.5L3 9.8z"></path></svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  `;

  elements = {
    toast: viewRoot.querySelector('#chatToast'),
    imageButton: viewRoot.querySelector('#chatImageButton'),
    imageInput: viewRoot.querySelector('#chatImageInput'),
    backButton: viewRoot.querySelector('#chatBackButton'),
    profileAvatar: viewRoot.querySelector('.chat-profile__avatar'),
    title: viewRoot.querySelector('#chatTitle'),
    status: viewRoot.querySelector('#chatStatus'),
    mood: viewRoot.querySelector('#chatMood'),
    form: viewRoot.querySelector('#chatComposer'),
    input: viewRoot.querySelector('#chatInput'),
    messageList: viewRoot.querySelector('#chatMessageList'),
    toolMenu: viewRoot.querySelector('#chatToolMenu'),
    toolToggle: viewRoot.querySelector('#chatToolsToggle'),
    toolPanel: viewRoot.querySelector('#chatToolPanel'),
    toolButtons: Array.from(viewRoot.querySelectorAll('[data-chat-placeholder]')),
    callButton: viewRoot.querySelector('#chatCallButton'),
    callPanel: viewRoot.querySelector('#chatCallPanel'),
    callAvatar: viewRoot.querySelector('#chatCallAvatar'),
    callName: viewRoot.querySelector('#chatCallName'),
    callStatus: viewRoot.querySelector('#chatCallStatus'),
    callDuration: viewRoot.querySelector('#chatCallDuration'),
    callReject: viewRoot.querySelector('#chatCallReject'),
    callAnswer: viewRoot.querySelector('#chatCallAnswer'),
    callHangup: viewRoot.querySelector('#chatCallHangup'),
    questionnairePanel: viewRoot.querySelector('#chatQuestionnairePanel'),
    questionnaireForm: viewRoot.querySelector('#chatQuestionnaireForm'),
    questionnaireQuestion: viewRoot.querySelector('#chatQuestionnaireQuestion'),
    questionnaireOptions: viewRoot.querySelector('#chatQuestionnaireOptions'),
    questionnaireOptionsField: viewRoot.querySelector('#chatQuestionnaireOptionsField'),
    questionnaireType: viewRoot.querySelector('#chatQuestionnaireType'),
    questionnaireThinkMin: viewRoot.querySelector('#chatQuestionnaireThinkMin'),
    questionnaireThinkMax: viewRoot.querySelector('#chatQuestionnaireThinkMax'),
    questionnaireMultiMin: viewRoot.querySelector('#chatQuestionnaireMultiMin'),
    questionnaireMultiMax: viewRoot.querySelector('#chatQuestionnaireMultiMax'),
    questionnaireMultiField: viewRoot.querySelector('#chatQuestionnaireMultiField'),
    questionnaireError: viewRoot.querySelector('#chatQuestionnaireError'),
    questionnaireClear: viewRoot.querySelector('#chatQuestionnaireClear'),
  };

  bindEvents();
  updateChatProfileAvatar();
  updateChatMood();
  startQuestionnaireEngine({
    getMessages: readStoredMessages,
    setThinking: setQuestionnaireThinking,
    onMessageChanged: (message) => {
      if (message) replaceChatMessageElement(message);
      else renderChatMessages({ scroll: false });
      if (document.body.dataset.view === 'chat') scheduleLatestScroll();
    },
    addSystemMessage: (content, turnId) => {
      addChatMessage(
        {
          id: createMessageId(),
          role: 'system',
          type: 'text',
          content,
          timestamp: Date.now(),
          turnId,
          sequence: nextSequence(),
          read: true,
          favorited: false,
          starFavorited: false,
        },
        { persist: true, scroll: true },
      );
    },
  });
  return true;
}

export function onChatViewEnter() {
  closeActiveMessage();
  closeToolPanel();
  updateChatProfileAvatar();
  updateChatMood();
  renderChatMessages();
  syncVisualViewport();
}

export {
  CALL_CHECK_EVENT,
  CHAT_STORAGE_KEY,
  MESSAGE_ACTION_EVENT,
  STAR_REPLY_TRIGGER_EVENT,
  CHAT_PLACEHOLDER_EVENT,
};
