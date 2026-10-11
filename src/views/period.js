import '../styles/period.css';
import { readPeriodRecords, writePeriodRecords } from '../lib/storage.js';

const DAY_MS = 24 * 60 * 60 * 1000;
let viewRoot = null;
let elements = null;
let editingId = '';
let eventsBound = false;
let calendarMonth = null;

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

function daysBetween(a, b) {
  return Math.round((dateOnly(b) - dateOnly(a)) / DAY_MS);
}

function sortedRecords() {
  return readPeriodRecords().slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function computeCycleStats(records) {
  const sorted = records.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
  const cycleLengths = [];
  const periodLengths = [];

  for (let i = 1; i < sorted.length; i += 1) {
    const diff = daysBetween(sorted[i - 1].startDate, sorted[i].startDate);
    if (diff > 0 && diff < 90) cycleLengths.push(diff);
  }

  sorted.forEach((record) => {
    if (record.endDate) {
      const len = daysBetween(record.startDate, record.endDate) + 1;
      if (len > 0 && len < 20) periodLengths.push(len);
    }
  });

  const avg = (arr) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10 : 0;
  const std = (arr) => {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    return Math.round(Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length) * 10) / 10;
  };

  const avgCycle = avg(cycleLengths);
  const avgPeriod = avg(periodLengths);
  const cycleStd = std(cycleLengths);

  let regularity;
  if (sorted.length < 2) regularity = 'insufficient';
  else if (cycleStd <= 2) regularity = 'regular';
  else if (cycleStd <= 4) regularity = 'mostly-regular';
  else regularity = 'irregular';

  return {
    avgCycle,
    avgPeriod,
    cycleStd,
    regularity,
    cycleCount: cycleLengths.length,
    periodCount: periodLengths.length,
    recordCount: sorted.length,
  };
}

const REGULARITY_LABELS = {
  regular: '规律',
  'mostly-regular': '较规律',
  irregular: '波动较大',
  insufficient: '数据较少',
};

function computeCurrentStatus(records, stats) {
  if (!records.length) return { label: '暂无记录', class: 'none' };

  const sorted = records.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const latest = sorted[0];
  const today = dateOnly(todayString());
  const latestStart = dateOnly(latest.startDate);
  const latestEnd = latest.endDate ? dateOnly(latest.endDate) : null;

  const daysSinceLatest = Math.round((today - latestStart) / DAY_MS);

  if (latestEnd && today >= latestStart && today <= latestEnd) {
    return { label: '经期中', class: 'active', detail: `第 ${daysSinceLatest + 1} 天` };
  }

  if (!latestEnd && daysSinceLatest >= 0 && daysSinceLatest <= 7) {
    return { label: '经期中', class: 'active', detail: `第 ${daysSinceLatest + 1} 天` };
  }

  const cycleLength = stats.avgCycle || 28;
  const nextDate = new Date(latestStart);
  nextDate.setDate(nextDate.getDate() + cycleLength);
  const daysToNext = Math.round((nextDate - today) / DAY_MS);

  if (daysToNext < 0) {
    return { label: '可能推迟', class: 'late', detail: `已推迟 ${Math.abs(daysToNext)} 天` };
  }
  if (daysToNext <= 5) {
    return { label: '临近经期', class: 'upcoming', detail: `还有 ${daysToNext} 天` };
  }
  return { label: '周期平稳', class: 'stable', detail: `距下次约 ${daysToNext} 天` };
}

function computeNextPrediction(records, stats) {
  if (!records.length) return { date: '', text: '添加一次开始日期后显示预测' };
  const sorted = records.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const latest = sorted[0];
  const cycleLength = stats.avgCycle || 28;
  const next = dateOnly(latest.startDate);
  next.setDate(next.getDate() + cycleLength);
  const today = dateOnly(todayString());
  const days = Math.round((next - today) / DAY_MS);
  let text;
  if (days > 0) text = `还有 ${days} 天`;
  else if (days === 0) text = '预计就在今天';
  else text = `已超过 ${Math.abs(days)} 天`;
  return { date: `${next.getFullYear()}年${next.getMonth() + 1}月${next.getDate()}日`, text };
}

