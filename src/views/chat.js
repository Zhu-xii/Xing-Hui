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

const MESSAGE_ACTION_EVENT = 'xinghui:message-action';
const STAR_REPLY_TRIGGER_EVENT = 'xinghui:trigger-star-reply';
const CHAT_PLACEHOLDER_EVENT = 'xinghui:chat-placeholder';

let viewRoot = null;
let elements = null;
let activeMessageId = null;
let typingRequestCount = 0;
let eventsBound = false;
let visualViewportFrame = null;

function createMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

function fillStarAvatar(container) {
  const { avatar } = readCharacter();
  container.replaceChildren();

  if (avatar) {
    const image = document.createElement('img');
    image.src = avatar;
    image.alt = '';
    container.append(image);
    return;
  }

  container.textContent = '星';
}

function updateChatProfileAvatar() {
  const character = readCharacter();
  if (elements?.profileAvatar) fillStarAvatar(elements.profileAvatar);
  if (elements?.title) elements.title.textContent = character.name || '星回';
}

function updateChatMood({ force = false } = {}) {
  if (!elements?.mood) return;
  const mood = getCurrentChatMood({ force });
  elements.mood.textContent = `心情 · ${mood.text}`;
  elements.mood.classList.toggle('is-warning', Boolean(mood.missing || mood.empty));
}
function createMessageAvatar(role) {
  const avatar = document.createElement('span');
  avatar.className = `chat-message__avatar chat-message__avatar--${role}`;
  avatar.setAttribute('aria-hidden', 'true');

  if (role === 'star') fillStarAvatar(avatar);
  else avatar.textContent = '我';

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
function createMessageBubble(message) {
  const bubble = document.createElement('div');
  bubble.className = `bubble message-bubble bubble--${message.role}`;

  if (message.withdrawn) {
    bubble.classList.add('message-bubble--withdrawn');
    bubble.textContent = '你撤回了一条消息';
    return bubble;
  }

  if (message.type === 'questionnaire') {
    return createQuestionnaireBubble(message);
  }

  if (message.type === 'sticker') {
    bubble.classList.add('message-bubble--sticker');

    if (/^data:image\//i.test(message.content)) {
      const image = document.createElement('img');
      image.className = 'message-sticker__image';
      image.src = message.content;
      image.alt = '表情包';
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
    bubble.textContent = message.content || ' ';
  }

  return bubble;
}

function createMessageElement(message) {
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
      : `${message.role === 'user' ? '我' : '星回'}的消息，点击查看操作`,
  );

  const actions = document.createElement('div');
  actions.className = 'chat-message__actions';
  actions.setAttribute('aria-label', '消息操作');

  const availableActions = message.withdrawn
    ? [['delete', '删除']]
    : [
        ['delete', '删除'],
        ['withdraw', '撤回'],
        ['favorite', message.favorited ? '已收藏' : '收藏'],
      ];

  availableActions.forEach(([action, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-message__action';
    button.dataset.messageAction = action;
    button.textContent = label;

    if (action === 'withdraw' && message.role !== 'user') {
      button.disabled = true;
      button.title = '星回的消息不可撤回';
      button.setAttribute('aria-disabled', 'true');
    }

    if (action === 'favorite' && message.favorited) {
      button.disabled = true;
      button.title = '这条消息已经收藏';
      button.setAttribute('aria-disabled', 'true');
    }

    actions.append(button);
  });

  const content = document.createElement('div');
  content.className = 'chat-message__content';
  content.append(createMessageBubble(message));

  const meta = document.createElement('div');
  meta.className = 'chat-message__meta';

  const { showTimestamp } = readSettings();
  if (showTimestamp) {
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
  else article.append(actions, createMessageAvatar(message.role), content);
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
    thinkMin: Number(elements.questionnaireThinkMin.value) || 10,
    thinkMax: Number(elements.questionnaireThinkMax.value) || 15,
    answerNow: Number(elements.questionnaireAnswerNow.value) ?? 0.6,
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
  elements.questionnaireThinkMin.value = String(data.thinkMin ?? 10);
  elements.questionnaireThinkMax.value = String(data.thinkMax ?? 15);
  elements.questionnaireAnswerNow.value = String(data.answerNow ?? 0.6);
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
  const questionnaire = buildQuestionnaireMessage(draft);
  const message = {
    id: createMessageId(),
    role: 'user',
    type: 'questionnaire',
    content: questionnaire.question,
    timestamp: Date.now(),
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

  closeQuestionnairePanel();
  scheduleLatestScroll();
  notifyQuestionnaireQueued();
}

function setQuestionnaireError(message) {
  if (!elements.questionnaireError) return;
  elements.questionnaireError.textContent = message;
  elements.questionnaireError.hidden = !message;
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
}

function toggleToolPanel(kind) {
  const panel = elements?.toolPanel;
  if (!panel) return;

  const shouldOpen = panel.hidden || panel.dataset.kind !== kind;
  panel.dataset.kind = shouldOpen ? kind : '';
  panel.hidden = !shouldOpen;
  if (kind === 'survey') {
    openQuestionnairePanel();
    return;
  } else if (kind === 'sticker') {
    panel.textContent = hasManageCategory(STICKER_CATEGORY_NAME)
      ? `表情包已保存 ${readStickers().filter((sticker) => sticker.enabled !== false).length} 张。`
      : '请先重建该类别';
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
  list.append(createMessageElement(message));
}

export function getChatMessages() {
  return readStoredMessages();
}

export function addChatMessage(message, { persist = true, scroll = true } = {}) {
  const normalized = normalizeChatMessage(message);
  if (!normalized) return null;

  const messages = readStoredMessages();
  messages.push(normalized);

  if (persist && !writeStoredMessages(messages)) return null;

  appendMessage(normalized);
  if (scroll) scrollToLatest({ behavior: 'smooth' });
  if (normalized.role === 'star') {
    maybeChangeChatMood(0.25);
    updateChatMood();
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

export function renderChatMessages() {
  const list = elements?.messageList;
  if (!list) return;

  const messages = readStoredMessages();
  list.replaceChildren();
  activeMessageId = null;

  if (!messages.length) {
    list.append(createEmptyState());
    return;
  }

  messages.forEach((message) => list.append(createMessageElement(message)));
  scrollToLatest();
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
    renderChatMessages();
    return true;
  }

  if (action === 'withdraw') {
    if (current.role !== 'user' || current.withdrawn) return false;
    current.withdrawn = true;
    if (current.type === 'questionnaire') {
      current.questionnaire = { ...(current.questionnaire || {}), status: 'cancelled' };
      cancelQuestionnaire(messageId);
    }
    if (!writeStoredMessages(messages)) return false;
    notifyQuestionnaireQueued();
    renderChatMessages();
    return true;
  }

  if (action === 'favorite') {
    if (current.favorited) return true;
    current.favorited = true;
    if (!writeStoredMessages(messages)) return false;
    renderChatMessages();
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
  renderChatMessages();
  scheduleLatestScroll();
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

  const message = {
    id: createMessageId(),
    role: 'user',
    type: 'text',
    content,
    timestamp: Date.now(),
    read: false,
    favorited: false,
    starFavorited: false,
  };

  const savedMessage = addChatMessage(message, { persist: true, scroll: true });
  if (!savedMessage) return;

  input.value = '';
  closeToolPanel();
  maybeChangeChatMood(0.35);
  updateChatMood();
  input.focus({ preventScroll: true });
  scheduleLatestScroll();

  // 阶段 4 通过该事件接入随机回复引擎，当前阶段不产生任何回复。
  window.dispatchEvent(
    new CustomEvent(STAR_REPLY_TRIGGER_EVENT, {
      detail: { message: savedMessage, storageKey: CHAT_STORAGE_KEY },
    }),
  );
}

function bindEvents() {
  if (!elements || eventsBound) return;

  elements.form.addEventListener('submit', handleSendMessage);
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

  window.addEventListener(SETTINGS_CHANGED_EVENT, () => renderChatMessages());
  window.addEventListener('xinghui:manage-data-changed', () => updateChatMood());
  window.addEventListener(CHARACTER_CHANGED_EVENT, () => {
    updateChatProfileAvatar();
    renderChatMessages();
  });

  elements.backButton?.addEventListener('click', () => {
    window.location.hash = '#/home';
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
    if (!event.target.closest('.chat-composer__tool') && !event.target.closest('.chat-tool-panel, .chat-questionnaire-panel')) {
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
      <header class="chat-topbar">
        <button class="chat-topbar__back" id="chatBackButton" type="button" aria-label="返回首页">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <span class="chat-profile__avatar" data-pat-avatar role="button" tabindex="0" aria-label="星回头像，长按拍一拍">星</span>
        <span class="chat-topbar__copy">
          <strong id="chatTitle">星回</strong>
          <span class="chat-topbar__meta">
            <span class="chat-profile__status" id="chatStatus">在线</span>
            <span class="chat-topbar__mood" id="chatMood">心情 · 还没有设置状态</span>
          </span>
        </span>
      </header>

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

              <div class="questionnaire-form__row">
                <label class="questionnaire-field">
                  <span>类型</span>
                  <select id="chatQuestionnaireType">
                    <option value="qa">问答问卷</option>
                    <option value="single">单选题</option>
                    <option value="multiple">多选题</option>
                  </select>
                </label>
                <label class="questionnaire-field">
                  <span>现在回答概率</span>
                  <input id="chatQuestionnaireAnswerNow" type="number" min="0" max="1" step="0.1" inputmode="decimal" />
                </label>
              </div>

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
            <button class="chat-composer__tool" type="button" data-chat-placeholder="survey" aria-label="打开问卷面板" aria-expanded="false" title="问卷">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M5 5.5h14v10H9l-4 3.2z"></path>
                <circle cx="9" cy="10.5" r=".7" fill="currentColor" stroke="none"></circle>
                <circle cx="12" cy="10.5" r=".7" fill="currentColor" stroke="none"></circle>
                <circle cx="15" cy="10.5" r=".7" fill="currentColor" stroke="none"></circle>
              </svg>
            </button>
            <button class="chat-composer__tool" type="button" data-chat-placeholder="sticker" aria-label="打开表情包面板" aria-expanded="false" title="表情包">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8"></circle>
                <path d="M9 10h.01M15 10h.01M8.8 14.2c1.7 1.7 4.7 1.7 6.4 0"></path>
              </svg>
            </button>
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
    backButton: viewRoot.querySelector('#chatBackButton'),
    profileAvatar: viewRoot.querySelector('.chat-profile__avatar'),
    title: viewRoot.querySelector('#chatTitle'),
    status: viewRoot.querySelector('#chatStatus'),
    mood: viewRoot.querySelector('#chatMood'),
    form: viewRoot.querySelector('#chatComposer'),
    input: viewRoot.querySelector('#chatInput'),
    messageList: viewRoot.querySelector('#chatMessageList'),
    toolPanel: viewRoot.querySelector('#chatToolPanel'),
    toolButtons: Array.from(viewRoot.querySelectorAll('[data-chat-placeholder]')),
    questionnairePanel: viewRoot.querySelector('#chatQuestionnairePanel'),
    questionnaireForm: viewRoot.querySelector('#chatQuestionnaireForm'),
    questionnaireQuestion: viewRoot.querySelector('#chatQuestionnaireQuestion'),
    questionnaireOptions: viewRoot.querySelector('#chatQuestionnaireOptions'),
    questionnaireOptionsField: viewRoot.querySelector('#chatQuestionnaireOptionsField'),
    questionnaireType: viewRoot.querySelector('#chatQuestionnaireType'),
    questionnaireAnswerNow: viewRoot.querySelector('#chatQuestionnaireAnswerNow'),
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
  renderChatMessages();
  startQuestionnaireEngine({
    getMessages: readStoredMessages,
    setThinking: setQuestionnaireThinking,
    onMessageChanged: () => {
      renderChatMessages();
      scheduleLatestScroll();
    },
    addSystemMessage: (content) => {
      addChatMessage(
        {
          id: createMessageId(),
          role: 'system',
          type: 'text',
          content,
          timestamp: Date.now(),
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
  CHAT_STORAGE_KEY,
  MESSAGE_ACTION_EVENT,
  STAR_REPLY_TRIGGER_EVENT,
  CHAT_PLACEHOLDER_EVENT,
};
