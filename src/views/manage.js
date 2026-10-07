import '../styles/manage.css';
import { deleteStickerBlob, getStickerBlob, putStickerBlob, setBlobImage } from '../lib/media-db.js';
import {
  CARD_STORAGE_KEY as STORAGE_CARD_KEY,
  DEFAULT_GROUP_ID as STORAGE_DEFAULT_GROUP_ID,
  GREETING_GROUP_ID as STORAGE_GREETING_GROUP_ID,
  GROUP_STORAGE_KEY as STORAGE_GROUP_KEY,
  MANAGE_CATEGORIES,
  PAT_CARD_STORAGE_KEY as STORAGE_PAT_CARD_KEY,
  QUESTIONNAIRE_ANSWER_STORAGE_KEY as STORAGE_QUESTIONNAIRE_KEY,
  SETTINGS_KEY as STORAGE_SETTINGS_KEY,
  STATUS_STORAGE_KEY as STORAGE_STATUS_KEY,
  STICKER_STORAGE_KEY as STORAGE_STICKER_KEY,
  getManageCategory,
  readJson,
  writeJson,
} from '../lib/storage.js';

export const GROUP_STORAGE_KEY = STORAGE_GROUP_KEY;
export const CARD_STORAGE_KEY = STORAGE_CARD_KEY;
export const SETTINGS_KEY = STORAGE_SETTINGS_KEY;
export const PAT_CARD_STORAGE_KEY = STORAGE_PAT_CARD_KEY;
export const STICKER_STORAGE_KEY = STORAGE_STICKER_KEY;
export const QUESTIONNAIRE_ANSWER_STORAGE_KEY = STORAGE_QUESTIONNAIRE_KEY;
export const STATUS_STORAGE_KEY = STORAGE_STATUS_KEY;
export const DEFAULT_GROUP_ID = STORAGE_DEFAULT_GROUP_ID;
export const GREETING_GROUP_ID = STORAGE_GREETING_GROUP_ID;

const CARD_PAGE_SIZE = 120;

const BUILT_IN_GROUPS = [
  { id: DEFAULT_GROUP_ID, name: '默认分组' },
  { id: GREETING_GROUP_ID, name: '问候语字卡' },
];

let viewRoot = null;
let elements = null;
let eventsBound = false;
let toastTimer = null;
let modalConfirmHandler = null;

const state = {
  groups: [],
  cards: [],
  stickers: [],
  questionnaireAnswers: [],
  statuses: [],
  patCards: [],
  currentGroupId: DEFAULT_GROUP_ID,
  cardPage: 1,
  searchQuery: '',
  selectedCardIds: new Set(),
};

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readStoredArray(key) {
  const parsed = readJson(key, []);
  return Array.isArray(parsed) ? parsed : [];
}

function normalizeGroup(group) {
  if (!group || typeof group !== 'object') return null;

  const id = String(group.id || '').trim();
  const name = String(group.name || '').trim();
  if (!id || !name) return null;

  const category = MANAGE_CATEGORIES.find((item) => item.type === group.category)?.type || '';
  return category ? { id, name, category } : { id, name };
}

function normalizeCard(card, validGroupIds) {
  if (!card || typeof card !== 'object') return null;

  const content = typeof card.content === 'string' ? card.content : '';
  const requestedGroupId = String(card.groupId || '').trim();
  const groupId = validGroupIds.has(requestedGroupId) ? requestedGroupId : DEFAULT_GROUP_ID;

  return {
    id: String(card.id || createId('card')),
    groupId,
    content,
    disabled: Boolean(card.disabled),
  };
}

function normalizeSticker(sticker) {
  if (!sticker || typeof sticker !== 'object') return null;
  const image = String(sticker.image || sticker.content || sticker.src || '').trim();
  const storage = sticker.storage === 'indexeddb' || (!image && sticker.id) ? 'indexeddb' : 'legacy';
  if (!image && storage !== 'indexeddb') return null;
  return {
    id: String(sticker.id || createId('sticker')),
    ...(image ? { image } : {}),
    storage,
    mimeType: String(sticker.mimeType || ''),
    size: Math.max(0, Number(sticker.size) || 0),
    createdAt: Math.max(0, Number(sticker.createdAt) || Date.now()),
    enabled: sticker.enabled !== false,
  };
}

function normalizeTextEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const content = typeof entry.content === 'string' ? entry.content.trim() : '';
  if (!content) return null;
  return {
    id: String(entry.id || createId('entry')),
    content,
  };
}

function normalizePatCard(card) {
  if (!card || typeof card !== 'object') return null;

  const content = typeof card.content === 'string' ? card.content.trim() : '';
  if (!content) return null;

  return {
    id: String(card.id || createId('pat')),
    content,
  };
}

function groupSortRank(group) {
  const builtInIndex = BUILT_IN_GROUPS.findIndex((item) => item.id === group.id);
  if (builtInIndex !== -1) return builtInIndex;
  const category = getManageCategory(group);
  if (category) return 100 + MANAGE_CATEGORIES.findIndex((item) => item.type === category.type);
  return 1000;
}

function readManageData() {
  const groups = [];
  const groupIds = new Set();

  readStoredArray(GROUP_STORAGE_KEY).forEach((rawGroup) => {
    const group = normalizeGroup(rawGroup);
    if (!group || groupIds.has(group.id)) return;
    groupIds.add(group.id);
    groups.push(group);
  });

  BUILT_IN_GROUPS.forEach((builtIn) => {
    if (groupIds.has(builtIn.id)) return;
    groupIds.add(builtIn.id);
    groups.push({ ...builtIn });
  });

  // 内置分组置顶，三个特殊类别紧随其后，自建分组保持原有顺序。
  groups.sort((a, b) => groupSortRank(a) - groupSortRank(b));

  const cards = readStoredArray(CARD_STORAGE_KEY)
    .map((card) => normalizeCard(card, groupIds))
    .filter(Boolean);

  const stickers = readStoredArray(STICKER_STORAGE_KEY)
    .map(normalizeSticker)
    .filter(Boolean);

  const questionnaireAnswers = readStoredArray(QUESTIONNAIRE_ANSWER_STORAGE_KEY)
    .map(normalizeTextEntry)
    .filter(Boolean);

  const statuses = readStoredArray(STATUS_STORAGE_KEY)
    .map(normalizeTextEntry)
    .filter(Boolean);

  const patCards = readStoredArray(PAT_CARD_STORAGE_KEY)
    .map(normalizePatCard)
    .filter(Boolean);

  const parsed = readJson(SETTINGS_KEY, {});
  const settings = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};

  const requestedGroupId = String(settings.currentGroupId || '').trim();
  const currentGroupId = groupIds.has(requestedGroupId) ? requestedGroupId : DEFAULT_GROUP_ID;

  return { groups, cards, stickers, questionnaireAnswers, statuses, patCards, currentGroupId };
}

function writeStoredArray(key, value) {
  return writeJson(key, value);
}

function writeCurrentGroupId() {
  const parsed = readJson(SETTINGS_KEY, {});
  const settings = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};

  settings.currentGroupId = state.currentGroupId;
  return writeJson(SETTINGS_KEY, settings);
}

