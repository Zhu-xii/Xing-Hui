import '../styles/period.css';
import { readPeriodRecords, writePeriodRecords } from '../lib/storage.js';

const DAY_MS = 24 * 60 * 60 * 1000;
let viewRoot = null;
let elements = null;
let editingId = '';
let eventsBound = false;

function createId() {
  return `period_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function dateOnly(value) {
  return new Date(`${value}T00:00:00`);
}

function formatDate(value) {
  if (!value) return '未记录';
  const date = dateOnly(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function predictionText(records) {
  if (!records.length) return { date: '', text: '添加一次开始日期后显示预测' };
  const latest = records.slice().sort((first, second) => second.startDate.localeCompare(first.startDate))[0];
  const next = dateOnly(latest.startDate);
  next.setDate(next.getDate() + 30);
  const today = dateOnly(todayString());
  const days = Math.round((next - today) / DAY_MS);
  const text = days > 0 ? `还有 ${days} 天` : days === 0 ? '预计就在今天' : `已超过 ${Math.abs(days)} 天`;
  return { date: `${next.getFullYear()}年${next.getMonth() + 1}月${next.getDate()}日`, text };
}

function renderPrediction() {
  const prediction = predictionText(readPeriodRecords());
  elements.predictionDate.textContent = prediction.date || '--';
  elements.predictionText.textContent = prediction.text;
}

function renderRecords() {
  const records = readPeriodRecords();
  elements.recordCount.textContent = `${records.length} 条`;
  elements.recordList.innerHTML = records.length
    ? records.map((record) => `
        <article class="period-record">
          <div class="period-record__copy">
            <div class="period-record__dates">
              <strong>${escapeHtml(formatDate(record.startDate))}</strong>
              <span>至 ${escapeHtml(formatDate(record.endDate))}</span>
            </div>
            <p><small>症状</small>${escapeHtml(record.symptoms || '未记录')}</p>
            <p><small>情绪</small>${escapeHtml(record.mood || '未记录')}</p>
          </div>
          <div class="period-record__actions">
            <button type="button" data-period-action="edit" data-id="${escapeHtml(record.id)}">编辑</button>
            <button class="is-danger" type="button" data-period-action="delete" data-id="${escapeHtml(record.id)}">删除</button>
          </div>
        </article>
      `).join('')
    : `
      <div class="period-empty">
        <strong>还没有经期记录</strong>
        <p>从上方填写开始和结束日期开始记录。</p>
      </div>
    `;
  renderPrediction();
}

function renderForm() {
  const records = readPeriodRecords();
  const record = editingId ? records.find((item) => item.id === editingId) : null;
  elements.startDate.value = record?.startDate || '';
  elements.endDate.value = record?.endDate || '';
  elements.symptoms.value = record?.symptoms || '';
  elements.mood.value = record?.mood || '';
  elements.formTitle.textContent = record ? '编辑经期记录' : '新增经期记录';
  elements.cancelEdit.hidden = !record;
  elements.submit.textContent = record ? '保存修改' : '添加记录';
}

function render() {
  renderForm();
  renderRecords();
}

function saveRecord() {
  const startDate = elements.startDate.value;
  const endDate = elements.endDate.value;
  if (!startDate) {
    elements.formError.textContent = '请选择开始日期。';
    elements.formError.hidden = false;
    return;
  }
  if (endDate && endDate < startDate) {
    elements.formError.textContent = '结束日期不能早于开始日期。';
    elements.formError.hidden = false;
    return;
  }
  elements.formError.hidden = true;

  const records = readPeriodRecords();
  const data = {
    id: editingId || createId(),
    startDate,
    endDate,
    symptoms: elements.symptoms.value.trim(),
    mood: elements.mood.value.trim(),
    updatedAt: Date.now(),
  };
  const index = records.findIndex((record) => record.id === editingId);
  if (index >= 0) records[index] = data;
  else records.push(data);
  writePeriodRecords(records);
  editingId = '';
  render();
}

function handleClick(event) {
  const button = event.target.closest('[data-period-action]');
  if (!button) return;
  const action = button.dataset.periodAction;
  if (action === 'edit') {
    editingId = button.dataset.id;
    render();
    elements.startDate.focus();
  }
  if (action === 'delete') {
    if (!window.confirm('删除这条经期记录？')) return;
    writePeriodRecords(readPeriodRecords().filter((record) => record.id !== button.dataset.id));
    if (editingId === button.dataset.id) editingId = '';
    render();
  }
}

function bindEvents() {
  if (eventsBound) return;
  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveRecord();
  });
  elements.cancelEdit.addEventListener('click', () => {
    editingId = '';
    render();
  });
  viewRoot.addEventListener('click', handleClick);
  eventsBound = true;
}

export function initPeriodView(root = document.getElementById('view-period')) {
  if (!root) return false;
  viewRoot = root;
  viewRoot.innerHTML = `
    <div class="period-page">
      <header class="period-header">
        <p class="period-eyebrow">CYCLE NOTES</p>
        <h2 class="period-title">经期记录</h2>
        <p class="period-intro">记录开始、结束、症状和情绪，按 30 天周期预测下一次。</p>
      </header>

      <section class="period-prediction" aria-label="下一次经期预测">
        <span class="period-prediction__label">下一次预计</span>
        <strong id="periodPredictionDate">--</strong>
        <span id="periodPredictionText">添加一次开始日期后显示预测</span>
      </section>

      <section class="period-card" aria-labelledby="periodFormTitle">
        <div class="period-section-heading">
          <div>
            <p class="period-kicker">记录</p>
            <h3 id="periodFormTitle">新增经期记录</h3>
          </div>
          <button class="period-text-button" id="periodCancelEdit" type="button" hidden>取消编辑</button>
        </div>
        <form class="period-form" id="periodForm">
          <div class="period-form__row">
            <label class="period-field">
              <span>开始日期</span>
              <input id="periodStartDate" type="date" required />
            </label>
            <label class="period-field">
              <span>结束日期</span>
              <input id="periodEndDate" type="date" />
            </label>
          </div>
          <label class="period-field">
            <span>症状</span>
            <input id="periodSymptoms" type="text" maxlength="500" placeholder="例如：腹痛、疲惫、腰酸" />
          </label>
          <label class="period-field">
            <span>情绪</span>
            <input id="periodMood" type="text" maxlength="200" placeholder="例如：平静、烦躁、想休息" />
          </label>
          <p class="period-form__error" id="periodFormError" hidden></p>
          <button class="period-submit" id="periodSubmit" type="submit">添加记录</button>
        </form>
      </section>

      <section class="period-card" aria-labelledby="periodHistoryTitle">
        <div class="period-section-heading">
          <div>
            <p class="period-kicker">历史</p>
            <h3 id="periodHistoryTitle">历史记录 <small id="periodRecordCount">0 条</small></h3>
          </div>
        </div>
        <div class="period-list" id="periodRecordList"></div>
      </section>
    </div>
  `;

  elements = {
    predictionDate: viewRoot.querySelector('#periodPredictionDate'),
    predictionText: viewRoot.querySelector('#periodPredictionText'),
    form: viewRoot.querySelector('#periodForm'),
    formTitle: viewRoot.querySelector('#periodFormTitle'),
    startDate: viewRoot.querySelector('#periodStartDate'),
    endDate: viewRoot.querySelector('#periodEndDate'),
    symptoms: viewRoot.querySelector('#periodSymptoms'),
    mood: viewRoot.querySelector('#periodMood'),
    formError: viewRoot.querySelector('#periodFormError'),
    submit: viewRoot.querySelector('#periodSubmit'),
    cancelEdit: viewRoot.querySelector('#periodCancelEdit'),
    recordCount: viewRoot.querySelector('#periodRecordCount'),
    recordList: viewRoot.querySelector('#periodRecordList'),
  };

  bindEvents();
  render();
  return true;
}

export function onPeriodViewEnter() {
  render();
}
