import { pickRandom, randomChance } from './random.js';
import {
  readChatMessages,
  readPromptQuestionnaires,
  readSettings,
  updateSettings,
} from './storage.js';
import { addChatMessage } from '../views/chat.js';

const CHECK_INTERVAL_MS = 60 * 1000;
let initialized = false;
let timer = null;

function isAwaitingAnswer(message) {
  return message.type === 'questionnaire'
    && message.questionnaire?.direction === 'star-asked'
    && ['awaiting-answer', 'pending'].includes(message.questionnaire.status);
}

function createPromptMessage(preset) {
  const questionnaire = {
    question: preset.question,
    options: preset.options,
    type: preset.type,
    thinkMin: 1,
    thinkMax: 1,
    answerNow: 1,
    multiMin: 1,
    multiMax: preset.options.length || 1,
    status: 'awaiting-answer',
    direction: 'star-asked',
    createdAt: Date.now(),
    sequence: Date.now(),
    answer: '',
    selected: [],
    delayNotice: false,
  };

  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: 'star',
    type: 'questionnaire',
    content: preset.question,
    timestamp: Date.now(),
    read: false,
    favorited: false,
    starFavorited: false,
    questionnaire,
  };
}

export function checkPromptQuestionnaire(now = Date.now()) {
  const settings = readSettings();
  const intervalMs = settings.promptQuestionnaireIntervalHours * 60 * 60 * 1000;
  const lastCheck = Number(settings.lastPromptQuestionnaireCheckAt) || 0;
  if (intervalMs > 0 && now - lastCheck < intervalMs) return false;

  updateSettings({ lastPromptQuestionnaireCheckAt: now });

  if (readChatMessages().some(isAwaitingAnswer)) return false;
  if (!randomChance(settings.promptQuestionnaireChance * 100)) return false;

  const presets = readPromptQuestionnaires()
    .filter((item) => item.enabled !== false && item.question)
    .filter((item) => item.type === 'qa' || item.options.length >= 2);
  const preset = pickRandom(presets);
  if (!preset) return false;

  return Boolean(addChatMessage(createPromptMessage(preset), { persist: true, scroll: true }));
}

export function initPromptEngine() {
  if (initialized || typeof window === 'undefined') return false;
  initialized = true;
  checkPromptQuestionnaire();
  timer = window.setInterval(() => checkPromptQuestionnaire(), CHECK_INTERVAL_MS);
  return timer !== null;
}

export function resetPromptEngine() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  initialized = false;
}