function saveData() {
  const saved = [
    writeStoredArray(GROUP_STORAGE_KEY, state.groups),
    writeStoredArray(CARD_STORAGE_KEY, state.cards),
    writeStoredArray(STICKER_STORAGE_KEY, state.stickers),
    writeStoredArray(QUESTIONNAIRE_ANSWER_STORAGE_KEY, state.questionnaireAnswers),
    writeStoredArray(STATUS_STORAGE_KEY, state.statuses),
    writeStoredArray(PAT_CARD_STORAGE_KEY, state.patCards),
    writeCurrentGroupId(),
  ].every(Boolean);

  window.dispatchEvent(
    new CustomEvent('xinghui:manage-data-changed', {
      detail: {
        groups: state.groups,
        cards: state.cards,
        stickers: state.stickers,
        questionnaireAnswers: state.questionnaireAnswers,
        statuses: state.statuses,
        patCards: state.patCards,
        currentGroupId: state.currentGroupId,
      },
    }),
  );
  return saved;
}

function syncState() {
  const data = readManageData();
  state.groups = data.groups;
  state.cards = data.cards;
  state.stickers = data.stickers;
  state.questionnaireAnswers = data.questionnaireAnswers;
  state.statuses = data.statuses;
  state.patCards = data.patCards;
  state.currentGroupId = data.currentGroupId;

  const visibleIds = new Set(currentItems().map((item) => item.id));
  state.selectedCardIds.forEach((id) => {
    if (!visibleIds.has(id)) state.selectedCardIds.delete(id);
  });

  writeStoredArray(GROUP_STORAGE_KEY, state.groups);
  writeStoredArray(CARD_STORAGE_KEY, state.cards);
  writeStoredArray(STICKER_STORAGE_KEY, state.stickers);
  writeStoredArray(QUESTIONNAIRE_ANSWER_STORAGE_KEY, state.questionnaireAnswers);
  writeStoredArray(STATUS_STORAGE_KEY, state.statuses);
  writeStoredArray(PAT_CARD_STORAGE_KEY, state.patCards);
  writeCurrentGroupId();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function groupById(groupId) {
  return state.groups.find((group) => group.id === groupId) || null;
}

function cardsInGroup(groupId) {
  return state.cards.filter((card) => card.groupId === groupId);
}

function categoryForGroup(groupOrId) {
  const group = typeof groupOrId === 'string' ? groupById(groupOrId) : groupOrId;
  return group ? getManageCategory(group) : null;
}

function categoryItems(categoryType) {
  if (categoryType === 'stickers') return state.stickers;
  if (categoryType === 'questionnaire') return state.questionnaireAnswers;
  if (categoryType === 'status') return state.statuses;
  return state.cards;
}

function currentCategory() {
  return categoryForGroup(state.currentGroupId);
}

function filteredCurrentItems() {
  const items = currentItems();
  const query = state.searchQuery.trim().toLocaleLowerCase();
  if (!query) return items;
  return items.filter((item) => {
    const content = String(item.content || '').toLocaleLowerCase();
    const question = String(item.question || '').toLocaleLowerCase();
    const metadata = `${item.mimeType || ''} ${item.size || ''}`.toLocaleLowerCase();
    return content.includes(query) || question.includes(query) || metadata.includes(query);
  });
}
function currentItems() {
  const category = currentCategory();
  return category ? categoryItems(category.type) : cardsInGroup(state.currentGroupId);
}

function itemCountForGroup(group) {
  const category = categoryForGroup(group);
  return category ? categoryItems(category.type).length : cardsInGroup(group.id).length;
}


function groupOptionsHtml(selectedGroupId = state.currentGroupId) {
  return state.groups
    .filter((group) => !categoryForGroup(group))
    .map(
      (group) =>
        `<option value="${escapeHtml(group.id)}"${group.id === selectedGroupId ? ' selected' : ''}>${escapeHtml(group.name)}</option>`,
    )
    .join('');
}

function setToast(message, tone = 'success') {
  if (!elements?.toast || !message) return;

  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.dataset.tone = tone;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    if (elements?.toast) elements.toast.hidden = true;
  }, 2600);
}

function setModalError(message) {
  if (!elements?.modalError) return;
  elements.modalError.textContent = message;
  elements.modalError.hidden = !message;
  if (message) setModalProgress('');
}

function setModalProgress(message) {
  if (!elements?.modalProgress) return;
  elements.modalProgress.textContent = message;
  elements.modalProgress.hidden = !message;
}

function closeModal() {
  if (!elements?.modal) return;

  elements.modal.hidden = true;
  elements.modal.innerHTML = '';
  elements.modalError = null;
  elements.modalProgress = null;
  modalConfirmHandler = null;
}

function openModal({
  title,
  description = '',
  body = '',
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
}) {
  if (!elements?.modal) return;

  elements.modal.hidden = false;
  elements.modal.innerHTML = `
    <div class="manage-modal__backdrop" data-manage-action="close-modal"></div>
    <section class="manage-modal__panel" role="dialog" aria-modal="true" aria-labelledby="manageModalTitle">
      <header class="manage-modal__header">
        <div>
          <h3 id="manageModalTitle">${escapeHtml(title)}</h3>
          ${description ? `<p>${escapeHtml(description)}</p>` : ''}
        </div>
        <button class="manage-icon-button" type="button" data-manage-action="close-modal" aria-label="关闭">×</button>
      </header>
      <form class="manage-modal__form" id="manageModalForm">
        <div class="manage-modal__body">${body}</div>
        <p class="manage-modal__progress" id="manageModalProgress" hidden></p>
        <p class="manage-modal__error" id="manageModalError" hidden></p>
        <footer class="manage-modal__footer">
          <button class="manage-button manage-button--ghost" type="button" data-manage-action="close-modal">${escapeHtml(cancelLabel)}</button>
          <button class="manage-button ${danger ? 'manage-button--danger' : 'manage-button--primary'}" type="submit">${escapeHtml(confirmLabel)}</button>
        </footer>
      </form>
    </section>
  `;

  elements.modalProgress = elements.modal.querySelector('#manageModalProgress');
  elements.modalError = elements.modal.querySelector('#manageModalError');
  modalConfirmHandler = typeof onConfirm === 'function' ? onConfirm : null;

  const firstField = elements.modal.querySelector('input:not([type="hidden"]), textarea, select');
  if (firstField) window.setTimeout(() => firstField.focus(), 0);
}

