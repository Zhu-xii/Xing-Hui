import '../styles/backup.css';
import {
  DATA_RESTORED_EVENT,
  DEFAULT_CHARACTER,
  MOOD_CACHE_KEY,
  QUESTIONNAIRE_DRAFT_KEY,
  createBackupPayload,
  getBackupReminder,
  getStorageSnapshot,
  markBackupExported,
  normalizeBackupPayload,
  normalizeChatMessage,
  normalizeSettings,
  readCards,
  readJson,
  readCharacter,
  readChatMessages,
  readGroups,
  readPatCards,
  readPeriodRecords,
  readPromptQuestionnaires,
  readQuestionnaireAnswers,
  readSettings,
  readStatuses,
  readStickers,
  writeCards,
  writeCharacter,
  writeChatMessages,
  writeGroups,
  writePatCards,
  writePeriodRecords,
  writePromptQuestionnaires,
  writeQuestionnaireAnswers,
  writeSettings,
  writeJson,
  writeStatuses,
  writeStickers,
} from '../lib/storage.js';
import { collectMediaAssets, getAvatarBlob, migrateLegacyMedia, restoreMediaAssets, setBlobImage } from '../lib/media-db.js';

let viewRoot = null;
let elements = null;
let toastTimer = null;
let eventsBound = false;

function formatDate(timestamp) {
  if (!timestamp) return '尚无记录';
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return '尚无记录';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function localDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function showToast(message, tone = 'default') {
  if (!elements?.toast) return;
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.dataset.tone = tone;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    if (elements?.toast) elements.toast.hidden = true;
  }, 2800);
}

function messageSignature(message) {
  return [message.role, message.type, message.timestamp, message.content].join('\u0000');
}

function mergeMessages(existingMessages, incomingMessages) {
  const merged = [];
  const byId = new Map();
  const bySignature = new Map();

  [...existingMessages, ...incomingMessages].forEach((message) => {
    const normalized = normalizeChatMessage(message);
    if (!normalized) return;

    const existingById = byId.get(normalized.id);
    if (existingById) {
      existingById.favorited ||= normalized.favorited;
      existingById.starFavorited ||= normalized.starFavorited;
      existingById.read ||= normalized.read;
      existingById.withdrawn ||= normalized.withdrawn;
      return;
    }

    const signature = messageSignature(normalized);
    const existingBySignature = bySignature.get(signature);
    if (existingBySignature) {
      existingBySignature.favorited ||= normalized.favorited;
      existingBySignature.starFavorited ||= normalized.starFavorited;
      existingBySignature.read ||= normalized.read;
      existingBySignature.withdrawn ||= normalized.withdrawn;
      return;
    }

    merged.push(normalized);
    byId.set(normalized.id, normalized);
    bySignature.set(signature, normalized);
  });

  return merged;
}

function mergeByKey(existingItems, incomingItems, getKey) {
  const merged = [];
  const keys = new Set();

  [...existingItems, ...incomingItems].forEach((item) => {
    const key = getKey(item);
    if (keys.has(key)) return;
    keys.add(key);
    merged.push(item);
  });

  return merged;
}

