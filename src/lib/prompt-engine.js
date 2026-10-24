import { pickRandom, randomChance } from './random.js';
import {
  applyNicknamePlaceholders,
  readChatMessages,
  readSettings,
  readTaChoices,
  updateSettings,
} from './storage.js';
import { addChatMessage } from '../views/chat.js';

const CHECK_INTERVAL_MS = 60 * 1000;
let initialized = false;
let timer = null;
let askedChoiceIds = new Set();

function isAwaitingAnswer(message) {
  return message.type === 'questionnaire'
    && message.questionnaire?.direction === 'star-asked'
    && ['awaiting-answer', 'pending'].includes(message.questionnaire.status);
}

function createPromptMessage(preset) {
  const question = applyNicknamePlaceholders(preset.question);
  const optionMeta = preset.options.map((option) => ({
    text: applyNicknamePlaceholders(option.text),
    reply: option.reply.map((reply) => applyNicknamePlaceholders(reply)),
    liked: option.liked,
  }));
  const questionnaire = {
    source: 'ta-choice',
    choiceId: preset.id,
    question,
    options: optionMeta.map((option) => option.text),
    optionMeta,
    preferredIndex: preset.preferredIndex,
    type: 'single',
    thinkMin: 1,
    thinkMax: 1,
    multiMin: 1,
    multiMax: 1,
    status: 'awaiting-answer',
    direction: 'star-asked',
    createdAt: Date.now(),
    sequence: Date.now(),
    answer: '',
    selected: [],
    reply: '',
    matchText: '',
    delayNotice: false,
  };

  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: 'star',
    type: 'questionnaire',
    content: question,
    timestamp: Date.now(),
    read: false,
    favorited: false,
    starFavorited: false,
    questionnaire,
  };
}

function pickChoice() {
  const choices = readTaChoices().filter((item) => (
    item.enabled !== false && item.question && item.options.length >= 2
  ));
  if (!choices.length) return null;

  const availableIds = new Set(choices.map((item) => item.id));
  askedChoiceIds = new Set([...askedChoiceIds].filter((id) => availableIds.has(id)));
  let pool = choices.filter((item) => !askedChoiceIds.has(item.id));
  if (!pool.length) {
    askedChoiceIds.clear();
    pool = choices;
  }
  const choice = pickRandom(pool);
  if (choice) askedChoiceIds.add(choice.id);
  return choice;
}

export function checkPromptQuestionnaire(now = Date.now()) {
  const settings = readSettings();
  const intervalMs = settings.promptQuestionnaireIntervalHours * 60 * 60 * 1000;
  const lastCheck = Number(settings.lastPromptQuestionnaireCheckAt) || 0;
  if (intervalMs > 0 && now - lastCheck < intervalMs) return false;

  updateSettings({ lastPromptQuestionnaireCheckAt: now });

  if (readChatMessages().some(isAwaitingAnswer)) return false;
  if (!randomChance(settings.promptQuestionnaireChance)) return false;

  const preset = pickChoice();
  if (!preset) return false;
  return Boolean(addChatMessage(createPromptMessage(preset), { persist: true, scroll: true }));
}

export function initPromptEngine() {
  if (initialized || typeof window === 'undefined') return false;
  initialized = true;
  askedChoiceIds.clear();
  checkPromptQuestionnaire();
  timer = window.setInterval(() => checkPromptQuestionnaire(), CHECK_INTERVAL_MS);
  return timer !== null;
}

export function resetPromptEngine() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  initialized = false;
  askedChoiceIds.clear();
}