function renderGroups() {
  if (!elements?.groupList) return;

  elements.groupList.innerHTML = state.groups
    .map((group) => {
      const isActive = group.id === state.currentGroupId;
      const isBuiltIn = BUILT_IN_GROUPS.some((builtIn) => builtIn.id === group.id);
      const category = categoryForGroup(group);

      return `
        <div class="manage-group${isActive ? ' is-active' : ''}">
          <button
            class="manage-group__select"
            type="button"
            data-manage-action="select-group"
            data-group-id="${escapeHtml(group.id)}"
            aria-pressed="${isActive}"
          >
            <span class="manage-group__name">${escapeHtml(group.name)}</span>
            <span class="manage-group__count">${itemCountForGroup(group)}</span>
          </button>
          ${
            isBuiltIn
              ? '<span class="manage-group__builtin">内置</span>'
              : category
                ? `
                  <span class="manage-group__category">类别</span>
                  <button class="manage-group__action manage-group__action--danger" type="button" data-manage-action="delete-group" data-group-id="${escapeHtml(group.id)}" aria-label="删除${escapeHtml(group.name)}" title="删除">删</button>
                `
                : `
                  <button class="manage-group__action" type="button" data-manage-action="rename-group" data-group-id="${escapeHtml(group.id)}" aria-label="重命名${escapeHtml(group.name)}" title="重命名">改</button>
                  <button class="manage-group__action manage-group__action--danger" type="button" data-manage-action="delete-group" data-group-id="${escapeHtml(group.id)}" aria-label="删除${escapeHtml(group.name)}" title="删除">删</button>
                `
          }
        </div>
      `;
    })
    .join('');
}