export function mergeBackupData(payload) {
  const normalized = normalizeBackupPayload(payload);
  const currentCards = readCards();
  const currentStickers = readStickers();
  const currentMessages = readChatMessages();
  const currentGroups = readGroups();
  const currentPatCards = readPatCards();
  const currentPromptQuestionnaires = readPromptQuestionnaires();
  const currentPeriodRecords = readPeriodRecords();
  const currentQuestionnaireAnswers = readQuestionnaireAnswers();
  const currentStatuses = readStatuses();
  const currentQuestionnaireDraft = readJson(QUESTIONNAIRE_DRAFT_KEY, null);
  const currentMoodCache = readJson(MOOD_CACHE_KEY, null);
  const favoriteMessages = [
    ...normalized.favorites.mine.map((message) => ({ ...message, favorited: true })),
    ...normalized.favorites.star.map((message) => ({ ...message, starFavorited: true })),
  ];
  const mergedMessages = mergeMessages(
    currentMessages,
    [...normalized.chatMessages, ...favoriteMessages],
  );
  const mergedCards = mergeByKey(currentCards, normalized.cards, (card) => card.content);
  const mergedStickers = mergeByKey(currentStickers, normalized.stickers, (sticker) => sticker.image);
  const mergedGroups = mergeByKey(
    currentGroups,
    normalized.groups,
    (group) => `${group.id}\u0000${group.name}`,
  );
  const mergedPatCards = mergeByKey(currentPatCards, normalized.patCards, (card) => card.content);
  const mergedPromptQuestionnaires = mergeByKey(
    currentPromptQuestionnaires,
    normalized.promptQuestionnaires,
    (item) => `${item.type}\u0000${item.question}`,
  );
  const mergedPeriodRecords = mergeByKey(currentPeriodRecords, normalized.periodRecords, (item) => item.id);
  const mergedQuestionnaireAnswers = mergeByKey(
    currentQuestionnaireAnswers,
    normalized.questionnaireAnswers,
    (entry) => entry.content,
  );
  const mergedStatuses = mergeByKey(currentStatuses, normalized.statuses, (entry) => entry.content);

  writeCards(mergedCards);
  writeStickers(mergedStickers);
  writeChatMessages(mergedMessages);
  writeGroups(mergedGroups);
  writePatCards(mergedPatCards);
  writePromptQuestionnaires(mergedPromptQuestionnaires);
  writePeriodRecords(mergedPeriodRecords);
  writeQuestionnaireAnswers(mergedQuestionnaireAnswers);
  writeStatuses(mergedStatuses);
  if (!currentQuestionnaireDraft && normalized.questionnaireDraft) {
    writeJson(QUESTIONNAIRE_DRAFT_KEY, normalized.questionnaireDraft);
  }
  if (!currentMoodCache && normalized.moodCache) {
    writeJson(MOOD_CACHE_KEY, normalized.moodCache);
  }

  if (normalized.settings) {
    const currentSettings = readSettings();
    // 当前值优先；空头像等缺失字段由备份补充。
    const mergedSettings = { ...normalized.settings, ...currentSettings };
    mergedSettings.userAvatar = currentSettings.userAvatar || normalized.settings.userAvatar || '';
    writeSettings(normalizeSettings(mergedSettings));
  }

  if (normalized.character) {
    const currentCharacter = readCharacter();
    writeCharacter({
      name: currentCharacter.name !== DEFAULT_CHARACTER.name
        ? currentCharacter.name
        : normalized.character.name,
      avatar: currentCharacter.avatar || normalized.character.avatar,
    });
  }

  const result = {
    cardsAdded: mergedCards.length - currentCards.length,
    stickersAdded: mergedStickers.length - currentStickers.length,
    messagesAdded: mergedMessages.length - currentMessages.length,
    groupsAdded: mergedGroups.length - currentGroups.length,
    patCardsAdded: mergedPatCards.length - currentPatCards.length,
    promptQuestionnairesAdded: mergedPromptQuestionnaires.length - currentPromptQuestionnaires.length,
    periodRecordsAdded: mergedPeriodRecords.length - currentPeriodRecords.length,
    questionnaireAnswersAdded: mergedQuestionnaireAnswers.length - currentQuestionnaireAnswers.length,
    statusesAdded: mergedStatuses.length - currentStatuses.length,
    duplicateCardsRemoved: normalized.cards.length - Math.max(0, mergedCards.length - currentCards.length),
  };

  window.dispatchEvent(new CustomEvent(DATA_RESTORED_EVENT, { detail: result }));
  window.dispatchEvent(new CustomEvent('xinghui:manage-data-changed', { detail: result }));
  return result;
}