function renderPrediction() {
  const records = readPeriodRecords();
  const stats = computeCycleStats(records);
  const prediction = computeNextPrediction(records, stats);
  elements.predictionDate.textContent = prediction.date || '--';
  elements.predictionText.textContent = prediction.text;

  const status = computeCurrentStatus(records, stats);
  elements.statusBadge.textContent = status.label;
  elements.statusBadge.className = `period-status__badge is-${status.class}`;
  elements.statusDetail.textContent = status.detail || '';

  elements.statCycle.textContent = stats.avgCycle ? `${stats.avgCycle} 天` : '--';
  elements.statPeriodLength.textContent = stats.avgPeriod ? `${stats.avgPeriod} 天` : '--';
  elements.statRegularity.textContent = REGULARITY_LABELS[stats.regularity];
  elements.statRegularity.className = `period-stat__value is-${stats.regularity}`;
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
        <p>点击"标记今天开始"或填写下方表单开始记录。</p>
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

function markTodayStart() {
  const records = readPeriodRecords();
  const today = todayString();
  const existing = records.find((r) => r.startDate === today);
  if (existing) {
    elements.formError.textContent = '今天的经期记录已存在。';
    elements.formError.hidden = false;
    return;
  }
  const data = {
    id: createId(),
    startDate: today,
    endDate: '',
    symptoms: '',
    mood: '',
    updatedAt: Date.now(),
  };
  records.push(data);
  writePeriodRecords(records);
  render();
  elements.formError.hidden = true;
}

function getPeriodDateSet(records) {
  const set = new Set();
  records.forEach((record) => {
    if (!record.endDate) {
      set.add(record.startDate);
      return;
    }
    const start = dateOnly(record.startDate);
    const end = dateOnly(record.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      set.add(key);
    }
  });
  return set;
}

function getPredictionDateSet(records, stats) {
  const set = new Set();
  if (!records.length) return set;
  const sorted = records.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const latest = sorted[0];
  const cycleLength = stats.avgCycle || 28;
  const start = dateOnly(latest.startDate);
  const predicted = new Date(start);
  predicted.setDate(predicted.getDate() + cycleLength);
  for (let i = 0; i < 5; i += 1) {
    const key = `${predicted.getFullYear()}-${String(predicted.getMonth() + 1).padStart(2, '0')}-${String(predicted.getDate()).padStart(2, '0')}`;
    set.add(key);
    predicted.setDate(predicted.getDate() + 1);
  }
  return set;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function renderCalendar() {
  if (!elements.calendarGrid) return;
  const records = readPeriodRecords();
  const stats = computeCycleStats(records);
  const periodDates = getPeriodDateSet(records);
  const predictedDates = getPredictionDateSet(records, stats);
  const today = todayString();

  const ref = calendarMonth || new Date();
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  elements.calendarMonthLabel.textContent = `${year}年${month + 1}月`;

  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push('<td class="period-cal__cell is-empty"></td>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const classes = ['period-cal__cell'];
    if (dateStr === today) classes.push('is-today');
    if (periodDates.has(dateStr)) classes.push('is-period');
 else if (predictedDates.has(dateStr)) classes.push('is-predicted');
    cells.push(`<td class="${classes.join(' ')}">${day}</td>`);
  }

  const totalCells = cells.length;
  const remainder = totalCells % 7;
  if (remainder > 0) {
    for (let i = 0; i < 7 - remainder; i += 1) cells.push('<td class="period-cal__cell is-empty"></td>');
  }

  let html = '';
  for (let i = 0; i < cells.length; i += 7) {
    html += `<tr>${cells.slice(i, i + 7).join('')}</tr>`;
  }

  elements.calendarGrid.innerHTML = html;
}

function shiftCalendarMonth(delta) {
  const ref = calendarMonth || new Date();
  calendarMonth = new Date(ref.getFullYear(), ref.getMonth() + delta, 1);
  renderCalendar();
}

function render() {
  renderForm();
  renderRecords();
  renderCalendar();
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
  if (action === 'today-start') {
    markTodayStart();
  }
  if (action === 'cal-prev') {
    shiftCalendarMonth(-1);
  }
  if (action === 'cal-next') {
    shiftCalendarMonth(1);
  }
  if (action === 'cal-today') {
    calendarMonth = new Date();
    renderCalendar();
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
  calendarMonth = new Date();
  viewRoot.innerHTML = `
    <div class="period-page">
      <header class="period-header">
        <p class="period-eyebrow">CYCLE NOTES</p>
        <h2 class="period-title">经期记录</h2>
        <p class="period-intro">记录开始、结束、症状和情绪，自动计算平均周期、经期天数和规律性，预测下一次经期。</p>
      </header>

      <section class="period-status" aria-label="当前状态">
        <div class="period-status__badge-wrap">
          <span class="period-status__badge is-none" id="periodStatusBadge">暂无记录</span>
          <span class="period-status__detail" id="periodStatusDetail"></span>
        </div>
        <button class="period-today-btn" type="button" data-period-action="today-start">标记今天开始</button>
      </section>

      <section class="period-prediction" aria-label="下一次经期预测">
        <span class="period-prediction__label">下一次预计</span>
        <strong id="periodPredictionDate">--</strong>
        <span id="periodPredictionText">添加一次开始日期后显示预测</span>
      </section>

      <section class="period-stats" aria-label="周期统计">
        <div class="period-stat">
          <span class="period-stat__label">平均周期</span>
          <strong class="period-stat__value" id="periodStatCycle">--</strong>
        </div>
        <div class="period-stat">
          <span class="period-stat__label">平均经期</span>
          <strong class="period-stat__value" id="periodStatPeriodLength">--</strong>
        </div>
        <div class="period-stat">
          <span class="period-stat__label">规律性</span>
          <strong class="period-stat__value" id="periodStatRegularity">--</strong>
        </div>
      </section>

      <section class="period-card period-calendar-card" aria-labelledby="periodCalendarTitle">
        <div class="period-section-heading">
          <div>
            <p class="period-kicker">日历</p>
            <h3 id="periodCalendarTitle">经期日历</h3>
          </div>
          <div class="period-cal-nav">
            <button type="button" data-period-action="cal-prev" aria-label="上个月">&lt;</button>
            <span id="periodCalMonthLabel">--</span>
            <button type="button" data-period-action="cal-next" aria-label="下个月">&gt;</button>
          </div>
        </div>
        <div class="period-cal-legend">
          <span><i class="period-cal-dot is-period"></i>经期</span>
          <span><i class="period-cal-dot is-predicted"></i>预测</span>
          <span><i class="period-cal-dot is-today"></i>今天</span>
        </div>
        <table class="period-cal">
          <thead>
            <tr>${WEEKDAYS.map((w) => `<th>${w}</th>`).join('')}</tr>
          </thead>
          <tbody id="periodCalGrid"></tbody>
        </table>
        <button class="period-cal-today-btn" type="button" data-period-action="cal-today">回到本月</button>
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
    statusBadge: viewRoot.querySelector('#periodStatusBadge'),
    statusDetail: viewRoot.querySelector('#periodStatusDetail'),
    statCycle: viewRoot.querySelector('#periodStatCycle'),
    statPeriodLength: viewRoot.querySelector('#periodStatPeriodLength'),
    statRegularity: viewRoot.querySelector('#periodStatRegularity'),
    calendarGrid: viewRoot.querySelector('#periodCalGrid'),
    calendarMonthLabel: viewRoot.querySelector('#periodCalMonthLabel'),
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
