import { pickRandom, randomBetween, randomInt } from './random.js';
import {
  QUESTIONNAIRE_CATEGORY_NAME,
  hasManageCategory,
  readQuestionnaireAnswers,
  readCharacter,
  readChatMessages,
  writeChatMessages,
} from './storage.js';

const ACTIVE_STATUSES = new Set(['pending', 'thinking']);

let engineCallbacks = null;
let waitTimer = null;
let waitResolver = null;
let running = false;

function shuffle(items) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function buildQuestionnaireMessage(form) {
  const options = Array.isArray(form.options)
    ? form.options.map((option) => String(option).trim()).filter(Boolean).slice(0, 100)
    : [];
  const type = ['qa', 'single', 'multiple'].includes(form.type) ? form.type : 'qa';
  const question = String(form.question || '').trim().slice(0, 500);
  const multiMax = Math.min(10, Math.max(1, Number(form.multiMax) || options.length || 3));
  const multiMin = Math.min(multiMax, Math.max(1, Number(form.multiMin) || 1));

  return {
    question,
    options,
    type,
    thinkMin: Math.min(60, Math.max(1, Number(form.thinkMin) || 10)),
    thinkMax: Math.min(60, Math.max(1, Number(form.thinkMax) || 15)),
    answerNow: Math.min(1, Math.max(0, Number(form.answerNow) ?? 0.6)),
    multiMin,
    multiMax,
    status: 'pending',
    createdAt: Date.now(),
    sequence: Date.now(),
    answer: '',
    selected: [],
    delayNotice: false,
  };
}

export function answerQuestionnaire(questionnaire, answers = readQuestionnaireAnswers()) {
  const result = { ...questionnaire, status: 'answered', delayNotice: false };

  if (result.type === 'single' && result.options.length) {
    const selected = [pickRandom(result.options)];
    result.selected = selected;
    result.answer = selected[0];
    return result;
  }

  if (result.type === 'multiple' && result.options.length) {
    const count = Math.max(1, Math.min(result.options.length, randomInt(result.multiMin, result.multiMax)));
    const selected = shuffle(result.options).slice(0, count).sort(
      (first, second) => result.options.indexOf(first) - result.options.indexOf(second),
    );
    result.selected = selected;
    result.answer = selected.join('、');
    return result;
  }

  if (!hasManageCategory(QUESTIONNAIRE_CATEGORY_NAME)) {
    result.answer = '请先重建该类别';
    result.selected = [];
    return result;
  }

  const answer = pickRandom(answers);
  result.answer = answer?.content || '（暂无可用回答）';
  result.selected = [];
  return result;
}

function sortPending(messages) {
  return messages
    .filter((message) => message.type === 'questionnaire' && message.questionnaire && ACTIVE_STATUSES.has(message.questionnaire.status))
    .sort((first, second) => first.questionnaire.sequence - second.questionnaire.sequence || first.questionnaire.createdAt - second.questionnaire.createdAt);
}

function updateMessage(message) {
  const messages = readChatMessages();
  const index = messages.findIndex((item) => item.id === message.id);
  if (index === -1) return;
  messages[index] = message;
  writeChatMessages(messages);
}

function interruptWait() {
  if (waitTimer) {
    window.clearTimeout(waitTimer);
    waitTimer = null;
  }
  if (waitResolver) {
    const resolve = waitResolver;
    waitResolver = null;
    resolve(false);
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    waitResolver = resolve;
    waitTimer = window.setTimeout(() => {
      waitTimer = null;
      waitResolver = null;
      resolve(true);
    }, milliseconds);
  });
}

async function processQueue() {
  if (running || !engineCallbacks) return;
  running = true;

  try {
    while (engineCallbacks) {
      const messages = engineCallbacks.getMessages();
      const pending = sortPending(messages);
      if (!pending.length) break;

      const next = pending[0];
      const messageId = next.id;
      let current = messages.find((message) => message.id === messageId);
      if (!current || !current.questionnaire || !ACTIVE_STATUSES.has(current.questionnaire.status)) continue;

      if (current.questionnaire.status === 'pending') {
        current.questionnaire.status = 'thinking';
        updateMessage(current);
        engineCallbacks.onMessageChanged();
      }

      engineCallbacks.setThinking(true);
      const questionnaire = current.questionnaire;
      const minSeconds = Math.min(questionnaire.thinkMin, questionnaire.thinkMax);
      const maxSeconds = Math.max(questionnaire.thinkMin, questionnaire.thinkMax);
      const waitMs = Math.round(randomBetween(minSeconds, maxSeconds) * 1000);
      const completed = await wait(waitMs);
      if (!completed) continue;

      current = engineCallbacks.getMessages().find((message) => message.id === messageId);
      if (!current || current.withdrawn) continue;
      if (!current.questionnaire || !ACTIVE_STATUSES.has(current.questionnaire.status)) continue;

      if (Math.random() >= current.questionnaire.answerNow) {
        current.questionnaire.status = 'delayed';
        current.questionnaire.delayNotice = true;
        updateMessage(current);
        const { name } = readCharacter();
        engineCallbacks.addSystemMessage(`${name}选择延迟作答`, current.turnId);
      } else {
        current.questionnaire = answerQuestionnaire(current.questionnaire);
        updateMessage(current);
      }

      engineCallbacks.setThinking(false);
      engineCallbacks.onMessageChanged();
    }
  } finally {
    running = false;
    engineCallbacks.setThinking(false);
  }
}

export function startQuestionnaireEngine(callbacks) {
  engineCallbacks = callbacks;
  running = false;
  interruptWait();
  void processQueue();
}

export function notifyQuestionnaireQueued() {
  void processQueue();
}

export function cancelQuestionnaire(messageId) {
  if (messageId === undefined) {
    interruptWait();
    return;
  }

  const messages = readChatMessages();
  let changed = false;
  messages.forEach((message) => {
    if (message.id !== messageId || message.type !== 'questionnaire' || !message.questionnaire) return;
    if (!['pending', 'thinking', 'delayed'].includes(message.questionnaire.status)) return;
    message.questionnaire.status = 'cancelled';
    message.questionnaire.delayNotice = false;
    changed = true;
  });

  if (changed) writeChatMessages(messages);

  if (messageId === engineCallbacks?.activeId) interruptWait();
  notifyQuestionnaireQueued();
}

export function resetQuestionnaireEngine() {
  engineCallbacks = null;
  interruptWait();
  running = false;
}
