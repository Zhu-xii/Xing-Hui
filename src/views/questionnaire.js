import '../styles/questionnaire.css';
import {
  CHAT_CHANGED_EVENT,
  readChatMessages,
  readPromptQuestionnaires,
  writeChatMessages,
  writePromptQuestionnaires,
} from '../lib/storage.js';
import { cancelQuestionnaire } from '../lib/questionnaire.js';

const TYPE_LABELS = { qa: '问答问卷', single: '单选题', multiple: '多选题' };
const DIRECTION_LABELS = { 'user-asked': '我问他的', 'star-asked': '他问我的' };

let viewRoot = null;
let elements = null;
let eventsBound = false;
let editingId = '';
let historyFilter = 'all';
const selectedHistoryIds = new Set();

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

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

function renderPresets() {
  const presets = readPromptQuestionnaires();
  if (!presets.length) {
    elements.presetList.innerHTML = `
      <div class="questionnaire-empty questionnaire-empty--compact">
        <strong>还没有预设问卷</strong>
        <p>新增后，星回会按概率和间隔随机发题。</p>
      </div>
    `;
    return;
  }

  elements.presetList.innerHTML = presets.map((preset) => `
    <article class="prompt-card${preset.enabled ? '' : ' is-disabled'}">
      <div class="prompt-card__copy">
        <p>${escapeHtml(preset.question)}</p>
        <small>${TYPE_LABELS[preset.type] || '问答问卷'}${preset.options.length ? ` · ${preset.options.length} 个选项` : ''}</small>
      </div>
      <div class="prompt-card__actions">
        <button type="button" data-questionnaire-action="toggle-preset" data-id="${escapeHtml(preset.id)}">${preset.enabled ? '停用' : '启用'}</button>
        <button type="button" data-questionnaire-action="edit-preset" data-id="${escapeHtml(preset.id)}">编辑</button>
        <button class="is-danger" type="button" data-questionnaire-action="delete-preset" data-id="${escapeHtml(preset.id)}">删除</button>
      </div>
    </article>
  `).join('');
}

function renderEditor() {
  const presets = readPromptQuestionnaires();
  const preset = editingId ? presets.find((item) => item.id === editingId) : null;
  elements.editorQuestion.value = preset?.question || '';
  elements.editorOptions.value = preset?.options?.join('\n') || '';
  elements.editorType.value = preset?.type || 'qa';
  elements.editorTitle.textContent = preset ? '编辑预设问卷' : '新增预设问卷';
  elements.editorCancel.hidden = !preset;
  elements.editorOptionsField.hidden = elements.editorType.value === 'qa';
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

function render() {
  renderPresets();
  renderEditor();
  renderHistory();
}

function savePreset() {
  const question = elements.editorQuestion.value.trim();
  const options = elements.editorOptions.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const type = elements.editorType.value;
  if (!question) return;
  if (type !== 'qa' && options.length < 2) return;

  const presets = readPromptQuestionnaires();
  if (editingId) {
    const preset = presets.find((item) => item.id === editingId);
    if (!preset) return;
    Object.assign(preset, { question, options, type });
  } else {
    presets.push({ id: createId('prompt'), question, options, type, enabled: true });
  }
  writePromptQuestionnaires(presets);
  editingId = '';
  render();
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
  const button = event.target.closest('[data-questionnaire-action]');
  const filterButton = event.target.closest('[data-filter]');
  if (filterButton) {
    historyFilter = filterButton.dataset.filter;
    selectedHistoryIds.clear();
    renderHistory();
    return;
  }
  if (!button) return;
  const action = button.dataset.questionnaireAction;
  const id = button.dataset.id;
  const presets = readPromptQuestionnaires();

  if (action === 'new-preset') {
    editingId = '';
    renderEditor();
  }
  if (action === 'edit-preset') {
    editingId = id;
    renderEditor();
    elements.editorQuestion.focus();
  }
  if (action === 'cancel-editor') {
    editingId = '';
    renderEditor();
  }
  if (action === 'toggle-preset') {
    const preset = presets.find((item) => item.id === id);
    if (preset) {
      preset.enabled = !preset.enabled;
      writePromptQuestionnaires(presets);
      renderPresets();
    }
  }
  if (action === 'delete-preset') {
    if (!window.confirm('删除这份预设问卷？')) return;
    writePromptQuestionnaires(presets.filter((item) => item.id !== id));
    if (editingId === id) editingId = '';
    render();
  }
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
  elements.editorForm.addEventListener('submit', (event) => {
    event.preventDefault();
    savePreset();
  });
  elements.editorType.addEventListener('change', () => {
    elements.editorOptionsField.hidden = elements.editorType.value === 'qa';
  });
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
        <p class="questionnaire-intro">管理星回随机发题，并查看两个方向的问答记录。</p>
      </header>

      <section class="questionnaire-card" aria-labelledby="presetTitle">
        <div class="questionnaire-section-heading">
          <div>
            <p class="questionnaire-kicker">预设问卷</p>
            <h3 id="presetTitle">星回可以问我的</h3>
          </div>
          <button class="questionnaire-button questionnaire-button--primary" type="button" data-questionnaire-action="new-preset">新增预设</button>
        </div>
        <form class="preset-editor" id="questionnairePresetEditor">
          <div class="questionnaire-section-heading questionnaire-section-heading--compact">
            <strong id="questionnaireEditorTitle">新增预设问卷</strong>
            <button class="questionnaire-text-button" type="button" data-questionnaire-action="cancel-editor" id="questionnaireEditorCancel" hidden>取消</button>
          </div>
          <label class="questionnaire-field">
            <span>问题</span>
            <input id="questionnaireEditorQuestion" type="text" maxlength="500" placeholder="输入想让我问你的问题" />
          </label>
          <label class="questionnaire-field" id="questionnaireEditorOptionsField">
            <span>选项（每行一个）</span>
            <textarea id="questionnaireEditorOptions" rows="4" placeholder="选项 A&#10;选项 B&#10;选项 C"></textarea>
          </label>
          <div class="preset-editor__footer">
            <label class="questionnaire-field">
              <span>类型</span>
              <select id="questionnaireEditorType">
                <option value="qa">问答问卷</option>
                <option value="single">单选题</option>
                <option value="multiple">多选题</option>
              </select>
            </label>
            <button class="questionnaire-button questionnaire-button--primary" type="submit">保存预设</button>
          </div>
        </form>
        <div class="preset-list" id="questionnairePresetList"></div>
      </section>

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
    presetList: viewRoot.querySelector('#questionnairePresetList'),
    editorForm: viewRoot.querySelector('#questionnairePresetEditor'),
    editorTitle: viewRoot.querySelector('#questionnaireEditorTitle'),
    editorQuestion: viewRoot.querySelector('#questionnaireEditorQuestion'),
    editorOptions: viewRoot.querySelector('#questionnaireEditorOptions'),
    editorOptionsField: viewRoot.querySelector('#questionnaireEditorOptionsField'),
    editorType: viewRoot.querySelector('#questionnaireEditorType'),
    editorCancel: viewRoot.querySelector('#questionnaireEditorCancel'),
    historyCount: viewRoot.querySelector('#questionnaireHistoryCount'),
    historyList: viewRoot.querySelector('#questionnaireHistoryList'),
    historyFilterButtons: Array.from(viewRoot.querySelectorAll('[data-filter]')),
  };

  bindEvents();
  render();
  return true;
}

export function onQuestionnaireViewEnter() {
  selectedHistoryIds.clear();
  render();
}