async function renderAvatar() {
  const { avatar } = readCharacter();
  const preview = elements?.avatarPreview;
  if (!preview) return;
  preview.replaceChildren();

  if (!avatar) {
    preview.textContent = '星';
    return;
  }

  const image = document.createElement('img');
  image.alt = '当前星回头像';
  preview.append(image);
  if (avatar === 'idb:star') {
    try {
      const blob = await getAvatarBlob('star');
      if (!blob) throw new Error('avatar-missing');
      setBlobImage(image, blob);
    } catch {
      image.remove();
      preview.textContent = '星';
    }
    return;
  }
  image.src = avatar;
}
function renderStats() {
  if (!elements) return;
  const snapshot = getStorageSnapshot();
  elements.cardCount.textContent = String(snapshot.cards.length);
  elements.stickerCount.textContent = String(snapshot.stickers.length);
  elements.messageCount.textContent = String(snapshot.chatMessages.length);
  elements.favoriteCount.textContent = String(snapshot.favorites.mine.length + snapshot.favorites.star.length);
  elements.promptCount.textContent = String(snapshot.promptQuestionnaires.length);
  elements.periodCount.textContent = String(snapshot.periodRecords.length);
}
function renderReminder() {
  if (!elements) return;
  const reminder = getBackupReminder();
  const lastBackupText = reminder.lastBackupAt ? formatDate(reminder.lastBackupAt) : '从未导出';
  const baselineText = reminder.lastBackupAt
    ? `备份周期从最近一次导出（${lastBackupText}）开始计算。`
    : `从未导出，备份周期从首次启动日期（${formatDate(reminder.firstLaunchAt)}）开始计算。`;

  elements.reminderTitle.textContent = reminder.isDue ? '已超过 7 天，建议立即备份' : '备份状态正常';
  elements.reminderText.textContent = reminder.isDue
    ? `${baselineText} 当前已间隔约 ${reminder.elapsedDays} 天。`
    : `${baselineText} 距离下次提醒阈值还有 ${Math.max(0, 7 - reminder.elapsedDays)} 天左右。`;
  elements.reminderLastExport.textContent = lastBackupText;
  elements.reminder.classList.toggle('is-due', reminder.isDue);
}

function renderBackupPage() {
  renderAvatar();
  renderStats();
  renderReminder();
}

async function createPayloadWithMedia() {
  const payload = createBackupPayload();
  try {
    payload.mediaAssets = await collectMediaAssets();
  } catch {
    payload.mediaAssets = [];
  }
  return payload;
}