function renderCardRows(visibleCards, currentGroup) {
  if (!visibleCards.length) {
    return `
      <div class="manage-empty">
        <span aria-hidden="true">☆</span>
        <strong>这个分组还没有字卡</strong>
        <p>新增一张字卡，或用“批量导入”一次粘贴多张。</p>
      </div>
    `;
  }

  return visibleCards.map((card) => {
    const checked = state.selectedCardIds.has(card.id);
    return `
      <article class="manage-card-row${card.disabled ? ' is-disabled' : ''}${checked ? ' is-selected' : ''}">
        <label class="manage-checkbox" title="选择字卡">
          <input type="checkbox" data-manage-action="select-card" data-card-id="${escapeHtml(card.id)}" ${checked ? 'checked' : ''} aria-label="选择字卡：${escapeHtml(card.content)}" />
          <span aria-hidden="true"></span>
        </label>
        <div class="manage-card-row__copy">
          <p class="manage-card-row__content">${escapeHtml(card.content || '（空白内容）')}</p>
          <div class="manage-card-row__meta">
            <span>${escapeHtml(currentGroup?.name || '默认分组')}</span>
            <span class="manage-status ${card.disabled ? 'is-disabled' : 'is-enabled'}">${card.disabled ? '已禁用' : '启用中'}</span>
          </div>
        </div>
        <div class="manage-card-row__actions">
          <button type="button" data-manage-action="edit-card" data-card-id="${escapeHtml(card.id)}">编辑</button>
          <button type="button" data-manage-action="toggle-card" data-card-id="${escapeHtml(card.id)}">${card.disabled ? '启用' : '禁用'}</button>
          <button class="is-danger" type="button" data-manage-action="delete-card" data-card-id="${escapeHtml(card.id)}">删除</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderStickerRows(visibleStickers) {
  if (!visibleStickers.length) {
    return `
      <div class="manage-empty">
        <span aria-hidden="true">☺</span>
        <strong>还没有表情包</strong>
        <p>导入本地图片后，可以在这里预览、启用、停用或删除。</p>
      </div>
    `;
  }

  return visibleStickers.map((sticker) => {
    const checked = state.selectedCardIds.has(sticker.id);
    return `
      <article class="manage-card-row manage-card-row--sticker${sticker.enabled === false ? ' is-disabled' : ''}${checked ? ' is-selected' : ''}">
        <label class="manage-checkbox" title="选择表情包">
          <input type="checkbox" data-manage-action="select-card" data-card-id="${escapeHtml(sticker.id)}" ${checked ? 'checked' : ''} aria-label="选择表情包" />
          <span aria-hidden="true"></span>
        </label>
        <div class="manage-card-row__copy">
          <div class="manage-sticker-preview"><img data-sticker-image-id="${escapeHtml(sticker.id)}" alt="表情包" /></div>
          <div class="manage-card-row__meta">
            <span>本地图片</span>
            <span class="manage-status ${sticker.enabled === false ? 'is-disabled' : 'is-enabled'}">${sticker.enabled === false ? '已停用' : '启用中'}</span>
          </div>
        </div>
        <div class="manage-card-row__actions">
          <button type="button" data-manage-action="toggle-card" data-card-id="${escapeHtml(sticker.id)}">${sticker.enabled === false ? '启用' : '停用'}</button>
          <button class="is-danger" type="button" data-manage-action="delete-card" data-card-id="${escapeHtml(sticker.id)}">删除</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderTextEntryRows(entries, category) {
  if (!entries.length) {
    return `
      <div class="manage-empty">
        <span aria-hidden="true">${category === 'status' ? '◷' : '？'}</span>
        <strong>还没有${category === 'status' ? '状态' : '问卷回答'}</strong>
        <p>新增内容或从文本、JSON 文件导入。</p>
      </div>
    `;
  }

  return entries.map((entry) => {
    const checked = state.selectedCardIds.has(entry.id);
    return `
      <article class="manage-card-row${checked ? ' is-selected' : ''}">
        <label class="manage-checkbox" title="选择内容">
          <input type="checkbox" data-manage-action="select-card" data-card-id="${escapeHtml(entry.id)}" ${checked ? 'checked' : ''} aria-label="选择内容：${escapeHtml(entry.content)}" />
          <span aria-hidden="true"></span>
        </label>
        <div class="manage-card-row__copy">
          <p class="manage-card-row__content">${escapeHtml(entry.content)}</p>
          <div class="manage-card-row__meta"><span>${category === 'status' ? '状态' : '问卷回答'}</span></div>
        </div>
        <div class="manage-card-row__actions">
          <button type="button" data-manage-action="edit-card" data-card-id="${escapeHtml(entry.id)}">编辑</button>
          <button class="is-danger" type="button" data-manage-action="delete-card" data-card-id="${escapeHtml(entry.id)}">删除</button>
        </div>
      </article>
    `;
  }).join('');
}

async function hydrateStickerPreviewImages() {
  const images = Array.from(elements?.cardList?.querySelectorAll('[data-sticker-image-id]') || []);
  await Promise.all(images.map(async (image) => {
    try {
      const blob = await getStickerBlob(image.dataset.stickerImageId);
      if (blob) setBlobImage(image, blob);
      else image.alt = '表情包不可用';
    } catch {
      image.alt = '表情包读取失败';
    }
  }));
}
function renderCards() {
  if (!elements?.cardList || !elements?.summary) return;

  if (elements.searchInput && elements.searchInput.value !== state.searchQuery) elements.searchInput.value = state.searchQuery;

  const category = currentCategory();
  const allItems = filteredCurrentItems();
  const pageCount = Math.max(1, Math.ceil(allItems.length / CARD_PAGE_SIZE));
  state.cardPage = Math.min(Math.max(1, state.cardPage), pageCount);
  const pageStart = (state.cardPage - 1) * CARD_PAGE_SIZE;
  const pageItems = allItems.slice(pageStart, pageStart + CARD_PAGE_SIZE);
  const currentGroup = groupById(state.currentGroupId);
  const selectedVisibleCount = allItems.filter((item) => state.selectedCardIds.has(item.id)).length;
  const disabledTotal = state.cards.filter((card) => card.disabled).length;
  const isStickerCategory = category?.type === 'stickers';
  const isTextCategory = category?.type === 'questionnaire' || category?.type === 'status';
  const unit = isTextCategory ? '条' : '张';

  elements.summary.textContent = `${state.groups.length} 个分组 · ${state.cards.length} 张字卡 · ${state.stickers.length} 张表情包 · ${state.questionnaireAnswers.length} 条问卷回答 · ${state.statuses.length} 条状态 · ${state.patCards.length} 张拍一拍字卡 · ${disabledTotal} 张已禁用`;
  elements.currentGroupName.textContent = currentGroup?.name || '默认分组';
  elements.visibleCardCount.textContent = `${allItems.length} ${unit}`;

  if (elements.selectAll) {
    elements.selectAll.checked = allItems.length > 0 && selectedVisibleCount === allItems.length;
    elements.selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < allItems.length;
    elements.selectAll.disabled = allItems.length === 0;
  }

  if (elements.selectionText) elements.selectionText.textContent = `已选 ${state.selectedCardIds.size} ${unit}`;
  if (elements.batchBar) elements.batchBar.hidden = state.selectedCardIds.size === 0;

  const createButton = viewRoot.querySelector('[data-manage-action="create-card"]');
  if (createButton) {
    createButton.textContent = isStickerCategory
      ? '＋ 导入表情包'
      : isTextCategory
        ? `＋ 新增${category.name}`
        : '＋ 新增字卡';
  }

  const importJsonButton = viewRoot.querySelector('[data-manage-action="import-json"]');
  const importTextButton = viewRoot.querySelector('[data-manage-action="import-text"]');
  const deduplicateButton = viewRoot.querySelector('[data-manage-action="deduplicate"]');
  if (importJsonButton) importJsonButton.textContent = isStickerCategory ? '导入图片' : '导入 JSON';
  if (importTextButton) importTextButton.hidden = isStickerCategory;
  if (deduplicateButton) deduplicateButton.hidden = Boolean(category);

  const batchEnable = viewRoot.querySelector('[data-manage-action="batch-enable"]');
  const batchDisable = viewRoot.querySelector('[data-manage-action="batch-disable"]');
  const batchMove = viewRoot.querySelector('[data-manage-action="batch-move"]');
  if (batchEnable) batchEnable.hidden = isTextCategory;
  if (batchDisable) batchDisable.hidden = isTextCategory;
  if (batchMove) batchMove.hidden = Boolean(category);

  if (isStickerCategory) {
    elements.cardList.innerHTML = renderStickerRows(pageItems);
    void hydrateStickerPreviewImages();
  } else if (isTextCategory) {
    elements.cardList.innerHTML = renderTextEntryRows(pageItems, category.type);
  } else {
    elements.cardList.innerHTML = renderCardRows(pageItems, currentGroup);
  }

  if (elements.cardPagination) {
    elements.cardPagination.hidden = pageCount <= 1;
    elements.cardPageStatus.textContent = `${state.cardPage} / ${pageCount}`;
    elements.cardPrevPage.disabled = state.cardPage <= 1;
    elements.cardNextPage.disabled = state.cardPage >= pageCount;
  }
}
function renderPatCards() {
  if (!elements?.patCardList) return;

  elements.patCardList.innerHTML = state.patCards.length
    ? state.patCards
        .map(
          (card) => `
            <article class="manage-pat-row">
              <div class="manage-pat-row__mark" aria-hidden="true">拍</div>
              <div class="manage-pat-row__copy">
                <p>${escapeHtml(card.content)}</p>
                <small>仅用于长按星回头像时的拍一拍回复</small>
              </div>
              <div class="manage-card-row__actions">
                <button type="button" data-manage-action="edit-pat-card" data-pat-card-id="${escapeHtml(card.id)}">编辑</button>
                <button class="is-danger" type="button" data-manage-action="delete-pat-card" data-pat-card-id="${escapeHtml(card.id)}">删除</button>
              </div>
            </article>
          `,
        )
        .join('')
    : `
      <div class="manage-empty manage-empty--compact">
        <span aria-hidden="true">拍</span>
        <strong>还没有拍一拍字卡</strong>
        <p>新增后，星回只会在拍一拍时从这里抽取回复。</p>
      </div>
    `;

  if (elements.patCardCount) elements.patCardCount.textContent = `${state.patCards.length} 张`;
}

function render() {
  renderGroups();
  renderCards();
  renderPatCards();
}

function selectedItems() {
  return currentItems().filter((item) => state.selectedCardIds.has(item.id));
}

function validateGroupName(name, editingGroupId = '') {
  if (!name) return '请输入分组名称。';
  if (name.length > 30) return '分组名称不能超过 30 个字符。';

  const duplicated = state.groups.some(
    (group) => group.id !== editingGroupId && group.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  return duplicated ? '已经有同名分组了。' : '';
}

function createGroup() {
  openModal({
    title: '新建分组',
    description: '分组用于整理字卡，之后可以随时重命名。',
    confirmLabel: '创建',
    body: `
      <label class="manage-field">
        <span>分组名称</span>
        <input id="manageGroupName" type="text" maxlength="30" autocomplete="off" placeholder="例如：日常回应" />
      </label>
    `,
    onConfirm: () => {
      const input = elements.modal.querySelector('#manageGroupName');
      const name = input.value.trim();
      const error = validateGroupName(name);
      if (error) {
        setModalError(error);
        return false;
      }

      const specialCategory = MANAGE_CATEGORIES.find((category) => category.name === name);
      const group = specialCategory
        ? { id: specialCategory.id, name: specialCategory.name, category: specialCategory.type }
        : { id: createId('group'), name };
      state.groups.push(group);
      state.currentGroupId = group.id;
      state.selectedCardIds.clear();
      saveData();
      render();
      setToast(`已创建分组“${name}”`);
      return true;
    },
  });
}

function renameGroup(groupId) {
  const group = groupById(groupId);
  if (!group || BUILT_IN_GROUPS.some((builtIn) => builtIn.id === groupId)) return;

  openModal({
    title: '重命名字卡分组',
    confirmLabel: '保存',
    body: `
      <label class="manage-field">
        <span>分组名称</span>
        <input id="manageGroupName" type="text" maxlength="30" value="${escapeHtml(group.name)}" autocomplete="off" />
      </label>
    `,
    onConfirm: () => {
      const input = elements.modal.querySelector('#manageGroupName');
      const name = input.value.trim();
      const error = validateGroupName(name, groupId);
      if (error) {
        setModalError(error);
        return false;
      }

      group.name = name;
      saveData();
      render();
      setToast('分组名称已更新');
      return true;
    },
  });
}

function deleteGroup(groupId) {
  const group = groupById(groupId);
  if (!group || BUILT_IN_GROUPS.some((builtIn) => builtIn.id === groupId)) return;

  const category = categoryForGroup(group);
  const itemCount = category ? categoryItems(category.type).length : cardsInGroup(groupId).length;
  openModal({
    title: `删除${category ? '类别' : '分组'}“${group.name}”？`,
    description: category
      ? itemCount > 0
        ? `该类别内的 ${itemCount} 项内容会保留，重新创建同名类别后可以继续使用。`
        : '删除类别后，依赖它的功能会提示“请先重建该类别”。'
      : itemCount > 0
        ? `分组内的 ${itemCount} 张字卡会移入“默认分组”，不会删除。`
        : '该分组没有字卡，删除后无法恢复。',
    confirmLabel: category ? '删除类别' : '删除分组',
    danger: true,
    onConfirm: () => {
      if (!category) {
        state.cards.forEach((card) => {
          if (card.groupId === groupId) card.groupId = DEFAULT_GROUP_ID;
        });
      }
      state.groups = state.groups.filter((item) => item.id !== groupId);
      if (state.currentGroupId === groupId) state.currentGroupId = DEFAULT_GROUP_ID;
      state.selectedCardIds.clear();
      saveData();
      render();
      setToast(category
        ? `类别“${group.name}”已删除，内容仍保留`
        : itemCount > 0
          ? `分组已删除，${itemCount} 张字卡已移入默认分组`
          : '分组已删除');
      return true;
    },
  });
}

function stickerImportEditor() {
  openModal({
    title: '导入表情包',
    description: '选择本地图片，图片二进制会保存到 IndexedDB，不会上传网络。',
    confirmLabel: '导入',
    body: `
      <label class="manage-field">
        <span>本地图片</span>
        <input id="manageStickerFiles" type="file" accept="image/*" multiple />
      </label>
      <p class="manage-field__hint">支持一次选择多张图片；没有自定义大小上限，仍受浏览器自身存储配额限制。</p>
    `,
    onConfirm: async () => {
      const files = Array.from(elements.modal.querySelector('#manageStickerFiles').files || []);
      if (!files.length) {
        setModalError('请先选择本地图片。');
        return false;
      }
      if (files.some((file) => !file.type.startsWith('image/'))) {
        setModalError('只能导入本地图片文件。');
        return false;
      }

      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      setModalProgress(`正在读取 0/${files.length}`);
      if (navigator.storage?.estimate) {
        try {
          const estimate = await navigator.storage.estimate();
          const remaining = Math.max(0, (estimate.quota || 0) - (estimate.usage || 0));
          if (estimate.quota && totalSize > remaining) {
            setModalError('浏览器可用空间不足，请先释放存储空间或导出备份。');
            return false;
          }
        } catch {
          // Quota estimation is best-effort; continue with IndexedDB if it fails.
        }
      }

      const imported = [];
      let failed = 0;
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const id = createId('sticker');
        try {
          await putStickerBlob(id, file, { enabled: true, createdAt: Date.now() });
          imported.push({
            id,
            storage: 'indexeddb',
            mimeType: file.type,
            size: file.size,
            createdAt: Date.now(),
            enabled: true,
          });
        } catch {
          failed += 1;
        }
        setModalProgress(`正在写入 ${index + 1}/${files.length}`);
        await nextMainThreadTurn();
      }

      if (!imported.length) {
        setModalError('图片保存失败，请检查浏览器存储空间。');
        return false;
      }

      const beforeLength = state.stickers.length;
      state.stickers.push(...imported);
      state.selectedCardIds.clear();
      if (!saveData()) {
        state.stickers.splice(beforeLength, imported.length);
        await Promise.all(imported.map((item) => deleteStickerBlob(item.id).catch(() => {})));
        setModalError('浏览器存储空间不足，请先导出备份或清理字卡');
        return false;
      }

      render();
      setToast(`已导入 ${imported.length} 张表情包，失败 ${failed} 张`);
      return true;
    },
  });
}
function textEntryEditor(entryId = '') {
  const category = currentCategory();
  if (!category || category.type === 'stickers') return;

  const entries = categoryItems(category.type);
  const entry = entryId ? entries.find((item) => item.id === entryId) : null;
  if (entryId && !entry) return;

  const label = category.type === 'status' ? '状态内容' : '问卷回答';
  openModal({
    title: entry ? `编辑${label}` : `新增${label}`,
    description: category.type === 'status'
      ? '最新一条状态会显示在首页顶部。'
      : '问卷回答会保存在本地，供问卷入口调用。',
    confirmLabel: entry ? '保存' : '新增',
    body: `
      <label class="manage-field">
        <span>${label}</span>
        <textarea id="manageTextEntryContent" rows="5" maxlength="1000" placeholder="输入内容…">${escapeHtml(entry?.content || '')}</textarea>
      </label>
    `,
    onConfirm: () => {
      const content = elements.modal.querySelector('#manageTextEntryContent').value.trim();
      if (!content) {
        setModalError(`${label}不能为空。`);
        return false;
      }

      if (entry) {
        entry.content = content;
      } else {
        entries.push({ id: createId(category.type), content });
      }

      saveData();
      render();
      setToast(entry ? `${label}已保存` : `${label}已新增`);
      return true;
    },
  });
}

function editCurrentItem(itemId) {
  const category = currentCategory();
  if (!category) {
    cardEditor(itemId);
    return;
  }

  if (category.type === 'stickers') {
    setToast('表情包无需编辑内容', 'warning');
    return;
  }

  textEntryEditor(itemId);
}

function createCurrentItem() {
  const category = currentCategory();
  if (category?.type === 'stickers') {
    stickerImportEditor();
    return;
  }
  if (category?.type === 'questionnaire' || category?.type === 'status') {
    textEntryEditor();
    return;
  }
  cardEditor();
}
function cardEditor(cardId = '') {
  const card = cardId ? state.cards.find((item) => item.id === cardId) : null;
  if (cardId && !card) return;

  const initialGroupId = card?.groupId || state.currentGroupId;
  openModal({
    title: card ? '编辑字卡' : '新增字卡',
    description: card ? '修改内容、所属分组或启用状态。' : '内容会保存在当前浏览器中。',
    confirmLabel: card ? '保存' : '新增',
    body: `
      <label class="manage-field">
        <span>字卡内容</span>
        <textarea id="manageCardContent" rows="5" maxlength="1000" placeholder="输入星回可能会说的话…">${escapeHtml(card?.content || '')}</textarea>
      </label>
      <label class="manage-field">
        <span>所属分组</span>
        <select id="manageCardGroup">${groupOptionsHtml(initialGroupId)}</select>
      </label>
      <label class="manage-switch-field">
        <input id="manageCardDisabled" type="checkbox" ${card?.disabled ? 'checked' : ''} />
        <span class="manage-switch-field__control" aria-hidden="true"></span>
        <span>
          <strong>禁用这张字卡</strong>
          <small>禁用后保留在库中，但不会参与随机抽取。</small>
        </span>
      </label>
    `,
    onConfirm: () => {
      const content = elements.modal.querySelector('#manageCardContent').value.trim();
      const groupId = elements.modal.querySelector('#manageCardGroup').value;
      const disabled = elements.modal.querySelector('#manageCardDisabled').checked;

      if (!content) {
        setModalError('字卡内容不能为空。');
        return false;
      }

      const validGroupId = groupById(groupId)?.id || DEFAULT_GROUP_ID;
      if (card) {
        card.content = content;
        card.groupId = validGroupId;
        card.disabled = disabled;
      } else {
        state.cards.push({ id: createId('card'), groupId: validGroupId, content, disabled });
      }

      saveData();
      render();
      setToast(card ? '字卡已保存' : '字卡已新增');
      return true;
    },
  });
}

function patCardEditor(cardId = '') {
  const card = cardId ? state.patCards.find((item) => item.id === cardId) : null;
  if (cardId && !card) return;

  openModal({
    title: card ? '编辑拍一拍字卡' : '新增拍一拍字卡',
    description: '这些内容只会在星回回应拍一拍时随机抽取。',
    confirmLabel: card ? '保存' : '新增',
    body: `
      <label class="manage-field">
        <span>回复内容</span>
        <textarea id="managePatCardContent" rows="4" maxlength="500" placeholder="例如：轻轻拍了拍你。">${escapeHtml(card?.content || '')}</textarea>
      </label>
    `,
    onConfirm: () => {
      const content = elements.modal.querySelector('#managePatCardContent').value.trim();
      if (!content) {
        setModalError('拍一拍回复内容不能为空。');
        return false;
      }

      if (card) {
        card.content = content;
      } else {
        state.patCards.push({ id: createId('pat'), content });
      }

      saveData();
      render();
      setToast(card ? '拍一拍字卡已保存' : '拍一拍字卡已新增');
      return true;
    },
  });
}

function deletePatCard(cardId) {
  const card = state.patCards.find((item) => item.id === cardId);
  if (!card) return;

  openModal({
    title: '删除这张拍一拍字卡？',
    description: '删除后无法恢复，后续拍一拍不会再抽到这条内容。',
    confirmLabel: '确认删除',
    danger: true,
    onConfirm: () => {
      state.patCards = state.patCards.filter((item) => item.id !== cardId);
      saveData();
      render();
      setToast('拍一拍字卡已删除');
      return true;
    },
  });
}

function toggleCards(cardIds, disabled) {
  const idSet = new Set(cardIds);
  const category = currentCategory();
  const targetItems = category?.type === 'stickers' ? state.stickers : state.cards;
  let changed = 0;

  if (category && category.type !== 'stickers') return;

  targetItems.forEach((item) => {
    const isDisabled = category?.type === 'stickers' ? item.enabled === false : item.disabled;
    if (!idSet.has(item.id) || isDisabled === disabled) return;
    if (category?.type === 'stickers') item.enabled = !disabled;
    else item.disabled = disabled;
    changed += 1;
  });

  if (!changed) return;
  saveData();
  render();
  setToast(category?.type === 'stickers'
    ? `${changed} 张表情包已${disabled ? '停用' : '启用'}`
    : `${changed} 张字卡已${disabled ? '禁用' : '启用'}`);
}

function deleteCards(cardIds) {
  const idSet = new Set(cardIds);
  const category = currentCategory();
  const items = category ? categoryItems(category.type) : state.cards;
  const count = items.filter((item) => idSet.has(item.id)).length;
  if (!count) return;

  const unit = category?.type === 'questionnaire' || category?.type === 'status' ? '条' : '张';
  const label = category?.type === 'stickers'
    ? '张表情包'
    : category?.type === 'questionnaire'
      ? '条问卷回答'
      : category?.type === 'status'
        ? '条状态'
        : '张字卡';

  openModal({
    title: `删除 ${count} ${label}？`,
    description: '删除后无法恢复，此操作不会删除当前类别或分组。',
    confirmLabel: '确认删除',
    danger: true,
    onConfirm: async () => {
      const previousStickers = state.stickers;
      const previousQuestionnaireAnswers = state.questionnaireAnswers;
      const previousStatuses = state.statuses;
      const previousCards = state.cards;
      let removedStickers = [];

      if (category?.type === 'stickers') {
        removedStickers = state.stickers.filter((item) => idSet.has(item.id));
        state.stickers = state.stickers.filter((item) => !idSet.has(item.id));
      } else if (category?.type === 'questionnaire') {
        state.questionnaireAnswers = state.questionnaireAnswers.filter((item) => !idSet.has(item.id));
      } else if (category?.type === 'status') {
        state.statuses = state.statuses.filter((item) => !idSet.has(item.id));
      } else {
        state.cards = state.cards.filter((item) => !idSet.has(item.id));
      }
      cardIds.forEach((id) => state.selectedCardIds.delete(id));

      if (!saveData()) {
        state.stickers = previousStickers;
        state.questionnaireAnswers = previousQuestionnaireAnswers;
        state.statuses = previousStatuses;
        state.cards = previousCards;
        setModalError('浏览器存储空间不足，请先导出备份或清理字卡');
        return false;
      }

      if (removedStickers.length) {
        await Promise.all(removedStickers.map((item) => deleteStickerBlob(item.id).catch(() => {})));
      }
      render();
      setToast(`已删除 ${count} ${unit}`);
      return true;
    },
  });
}
function moveSelectedCards() {
  const count = state.selectedCardIds.size;
  if (!count || currentCategory()) return;

  openModal({
    title: `移动 ${count} 张字卡`,
    description: '请选择移动后的目标分组。',
    confirmLabel: '移动',
    body: `
      <label class="manage-field">
        <span>目标分组</span>
        <select id="manageMoveTarget">${groupOptionsHtml(state.currentGroupId)}</select>
      </label>
    `,
    onConfirm: () => {
      const targetId = elements.modal.querySelector('#manageMoveTarget').value;
      const target = groupById(targetId);
      if (!target) {
        setModalError('请选择有效的目标分组。');
        return false;
      }

      let moved = 0;
      state.cards.forEach((card) => {
        if (!state.selectedCardIds.has(card.id) || card.groupId === target.id) return;
        card.groupId = target.id;
        moved += 1;
      });

      state.selectedCardIds.clear();
      saveData();
      render();
      setToast(moved ? `已将 ${moved} 张字卡移动到“${target.name}”` : '字卡已在该分组中');
      return true;
    },
  });
}

function deduplicateCards() {
  if (currentCategory()) return;

  const seen = new Set();
  const kept = [];
  let removed = 0;

  state.cards.forEach((card) => {
    if (seen.has(card.content)) {
      removed += 1;
      return;
    }
    seen.add(card.content);
    kept.push(card);
  });

  openModal({
    title: '全库内容去重',
    description: removed
      ? `检测到 ${removed} 张内容完全相同的字卡，将保留每组重复内容中最先出现的一张。`
      : '全库没有内容完全相同的字卡，无需处理。',
    confirmLabel: removed ? '开始去重' : '知道了',
    danger: removed > 0,
    onConfirm: () => {
      if (!removed) return true;

      state.cards = kept;
      state.selectedCardIds.clear();
      saveData();
      render();
      setToast(`去重完成，已移除 ${removed} 张重复字卡`);
      return true;
    },
  });
}

function importTextCategoryJson(category) {
  const collection = categoryItems(category.type);
  openModal({
    title: `导入${category.name} JSON`,
    description: '支持当前类别导出的 JSON，也支持字符串数组。',
    confirmLabel: '导入',
    body: `
      <label class="manage-field">
        <span>JSON 文件</span>
        <input id="manageCategoryImportFile" type="file" accept=".json,application/json" />
      </label>
      <p class="manage-field__hint">会读取 items、cards、questionnaireAnswers 或 statuses 数组。</p>
    `,
    onConfirm: async () => {
      const file = elements.modal.querySelector('#manageBatchImportFile')?.files?.[0] || null;
      const textarea = elements.modal.querySelector('#manageBatchImportText');
      const typedText = textarea?.value || '';
      const parsedLines = [];

      if (file) {
        try {
          const fileText = await readImportFileText(file);
          parsedLines.push(...parseImportedCardLines(fileText, file.name || ''));
        } catch {
          setModalError('文件读取失败，或 JSON 格式不正确。');
          return false;
        }
      }

      if (typedText.trim()) {
        try {
          parsedLines.push(...parseImportedCardLines(typedText, ''));
        } catch {
          setModalError('粘贴内容解析失败，请检查格式。');
          return false;
        }
      }

      const lines = parsedLines
        .map((line) => String(line || '').trim())
        .filter(Boolean);

      if (!lines.length) {
        setModalError('请粘贴内容或选择 TXT / JSON 文件。');
        return false;
      }

      const sourceItems = isTextCategory
        ? collection
        : state.cards.filter((item) => item.groupId === group.id);
      const existing = new Set(
        sourceItems
          .map((item) => String(item.content || '').trim())
          .filter(Boolean),
      );      const uniqueLines = [];
      let skipped = 0;

      for (let index = 0; index < lines.length; index += 1) {
        const content = lines[index].replace(/\r\n?/g, '\n').trim();
        if (!content) continue;
        if (existing.has(content)) {
          skipped += 1;
        } else {
          existing.add(content);
          uniqueLines.push(content);
        }

        if ((index + 1) % 100 === 0) {
          setModalProgress(`正在处理 ${index + 1} / ${lines.length} 行…`);
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }

      if (!uniqueLines.length) {
        setModalError(skipped ? '这些内容都已经存在，没有新增内容。' : '没有可导入的内容。');
        return false;
      }

      setModalProgress(`正在保存 ${uniqueLines.length} ${unit}…`);
      const newItems = uniqueLines.map((content) => (
        isTextCategory
          ? { id: createId(category.type), content }
          : { id: createId('card'), groupId: group.id, content, disabled: false }
      ));

      if (isTextCategory) {
        const previousLength = collection.length;
        collection.push(...newItems);
        if (!saveData()) {
          collection.splice(previousLength);
          setModalError('保存失败，浏览器存储空间可能不足。');
          return false;
        }
      } else {
        const previousLength = state.cards.length;
        state.cards.push(...newItems);
        state.currentGroupId = group.id;
        if (!saveData()) {
          state.cards.splice(previousLength);
          setModalError('保存失败，浏览器存储空间可能不足。');
          return false;
        }
      }

      state.cardPage = 1;
      state.selectedCardIds.clear();
      render();
      setToast(`已导入 ${uniqueLines.length} ${unit}${skipped ? `，跳过 ${skipped} 条重复内容` : ''}`);
      return true;
    },
  });
}
function exportSelectedCards() {
  const items = selectedItems();
  const category = currentCategory();
  if (!items.length) {
    setToast(category ? '请先勾选要导出的内容' : '请先勾选要导出的字卡', 'warning');
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  let payload;
  let filename;

  if (category?.type === 'stickers') {
    payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      category: { name: category.name, type: category.type },
      items,
      stickers: items,
    };
    filename = `xinghui-stickers-${date}.json`;
  } else if (category?.type === 'questionnaire' || category?.type === 'status') {
    const key = category.type === 'questionnaire' ? 'questionnaireAnswers' : 'statuses';
    payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      category: { name: category.name, type: category.type },
      items,
      [key]: items,
    };
    filename = `xinghui-${category.type}-${date}.json`;
  } else {
    const groupIds = new Set(items.map((card) => card.groupId));
    payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      groups: state.groups.filter((group) => groupIds.has(group.id)),
      cards: items,
    };
    filename = `xinghui-cards-${date}.json`;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setToast(`已导出 ${items.length} ${category?.type === 'questionnaire' || category?.type === 'status' ? '条' : '张'}内容`);
}

function handleAction(action, target) {
  switch (action) {
    case 'close-modal':
      closeModal();
      break;
    case 'card-prev-page':
      if (state.cardPage > 1) {
        state.cardPage -= 1;
        renderCards();
      }
      break;
    case 'card-next-page':
      state.cardPage += 1;
      renderCards();
      break;
    case 'select-group': {
      const groupId = target.dataset.groupId;
      if (!groupById(groupId)) return;
      state.currentGroupId = groupId;
      state.cardPage = 1;
      state.selectedCardIds.clear();
      writeCurrentGroupId();
      render();
      break;
    }
    case 'create-group':
      createGroup();
      break;
    case 'rename-group':
      renameGroup(target.dataset.groupId);
      break;
    case 'delete-group':
      deleteGroup(target.dataset.groupId);
      break;
    case 'create-card':
      createCurrentItem();
      break;
    case 'edit-card':
      editCurrentItem(target.dataset.cardId);
      break;
    case 'toggle-card': {
      const card = state.cards.find((item) => item.id === target.dataset.cardId);
      if (card) toggleCards([card.id], !card.disabled);
      break;
    }
    case 'delete-card':
      deleteCards([target.dataset.cardId]);
      break;
    case 'create-pat-card':
      patCardEditor();
      break;
    case 'edit-pat-card':
      patCardEditor(target.dataset.patCardId);
      break;
    case 'delete-pat-card':
      deletePatCard(target.dataset.patCardId);
      break;
    case 'batch-disable':
      toggleCards([...state.selectedCardIds], true);
      break;
    case 'batch-enable':
      toggleCards([...state.selectedCardIds], false);
      break;
    case 'batch-delete':
      deleteCards([...state.selectedCardIds]);
      break;
    case 'batch-move':
      moveSelectedCards();
      break;
    case 'deduplicate':
      deduplicateCards();
      break;
    case 'import-json':
      importJsonCards();
      break;
    case 'import-text':
      importTextCards();
      break;
    case 'export-selected':
      exportSelectedCards();
      break;
    default:
      break;
  }
}

function handleChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (target.dataset.manageAction === 'select-card') {
    if (target.checked) state.selectedCardIds.add(target.dataset.cardId);
    else state.selectedCardIds.delete(target.dataset.cardId);
    renderCards();
    return;
  }

  if (target.id === 'manageSelectAll') {
    const visibleItems = currentItems();
    visibleItems.forEach((item) => {
      if (target.checked) state.selectedCardIds.add(item.id);
      else state.selectedCardIds.delete(item.id);
    });
    renderCards();
  }
}

async function handleModalSubmit(event) {
  event.preventDefault();
  if (!modalConfirmHandler) return;

  const submitButton = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    const shouldClose = await modalConfirmHandler();
    if (shouldClose !== false) closeModal();
  } catch {
    setModalError('操作没有完成，请重试。');
  } finally {
    if (submitButton && submitButton.isConnected) submitButton.disabled = false;
  }
}

function bindEvents() {
  if (!viewRoot || eventsBound) return;

  viewRoot.addEventListener('click', (event) => {
    const target = event.target.closest('[data-manage-action]');
    if (!target) return;

    const action = target.dataset.manageAction;
    if (action === 'select-card') return;
    handleAction(action, target);
  });

  viewRoot.addEventListener('input', (event) => {
    if (event.target.id !== 'manageCardSearch') return;
    state.searchQuery = event.target.value;
    state.cardPage = 1;
    renderCards();
  });

  viewRoot.addEventListener('change', handleChange);
  viewRoot.addEventListener('submit', (event) => {
    if (event.target.id === 'manageModalForm') void handleModalSubmit(event);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements?.modal && !elements.modal.hidden) closeModal();
  });

  eventsBound = true;
}

