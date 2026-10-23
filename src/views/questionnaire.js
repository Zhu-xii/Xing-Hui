import '../styles/questionnaire.css';
import {
  CHAT_CHANGED_EVENT,
  readChatMessages,
  writeChatMessages,
} from '../lib/storage.js';
import { cancelQuestionnaire } from '../lib/questionnaire.js';

const TYPE_LABELS = { qa: '问答问卷', single: '单选题', multiple: '多选题' };
const DIRECTION_LABELS = { 'user-asked': '我问他的', 'star-asked': '他问我的' };

let viewRoot = null;
let elements = null;
let eventsBound = false;
let historyFilter = 'all';
const selectedHistoryIds = new Set();

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function statusLabel(questionnaire) {
  if (questionnaire.status === 'awaiting-answer') return '等待回答';
  if (questionnaire.status === 'thinking') return '思考中';
  if (questionnaire.status === 'delayed') return '已延后';
  if (questionnaire.status === 'answered') return '已作答';
  if (questionnaire.status === 'cancelled' || questionnaire.status === 'withdrawn') return '已取消';
  return '等待作答';
}

function historyMessages() {
  return readChatMessages()
    .filter((message) => message.type === 'questionnaire' && message.questionnaire)
    .sort((first, second) => second.timestamp - first.timestamp);
}

function filteredHistory() {
  const messages = historyMessages();
  if (historyFilter === 'user') return messages.filter((message) => message.questionnaire.direction === 'user-asked');
  if (historyFilter === 'star') return messages.filter((message) => message.questionnaire.direction === 'star-asked');
  return messages;
}

function renderHistory() {
  const messages = filteredHistory();
  elements.historyCount.textContent = `${messages.length} 条`;
  elements.historyFilterButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.filter === historyFilter);
  });

  if (!messages.length) {
    elements.historyList.innerHTML = `
      <div class="questionnaire-empty">
        <strong>当前筛选下没有记录</strong>
        <p>我问他的、他问我的问卷会显示在这里。</p>
      </div>
    `;
    return;
  }

  elements.historyList.innerHTML = messages.map((message) => {
    const q = message.questionnaire;
    const selected = selectedHistoryIds.has(message.id);
    return `
      <article class="history-card${selected ? ' is-selected' : ''}">
        <label class="questionnaire-history-check">
          <input type="checkbox" data-questionnaire-action="select-history" data-id="${escapeHtml(message.id)}" ${selected ? 'checked' : ''} />
          <span aria-hidden="true"></span>
        </label>
        <div class="history-card__copy">
          <div class="history-card__meta">
            <span>${DIRECTION_LABELS[q.direction] || '我问他的'}</span>
            <span>${TYPE_LABELS[q.type] || '问答问卷'}</span>
            <span>${statusLabel(q)}</span>
          </div>
          <p class="history-card__question">${escapeHtml(q.question)}</p>
          ${q.options?.length ? `
            <ul class="history-card__options">
              ${q.options.map((option) => `<li class="${q.selected?.includes(option) ? 'is-selected' : ''}">${q.selected?.includes(option) ? '√ ' : ''}${escapeHtml(option)}</li>`).join('')}
            </ul>
          ` : ''}
          ${q.answer ? `<p class="history-card__answer">${escapeHtml(q.answer)}</p>` : ''}
        </div>
        <button class="history-card__delete is-danger" type="button" data-questionnaire-action="delete-history" data-id="${escapeHtml(message.id)}">删除</button>
      </article>
    `;
  }).join('');
}

function deleteHistory(ids) {
  const idSet = new Set(ids);
  if (!idSet.size) return;
  const messages = readChatMessages();
  messages.forEach((message) => {
    if (idSet.has(message.id) && message.type === 'questionnaire') cancelQuestionnaire(message.id);
  });
  writeChatMessages(messages.filter((message) => !idSet.has(message.id)));
  ids.forEach((id) => selectedHistoryIds.delete(id));
  renderHistory();
}

function handleClick(event) {
  const filterButton = event.target.closest('[data-filter]');
  if (filterButton) {
    historyFilter = filterButton.dataset.filter;
    selectedHistoryIds.clear();
    renderHistory();
    return;
  }

  const button = event.target.closest('[data-questionnaire-action]');
  if (!button) return;
  const action = button.dataset.questionnaireAction;
  const id = button.dataset.id;

  if (action === 'delete-history') {
    deleteHistory([id]);
  }
  if (action === 'delete-selected') {
    deleteHistory([...selectedHistoryIds]);
  }
  if (action === 'clear-filtered') {
    if (!window.confirm('清空当前筛选下的全部问答记录？')) return;
    deleteHistory(filteredHistory().map((message) => message.id));
  }
}

function handleChange(event) {
  const target = event.target;
  if (target.dataset.questionnaireAction === 'select-history') {
    if (target.checked) selectedHistoryIds.add(target.dataset.id);
    else selectedHistoryIds.delete(target.dataset.id);
    renderHistory();
  }
}

function bindEvents() {
  if (eventsBound) return;
  viewRoot.addEventListener('click', handleClick);
  viewRoot.addEventListener('change', handleChange);
  window.addEventListener(CHAT_CHANGED_EVENT, () => {
    if (document.body.dataset.view === 'questionnaire') renderHistory();
  });
  eventsBound = true;
}

export function initQuestionnaireView(root = document.getElementById('view-questionnaire')) {
  if (!root) return false;
  viewRoot = root;
  viewRoot.innerHTML = `
    <div class="questionnaire-page">
      <header class="questionnaire-header">
        <p class="questionnaire-eyebrow">QUESTION ARCHIVE</p>
        <h2 class="questionnaire-title">问卷</h2>
        <p class="questionnaire-intro">查看已发送的问卷与问答记录。</p>
      </header>

      <section class="questionnaire-card" aria-labelledby="historyTitle">
        <div class="questionnaire-section-heading">
          <div>
            <p class="questionnaire-kicker">历史问答</p>
            <h3 id="historyTitle">问答记录 <small id="questionnaireHistoryCount">0 条</small></h3>
          </div>
          <div class="questionnaire-history-actions">
            <button type="button" data-questionnaire-action="delete-selected">删除所选</button>
            <button class="is-danger" type="button" data-questionnaire-action="clear-filtered">清空当前筛选</button>
          </div>
        </div>
        <div class="questionnaire-filters" role="tablist" aria-label="历史问答筛选">
          <button class="is-active" type="button" data-filter="all">全部</button>
          <button type="button" data-filter="user">我问他的</button>
          <button type="button" data-filter="star">他问我的</button>
        </div>
        <div class="history-list" id="questionnaireHistoryList"></div>
      </section>
    </div>
  `;

  elements = {
    historyCount: viewRoot.querySelector('#questionnaireHistoryCount'),
    historyList: viewRoot.querySelector('#questionnaireHistoryList'),
    historyFilterButtons: Array.from(viewRoot.querySelectorAll('[data-filter]')),
  };

  bindEvents();
  renderHistory();
  return true;
}

export function onQuestionnaireViewEnter() {
  selectedHistoryIds.clear();
  renderHistory();
}