async function downloadBackup() {
  const payload = await createPayloadWithMedia();
  const serialized = JSON.stringify(payload, null, 2);
  const blob = new Blob([serialized], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `xinghui-backup-${localDateStamp()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);

  markBackupExported(Date.now());
  renderBackupPage();
  elements.importStatus.hidden = true;
  showToast('全部数据已导出，备份提醒已重置。');
}

function setImportStatus(message, tone = 'default') {
  if (!elements?.importStatus) return;
  elements.importStatus.textContent = message;
  elements.importStatus.dataset.tone = tone;
  elements.importStatus.hidden = false;
}

function handleImportFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
    setImportStatus('请选择 JSON 备份文件。', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.addEventListener('load', async () => {
    try {
      const raw = String(reader.result || '');
      const normalized = normalizeBackupPayload(raw);
      const result = mergeBackupData(normalized);
      await restoreMediaAssets(normalized.mediaAssets);
      const migrated = await migrateLegacyMedia({
        stickers: normalized.stickers,
        character: normalized.character,
        settings: normalized.settings,
      });
      writeStickers(migrated.stickers);
      if (migrated.avatar) writeCharacter({ ...readCharacter(), avatar: migrated.avatar });
      if (migrated.userAvatar) writeSettings({ ...readSettings(), userAvatar: migrated.userAvatar });
      renderBackupPage();
      const added = result.cardsAdded + result.stickersAdded + result.messagesAdded + result.groupsAdded + result.patCardsAdded + result.promptQuestionnairesAdded + result.periodRecordsAdded + result.questionnaireAnswersAdded + result.statusesAdded;
      setImportStatus(
        `导入完成：新增 ${added} 项；字卡已按内容完全一致合并，现有数据未被覆盖。`,
        'success',
      );
      showToast('JSON 已合并导入。');
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : '导入失败，请检查文件内容。', 'warning');
    } finally {
      if (elements?.fileInput) elements.fileInput.value = '';
    }
  });
  reader.addEventListener('error', () => {
    setImportStatus('文件读取失败，请重试。', 'warning');
    if (elements?.fileInput) elements.fileInput.value = '';
  });
  reader.readAsText(file, 'utf-8');
}

function bindEvents() {
  if (!viewRoot || eventsBound) return;

  viewRoot.addEventListener('click', (event) => {
    const action = event.target.closest('[data-backup-action]')?.dataset.backupAction;
    if (action === 'export') void downloadBackup();
    if (action === 'choose-import') elements.fileInput?.click();
  });

  elements.fileInput.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    handleImportFile(file);
  });

  eventsBound = true;
}

export function initBackupView(root = document.getElementById('view-backup')) {
  if (!root) return false;

  viewRoot = root;
  viewRoot.innerHTML = `
    <div class="backup-page">
      <header class="backup-header">
        <p class="backup-eyebrow">LOCAL BACKUP</p>
        <h2 class="backup-title">数据备份</h2>
        <p class="backup-intro">将字卡、表情包、聊天记录、收藏和设置打包为一个 JSON 文件，文件只会在本机生成。</p>
      </header>

      <section class="backup-card backup-card--export" aria-labelledby="backupExportTitle">
        <div class="backup-card__heading">
          <div>
            <p class="backup-kicker">导出全部</p>
            <h3 id="backupExportTitle">本机数据快照</h3>
          </div>
          <span class="backup-avatar" id="backupAvatarPreview" aria-hidden="true">星</span>
        </div>
        <div class="backup-stats" aria-label="备份数据统计">
          <span><strong id="backupCardCount">0</strong><small>字卡</small></span>
          <span><strong id="backupStickerCount">0</strong><small>表情包</small></span>
          <span><strong id="backupMessageCount">0</strong><small>聊天</small></span>
          <span><strong id="backupFavoriteCount">0</strong><small>收藏</small></span>
          <span><strong id="backupPromptCount">0</strong><small>预设问卷</small></span>
          <span><strong id="backupPeriodCount">0</strong><small>经期记录</small></span>
        </div>
        <button class="backup-button backup-button--primary" type="button" data-backup-action="export">导出全部 JSON</button>
        <p class="backup-hint">成功导出后，“超过 7 天”提醒会从本次导出时间重新计算。</p>
      </section>

      <section class="backup-card" aria-labelledby="backupImportTitle">
        <div class="backup-card__heading">
          <div>
            <p class="backup-kicker">导入 JSON</p>
            <h3 id="backupImportTitle">与本机数据合并</h3>
          </div>
        </div>
        <p class="backup-description">导入不会清空现有数据；字卡按内容完全一致去重并保留一条，重复聊天记录也不会重复追加。</p>
        <button class="backup-dropzone" type="button" data-backup-action="choose-import">
          <span class="backup-dropzone__icon" aria-hidden="true">↥</span>
          <strong>选择 JSON 备份文件</strong>
          <small>点击选择，导入后立即合并</small>
        </button>
        <input class="backup-file-input" id="backupFileInput" type="file" accept=".json,application/json" />
        <p class="backup-import-status" id="backupImportStatus" role="status" hidden></p>
      </section>

      <section class="backup-card backup-reminder" id="backupReminder" aria-labelledby="backupReminderTitle">
        <div class="backup-reminder__icon" aria-hidden="true">◷</div>
        <div>
          <p class="backup-kicker">自动备份提醒</p>
          <h3 id="backupReminderTitle">备份状态正常</h3>
          <p id="backupReminderText">正在计算备份周期…</p>
          <small>上次导出：<span id="backupLastExport">尚无记录</span></small>
        </div>
      </section>
    </div>
    <div class="backup-toast" id="backupToast" role="status" aria-live="polite" hidden></div>
  `;

  elements = {
    avatarPreview: viewRoot.querySelector('#backupAvatarPreview'),
    cardCount: viewRoot.querySelector('#backupCardCount'),
    stickerCount: viewRoot.querySelector('#backupStickerCount'),
    messageCount: viewRoot.querySelector('#backupMessageCount'),
    favoriteCount: viewRoot.querySelector('#backupFavoriteCount'),
    promptCount: viewRoot.querySelector('#backupPromptCount'),
    periodCount: viewRoot.querySelector('#backupPeriodCount'),
    fileInput: viewRoot.querySelector('#backupFileInput'),
    importStatus: viewRoot.querySelector('#backupImportStatus'),
    reminder: viewRoot.querySelector('#backupReminder'),
    reminderTitle: viewRoot.querySelector('#backupReminderTitle'),
    reminderText: viewRoot.querySelector('#backupReminderText'),
    reminderLastExport: viewRoot.querySelector('#backupLastExport'),
    toast: viewRoot.querySelector('#backupToast'),
  };

  bindEvents();
  renderBackupPage();
  return true;
}

export function onBackupViewEnter() {
  renderBackupPage();
  if (elements?.importStatus) elements.importStatus.hidden = true;
}