export function initManageView(root = document.getElementById('view-manage')) {
  if (!root) return false;

  viewRoot = root;
  viewRoot.innerHTML = `
    <div class="manage-page">
      <header class="manage-header">
        <div>
          <p class="manage-eyebrow">CARD LIBRARY</p>
          <h2 class="manage-title">字卡管理</h2>
          <p class="manage-summary" id="manageSummary">正在读取字卡库…</p>
        </div>
        <button class="manage-button manage-button--primary manage-button--compact" type="button" data-manage-action="create-card">
          <span aria-hidden="true">＋</span> 新增字卡
        </button>
      </header>

      <section class="manage-panel manage-panel--groups" aria-labelledby="manageGroupsTitle">
        <div class="manage-section-heading">
          <div>
            <p class="manage-kicker">分组</p>
            <h3 id="manageGroupsTitle">选择字卡分组</h3>
          </div>
          <button class="manage-button manage-button--ghost manage-button--compact" type="button" data-manage-action="create-group">新建分组</button>
        </div>
        <div class="manage-group-list" id="manageGroupList" aria-label="字卡分组"></div>
      </section>

      <section class="manage-panel manage-panel--cards" aria-labelledby="manageCardsTitle">
        <div class="manage-section-heading manage-section-heading--cards">
          <div>
            <p class="manage-kicker">字卡</p>
            <h3 id="manageCardsTitle"><span id="manageCurrentGroupName">默认分组</span> <small id="manageVisibleCardCount">0 张</small></h3>
          </div>
          <div class="manage-selection-status" id="manageSelectionText">已选 0 张</div>
        </div>

        <div class="manage-toolbar">
          <label class="manage-search">
            <span class="manage-search__icon" aria-hidden="true">⌕</span>
            <input id="manageCardSearch" type="search" placeholder="搜索当前分类" aria-label="搜索当前分类" />
          </label>
          <label class="manage-select-all">
            <span class="manage-checkbox">
              <input id="manageSelectAll" type="checkbox" />
              <span aria-hidden="true"></span>
            </span>
            <span>全选当前分组</span>
          </label>
          <div class="manage-toolbar__actions">
            <button type="button" data-manage-action="import-json">导入 JSON</button>
            <button type="button" data-manage-action="import-text">批量导入</button>
            <button type="button" data-manage-action="deduplicate">全库去重</button>
            <button type="button" data-manage-action="export-selected">导出勾选</button>
          </div>
        </div>

        <div class="manage-batch-bar" id="manageBatchBar" hidden>
          <strong>批量操作</strong>
          <div>
            <button type="button" data-manage-action="batch-enable">启用</button>
            <button type="button" data-manage-action="batch-disable">禁用</button>
            <button type="button" data-manage-action="batch-move">移动</button>
            <button class="is-danger" type="button" data-manage-action="batch-delete">删除</button>
          </div>
        </div>

        <div class="manage-card-list" id="manageCardList"></div>
        <div class="manage-card-pagination" id="manageCardPagination" hidden>
          <button type="button" id="manageCardPrevPage" data-manage-action="card-prev-page">上一页</button>
          <span id="manageCardPageStatus">1 / 1</span>
          <button type="button" id="manageCardNextPage" data-manage-action="card-next-page">下一页</button>
        </div>
      </section>

      <section class="manage-panel manage-panel--pat" aria-labelledby="managePatCardsTitle">
        <div class="manage-section-heading">
          <div>
            <p class="manage-kicker">拍一拍</p>
            <h3 id="managePatCardsTitle">拍一拍字卡 <small id="managePatCardCount">0 张</small></h3>
          </div>
          <button class="manage-button manage-button--ghost manage-button--compact" type="button" data-manage-action="create-pat-card">
            <span aria-hidden="true">＋</span> 新增拍一拍字卡
          </button>
        </div>
        <p class="manage-pat-hint">长按星回头像时，只有这里的内容会参与拍一拍回复。</p>
        <div class="manage-pat-list" id="managePatCardList"></div>
      </section>
    </div>
    <div class="manage-modal" id="manageModal" hidden></div>
    <div class="manage-toast" id="manageToast" role="status" aria-live="polite" hidden></div>
  `;

  elements = {
    summary: viewRoot.querySelector('#manageSummary'),
    groupList: viewRoot.querySelector('#manageGroupList'),
    currentGroupName: viewRoot.querySelector('#manageCurrentGroupName'),
    visibleCardCount: viewRoot.querySelector('#manageVisibleCardCount'),
    selectionText: viewRoot.querySelector('#manageSelectionText'),
    selectAll: viewRoot.querySelector('#manageSelectAll'),
    searchInput: viewRoot.querySelector('#manageCardSearch'),
    batchBar: viewRoot.querySelector('#manageBatchBar'),
    cardList: viewRoot.querySelector('#manageCardList'),
    cardPagination: viewRoot.querySelector('#manageCardPagination'),
    cardPageStatus: viewRoot.querySelector('#manageCardPageStatus'),
    cardPrevPage: viewRoot.querySelector('#manageCardPrevPage'),
    cardNextPage: viewRoot.querySelector('#manageCardNextPage'),
    patCardList: viewRoot.querySelector('#managePatCardList'),
    patCardCount: viewRoot.querySelector('#managePatCardCount'),
    modal: viewRoot.querySelector('#manageModal'),
    modalError: null,
    toast: viewRoot.querySelector('#manageToast'),
  };

  syncState();
  bindEvents();
  render();
  return true;
}

export function onManageViewEnter() {
  if (!viewRoot) return;
  syncState();
  render();
}

export function getManageSnapshot() {
  syncState();
  return {
    groups: state.groups.map((group) => ({ ...group })),
    cards: state.cards.map((card) => ({ ...card })),
    stickers: state.stickers.map((item) => ({ ...item })),
    questionnaireAnswers: state.questionnaireAnswers.map((item) => ({ ...item })),
    statuses: state.statuses.map((item) => ({ ...item })),
    patCards: state.patCards.map((card) => ({ ...card })),
    currentGroupId: state.currentGroupId,
  };
}




