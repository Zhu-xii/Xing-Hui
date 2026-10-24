import { pickRandom, randomChance, randomInt } from './random.js';
import {
  LETTER_GROUP_ID,
  applyNicknamePlaceholders,
  readCards,
  readLetters,
  readSettings,
  updateSettings,
  writeLetters,
} from './storage.js';

const CHECK_INTERVAL_MS = 60 * 1000;
const LETTER_TITLES = Object.freeze([
  '写给今天的你',
  '一封慢慢拆开的信',
  '见字如面',
  '想和你说的话',
  '在你身边的时候',
  '今天的风很轻',
  '留一盏灯给你',
  '读完要记得笑',
]);

let initialized = false;
let timer = null;

function shuffle(items) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function dayKey(value = Date.now()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function letterCards() {
  return readCards()
    .filter((card) => card.groupId === LETTER_GROUP_ID && !card.disabled)
    .map((card) => applyNicknamePlaceholders(String(card.content || '').trim()))
    .filter(Boolean);
}

function notifyLettersChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('xinghui:letters-changed'));
  }
}

export function composeLetter(direction = 'star', now = Date.now()) {
  const cards = letterCards();
  if (!cards.length) return null;
  const settings = readSettings();
  const minimum = Math.min(settings.letterSentenceMin, settings.letterSentenceMax, cards.length);
  const maximum = Math.min(settings.letterSentenceMax, cards.length);
  const count = randomInt(minimum, maximum);
  const sentences = shuffle(cards).slice(0, count);
  const letter = {
    id: `letter_${now}_${Math.random().toString(36).slice(2, 8)}`,
    direction: direction === 'user' ? 'user' : 'star',
    title: pickRandom(LETTER_TITLES) || '一封来信',
    content: sentences.join('\n\n'),
    createdAt: now,
    read: false,
  };

  const letters = readLetters();
  letters.unshift(letter);
  if (!writeLetters(letters)) return null;
  notifyLettersChanged();
  return letter;
}

export function writeUserLetter({ title, content } = {}, now = Date.now()) {
  const cleanContent = String(content || '').trim();
  if (!cleanContent) return null;

  const letter = {
    id: `letter_${now}_${Math.random().toString(36).slice(2, 8)}`,
    direction: 'user',
    title: String(title || '').trim().slice(0, 80) || '一封手写信',
    content: cleanContent.slice(0, 12000),
    createdAt: now,
    read: true,
  };

  const letters = readLetters();
  letters.unshift(letter);
  if (!writeLetters(letters)) return null;
  notifyLettersChanged();
  return letter;
}

export function checkStarLetter(now = Date.now()) {
  const settings = readSettings();
  if (!settings.letterEnabled) return false;
  if (!letterCards().length) return false;
  const intervalMs = settings.letterIntervalHours * 60 * 60 * 1000;
  const lastCheck = Number(settings.lastLetterCheckAt) || 0;
  if (now - lastCheck < intervalMs) return false;

  updateSettings({ lastLetterCheckAt: now });
  const today = dayKey(now);
  const todayCount = readLetters()
    .filter((letter) => letter.direction === 'star' && dayKey(letter.createdAt) === today)
    .length;
  if (todayCount >= settings.letterDailyMax) return false;
  if (!randomChance(settings.letterProbability)) return false;
  return Boolean(composeLetter('star', now));
}

export function initLetterEngine() {
  if (initialized || typeof window === 'undefined') return false;
  initialized = true;
  checkStarLetter();
  timer = window.setInterval(() => checkStarLetter(), CHECK_INTERVAL_MS);
  return timer !== null;
}

export function resetLetterEngine() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  initialized = false;
}
