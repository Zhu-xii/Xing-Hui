import '../styles/settings.css';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  readCharacter,
  readSettings,
  updateSettings,
  writeCharacter,
} from '../lib/storage.js';
import { joinSpellCards } from '../lib/spell-cards.js';
import { deleteAvatarBlob, getAvatarBlob, putAvatarBlob, setBlobImage } from '../lib/media-db.js';

const MAX_CHAT_BACKGROUND_BYTES = 2 * 1024 * 1024;

let viewRoot = null;
let elements = null;
let toastTimer = null;
let delayInputTimer = null;
let eventsBound = false;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function enabledValue(value, fallback, minimum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, minimum, 100) : fallback;
}

function showToast(message, tone = 'default') {
  if (!elements?.toast) return;
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.dataset.tone = tone;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    if (elements?.toast) elements.toast.hidden = true;
  }, 2600);
}

async function renderAvatarPreview(preview, source, fallback, alt) {
  if (!preview) return;
  preview.replaceChildren();
  if (!source) {
    const fallbackNode = document.createElement('span');
    fallbackNode.textContent = fallback;
    preview.append(fallbackNode);
    preview.classList.remove('has-image');
    return;
  }

  const image = document.createElement('img');
  image.alt = alt;
  preview.append(image);
  preview.classList.add('has-image');

  if (source === 'idb:star' || source === 'idb:user') {
    try {
      const blob = await getAvatarBlob(source === 'idb:star' ? 'star' : 'user');
      if (!blob) throw new Error('avatar-missing');
      setBlobImage(image, blob);
    } catch {
      image.remove();
      const fallbackNode = document.createElement('span');
      fallbackNode.textContent = fallback;
      preview.append(fallbackNode);
      preview.classList.remove('has-image');
    }
    return;
  }

  image.src = source;
}

function renderAvatar() {
  const { avatar } = readCharacter();
  return renderAvatarPreview(elements?.avatarPreview, avatar, '星', '星回头像预览');
}

function renderUserAvatar() {
  const { userAvatar, userName } = readSettings();
  return renderAvatarPreview(elements?.userAvatarPreview, userAvatar, (userName || '我').slice(0, 1), '我的头像预览');
}
function syncAppearanceControls(settings = readSettings()) {
  if (!elements) return;

  elements.chatBackgroundType.value = settings.chatBackgroundType;
  elements.chatBackgroundColor.value = settings.chatBackgroundColor;
  if (elements.bubbleColor) elements.bubbleColor.value = settings.bubbleColor;
  if (elements.bubbleColorStar) elements.bubbleColorStar.value = settings.bubbleColorStar;
  elements.chatBackgroundFileName.textContent = settings.chatBackgroundType === 'image' && settings.chatBackgroundImage
    ? '已保存本地背景图片'
    : '未选择文件';

  viewRoot.querySelectorAll('[data-color-value]').forEach((button) => {
    const target = button.dataset.bubbleTarget === 'star' ? settings.bubbleColorStar : settings.bubbleColor;
    button.classList.toggle('is-selected', String(button.dataset.colorValue || '').toUpperCase() === String(target || '').toUpperCase());
  });
}

function syncProbability(key, value) {
  const range = elements?.[`${key}Range`];
  const number = elements?.[`${key}Number`];
  const output = elements?.[`${key}Output`];
  if (range) range.value = String(value);
  if (number) number.value = String(value);
  if (output) output.textContent = `${value}%`;
}

function syncSettings() {
  if (!elements) return;
  const settings = readSettings();

  elements.delayMin.value = String(settings.replyDelayMin);
  elements.delayMax.value = String(settings.replyDelayMax);
  elements.typingIndicator.checked = settings.typingIndicator;
  if (elements.multiReplyEnabled) elements.multiReplyEnabled.checked = settings.multiReplyEnabled;
  if (elements.multiReplyMin) elements.multiReplyMin.value = String(settings.multiReplyMin);
  if (elements.multiReplyMax) elements.multiReplyMax.value = String(settings.multiReplyMax);
  if (elements.multiReplyGapMin) elements.multiReplyGapMin.value = String(settings.multiReplyGapMin);
  if (elements.multiReplyGapMax) elements.multiReplyGapMax.value = String(settings.multiReplyGapMax);
  if (elements.spellCardEnabled) elements.spellCardEnabled.checked = settings.spellCardEnabled;
  if (elements.spellCardChance) elements.spellCardChance.value = String(settings.spellCardChance);
  if (elements.spellCardMin) elements.spellCardMin.value = String(settings.spellCardMin);
  if (elements.spellCardMax) elements.spellCardMax.value = String(settings.spellCardMax);
  if (elements.spellCardMode) elements.spellCardMode.value = settings.spellCardMode;
  if (elements.spellCardNewline) elements.spellCardNewline.checked = settings.spellCardNewline;
  if (elements.spellCardCustom) elements.spellCardCustom.value = settings.spellCardCustomSeparators.join('\n');
  elements.readNoReplyEnabled.checked = settings.readNoReplyEnabled;
  elements.readNoReplyNumber.disabled = !settings.readNoReplyEnabled;
  elements.readNoReplyRange.disabled = !settings.readNoReplyEnabled;

  syncProbability('readNoReply', settings.readNoReply);
  syncProbability('stickerReply', settings.stickerReply);
  syncProbability('patReply', settings.patReply);
  syncProbability('starFavorite', settings.starFavorite);
  syncProbability('starFavoriteCard', settings.starFavoriteCard);
  syncProbability('starFavoriteFeed', settings.starFavoriteFeed);
  syncProbability('feedPostChance', settings.feedPostChance);
  syncProbability('feedLikeProbability', settings.feedLikeProbability);
  syncProbability('feedCommentProbability', settings.feedCommentProbability);
  syncProbability('feedReplyProbability', settings.feedReplyProbability);
  syncProbability('feedReplyToCommentProbability', settings.feedReplyToCommentProbability);
  syncProbability('roastProbability', settings.roastProbability);

  if (elements.feedEnabled) elements.feedEnabled.checked = settings.feedEnabled;
  if (elements.feedAutoPost) elements.feedAutoPost.checked = settings.feedAutoPostEnabled;
  if (elements.feedIntervalMin) elements.feedIntervalMin.value = String(settings.feedPostIntervalMin);
  if (elements.feedIntervalMax) elements.feedIntervalMax.value = String(settings.feedPostIntervalMax);
  if (elements.feedDailyMax) elements.feedDailyMax.value = String(settings.feedDailyMax);
  if (elements.roastEnabled) elements.roastEnabled.checked = settings.roastEnabled;
  if (elements.roastInterval) elements.roastInterval.value = String(settings.roastIntervalMinutes);

  elements.promptQuestionnaireChance.value = String(settings.promptQuestionnaireChance);
  elements.promptQuestionnaireIntervalHours.value = String(settings.promptQuestionnaireIntervalHours);
  elements.showTimestamp.checked = settings.showTimestamp;
  elements.fontSize.value = settings.fontSize;
  if (elements.characterName) elements.characterName.value = readCharacter().name;
  if (elements.userName) elements.userName.value = settings.userName;
  syncAppearanceControls(settings);
  renderSpellCardPreview();

  renderAvatar();
  renderUserAvatar();
}

function saveDelayRange(preferMin = false) {
  const settings = readSettings();
  let min = Number(elements.delayMin.value);
  let max = Number(elements.delayMax.value);

  min = Number.isFinite(min) ? clamp(min, 0, 600) : settings.replyDelayMin;
  max = Number.isFinite(max) ? clamp(max, 0, 600) : settings.replyDelayMax;

  if (min > max) {
    if (preferMin) max = min;
    else min = max;
  }

  updateSettings({ replyDelayMin: min, replyDelayMax: max });
  elements.delayMin.value = String(min);
  elements.delayMax.value = String(max);
}

function saveProbability(key, value, minimum = null) {
  const settings = readSettings();
  const floor = minimum === null
    ? (key === "starFavorite" || key === "starFavoriteCard" || key === "starFavoriteFeed" || key === "roastProbability" || key.startsWith("feed") ? 0 : 1)
    : minimum;
  const next = enabledValue(value, settings[key] ?? DEFAULT_SETTINGS[key], floor);
  updateSettings({ [key]: next });
  syncProbability(key, next);
}

// 底部「保存」：把当前表单里的全部设置一次性写回，保证数值调节后可以统一确认。
function saveAllSettings() {
  const current = readSettings();
  const patch = {
    replyDelayMin: elements.delayMin.value,
    replyDelayMax: elements.delayMax.value,
    typingIndicator: elements.typingIndicator.checked,
    multiReplyEnabled: elements.multiReplyEnabled.checked,
    multiReplyMin: elements.multiReplyMin.value,
    multiReplyMax: elements.multiReplyMax.value,
    multiReplyGapMin: elements.multiReplyGapMin.value,
    multiReplyGapMax: elements.multiReplyGapMax.value,
    spellCardEnabled: elements.spellCardEnabled.checked,
    spellCardChance: elements.spellCardChance.value,
    spellCardMin: elements.spellCardMin.value,
    spellCardMax: elements.spellCardMax.value,
    spellCardMode: elements.spellCardMode.value,
    spellCardNewline: elements.spellCardNewline.checked,
    spellCardCustomSeparators: elements.spellCardCustom.value,
    readNoReplyEnabled: elements.readNoReplyEnabled.checked,
    readNoReply: elements.readNoReplyNumber.value,
    stickerReply: elements.stickerReplyNumber.value,
    patReply: elements.patReplyNumber.value,
    starFavorite: elements.starFavoriteNumber?.value ?? current.starFavorite,
    starFavoriteCard: elements.starFavoriteCardNumber?.value ?? current.starFavoriteCard,
    starFavoriteFeed: elements.starFavoriteFeedNumber?.value ?? current.starFavoriteFeed,
    bubbleColorStar: elements.bubbleColorStar?.value ?? current.bubbleColorStar,
    promptQuestionnaireChance: elements.promptQuestionnaireChance.value,
    promptQuestionnaireIntervalHours: elements.promptQuestionnaireIntervalHours.value,
    showTimestamp: elements.showTimestamp.checked,
    fontSize: elements.fontSize.value,
    userName: String(elements.userName?.value ?? current.userName),
    feedEnabled: elements.feedEnabled.checked,
    feedAutoPostEnabled: elements.feedAutoPost.checked,
    feedPostIntervalMin: elements.feedIntervalMin.value,
    feedPostIntervalMax: elements.feedIntervalMax.value,
    feedDailyMax: elements.feedDailyMax.value,
    feedPostChance: elements.feedPostChanceNumber.value,
    feedLikeProbability: elements.feedLikeProbabilityNumber.value,
    feedCommentProbability: elements.feedCommentProbabilityNumber.value,
    feedReplyProbability: elements.feedReplyProbabilityNumber.value,
    feedReplyToCommentProbability: elements.feedReplyToCommentProbabilityNumber.value,
    roastEnabled: elements.roastEnabled.checked,
    roastProbability: elements.roastProbabilityNumber.value,
    roastIntervalMinutes: elements.roastInterval.value,
    chatBackgroundType: elements.chatBackgroundType.value,
    chatBackgroundColor: elements.chatBackgroundColor.value,
    bubbleColor: elements.bubbleColor.value,
  };

  const saved = updateSettings(patch);
  if (!saved) {
    showToast('保存失败，浏览器存储空间可能不足。', 'warning');
    return;
  }

  const starName = String(elements.characterName?.value || '').trim().slice(0, 20);
  if (starName && starName !== readCharacter().name) {
    writeCharacter({ ...readCharacter(), name: starName });
  }

  syncSettings();
  showToast('设置已保存');
}

const SPELL_PREVIEW_SAMPLES = ['今天天气很好', '想和你一起散步', '记得早点休息', '晚点再聊', '晚安'];

// 直接读表单当前值（而不是已保存值），做到输入时即时预览
function currentSpellFormSettings() {
  const settings = readSettings();
  const numberOr = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };
  return normalizeSettings({
    ...settings,
    spellCardChance: elements?.spellCardChance ? numberOr(elements.spellCardChance.value, settings.spellCardChance) : settings.spellCardChance,
    spellCardMin: elements?.spellCardMin ? numberOr(elements.spellCardMin.value, settings.spellCardMin) : settings.spellCardMin,
    spellCardMax: elements?.spellCardMax ? numberOr(elements.spellCardMax.value, settings.spellCardMax) : settings.spellCardMax,
    spellCardMode: elements?.spellCardMode?.value || settings.spellCardMode,
    spellCardNewline: elements?.spellCardNewline ? elements.spellCardNewline.checked : settings.spellCardNewline,
    spellCardCustomSeparators: elements?.spellCardCustom ? elements.spellCardCustom.value : settings.spellCardCustomSeparators,
  });
}

function renderSpellCardPreview() {
  if (!elements?.spellCardPreview) return;
  const options = currentSpellFormSettings();

  if (elements.spellCardSummary) {
    const modeLabel = options.spellCardMode === 'split' ? '逐张多条' : (options.spellCardMode === 'each' ? '连发时每条都拼接' : '拼成一条');
    const extras = [];
    if (options.spellCardNewline) extras.push('含换行');
    if (options.spellCardCustomSeparators.length) extras.push('自定义 ' + options.spellCardCustomSeparators.length + ' 个');
    const prefix = options.spellCardEnabled ? '' : '未启用 · ';
    elements.spellCardSummary.textContent = prefix + options.spellCardChance + '% 概率 · 每次 ' + options.spellCardMin + '-' + options.spellCardMax + ' 张 · ' + modeLabel + (extras.length ? ' · ' + extras.join(' · ') : '');
  }

  const count = Math.max(1, Math.min(options.spellCardMin, SPELL_PREVIEW_SAMPLES.length));
  const segments = SPELL_PREVIEW_SAMPLES.slice(0, count);
  elements.spellCardPreview.textContent = options.spellCardMode === 'split'
    ? segments.map((segment, index) => (index + 1) + '. ' + segment).join('\n')
    : joinSpellCards(segments, options);
}

function handleRangeInput(event) {
  const target = event.target;
  const delaySetting = target.dataset.setting;
  if (delaySetting && delaySetting.indexOf('spell-card-') === 0) {
    renderSpellCardPreview();
    return;
  }
  if (delaySetting === 'prompt-questionnaire-chance' || delaySetting === 'prompt-questionnaire-interval') {
    handleSettingsChange(event);
    return;
  }
  if (delaySetting === 'delay-min' || delaySetting === 'delay-max') {
    if (elements.delayMin.value === '' || elements.delayMax.value === '') return;
    window.clearTimeout(delayInputTimer);
    delayInputTimer = window.setTimeout(() => {
      saveDelayRange(delaySetting === 'delay-min');
    }, 120);
    return;
  }

  if (target.dataset.setting === 'probability-number') {
    saveProbability(target.dataset.probability, target.value);
    return;
  }

  const range = target.closest('[data-probability-range]');
  if (!range) return;
  saveProbability(range.dataset.probabilityRange, range.value);
}

function handleSettingsChange(event) {
  const target = event.target;
  const setting = target.dataset.setting;

  if (setting === 'delay-min' || setting === 'delay-max') {
    saveDelayRange(setting === 'delay-min');
    return;
  }

  if (setting === 'probability-number') {
    saveProbability(target.dataset.probability, target.value);
    return;
  }

  if (setting === 'typing-indicator') {
    updateSettings({ typingIndicator: target.checked });
    return;
  }

  if (setting === 'multi-reply-enabled') {
    updateSettings({ multiReplyEnabled: target.checked });
    return;
  }

  if (setting === 'multi-reply-min' || setting === 'multi-reply-max') {
    updateSettings({
      multiReplyMin: setting === 'multi-reply-min' ? target.value : elements.multiReplyMin.value,
      multiReplyMax: setting === 'multi-reply-max' ? target.value : elements.multiReplyMax.value,
    });
    syncSettings();
    return;
  }

  if (setting === 'multi-reply-gap-min' || setting === 'multi-reply-gap-max') {
    updateSettings({
      multiReplyGapMin: setting === 'multi-reply-gap-min' ? target.value : elements.multiReplyGapMin.value,
      multiReplyGapMax: setting === 'multi-reply-gap-max' ? target.value : elements.multiReplyGapMax.value,
    });
    syncSettings();
    return;
  }

  if (setting === 'spell-card-enabled') {
    updateSettings({ spellCardEnabled: target.checked });
    renderSpellCardPreview();
    return;
  }

  if (setting === 'spell-card-newline') {
    updateSettings({ spellCardNewline: target.checked });
    renderSpellCardPreview();
    return;
  }

  if (setting === 'spell-card-custom') {
    updateSettings({ spellCardCustomSeparators: target.value });
    target.value = readSettings().spellCardCustomSeparators.join('\n');
    renderSpellCardPreview();
    return;
  }

  if (setting === 'spell-card-chance') {
    updateSettings({ spellCardChance: target.value });
    target.value = String(readSettings().spellCardChance);
    renderSpellCardPreview();
    return;
  }

  if (setting === 'spell-card-min' || setting === 'spell-card-max') {
    updateSettings({
      spellCardMin: setting === 'spell-card-min' ? target.value : elements.spellCardMin.value,
      spellCardMax: setting === 'spell-card-max' ? target.value : elements.spellCardMax.value,
    });
    syncSettings();
    return;
  }

  if (setting === 'spell-card-mode') {
    updateSettings({ spellCardMode: target.value });
    renderSpellCardPreview();
    return;
  }

  if (setting === 'read-no-reply-enabled') {
    updateSettings({ readNoReplyEnabled: target.checked });
    target.disabled = false;
    elements.readNoReplyNumber.disabled = !target.checked;
    elements.readNoReplyRange.disabled = !target.checked;
    return;
  }

  if (setting === 'prompt-questionnaire-chance') {
    updateSettings({ promptQuestionnaireChance: Math.min(100, Math.max(0, Number(target.value) || 0)) });
    return;
  }

  if (setting === 'prompt-questionnaire-interval') {
    updateSettings({ promptQuestionnaireIntervalHours: Math.min(12, Math.max(0, Number(target.value) || 0)) });
    return;
  }

  if (setting === 'show-timestamp') {
    updateSettings({ showTimestamp: target.checked });
    return;
  }

  if (setting === 'font-size') {
    updateSettings({ fontSize: target.value });
    return;
  }

  if (setting === 'character-name') {
    const name = target.value.trim().slice(0, 20) || readCharacter().name;
    writeCharacter({ ...readCharacter(), name });
    target.value = name;
    return;
  }

  if (setting === 'user-name') {
    const name = target.value.trim().slice(0, 20) || DEFAULT_SETTINGS.userName;
    updateSettings({ userName: name });
    target.value = name;
    return;
  }

  if (setting === 'chat-background-type') {
    updateSettings({ chatBackgroundType: target.value });
    syncAppearanceControls();
    return;
  }

  if (setting === 'chat-background-color') {
    updateSettings({ chatBackgroundColor: target.value, chatBackgroundType: 'color' });
    syncAppearanceControls();
    return;
  }

  if (setting === 'bubble-color') {
    updateSettings({ bubbleColor: target.value });
    syncAppearanceControls();
    return;
  }

  if (setting === "feed-enabled") { updateSettings({ feedEnabled: target.checked }); return; }
  if (setting === "feed-auto-post") { updateSettings({ feedAutoPostEnabled: target.checked }); return; }
  if (setting === "feed-interval-min" || setting === "feed-interval-max") {
    updateSettings({
      feedPostIntervalMin: setting === "feed-interval-min" ? target.value : elements.feedIntervalMin.value,
      feedPostIntervalMax: setting === "feed-interval-max" ? target.value : elements.feedIntervalMax.value,
    });
    syncSettings();
    return;
  }
  if (setting === "feed-daily-max") { updateSettings({ feedDailyMax: target.value }); syncSettings(); return; }
  if (setting === "bubble-color-star") {
    updateSettings({ bubbleColorStar: target.value });
    syncAppearanceControls();
    return;
  }
  if (setting === "roast-enabled") { updateSettings({ roastEnabled: target.checked }); return; }
  if (setting === "roast-interval") { updateSettings({ roastIntervalMinutes: target.value }); syncSettings(); return; }
}

function handleChatBackgroundUpload(event) {
  const [file] = event.target.files || [];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('请选择本地图片文件。', 'warning');
    event.target.value = '';
    return;
  }

  if (file.size > MAX_CHAT_BACKGROUND_BYTES) {
    showToast('聊天背景图片不能超过 2MB。', 'warning');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const image = typeof reader.result === 'string' ? reader.result : '';
    if (!image.startsWith('data:image/')) {
      showToast('图片读取失败，请重试。', 'warning');
      return;
    }

    const saved = updateSettings({ chatBackgroundType: 'image', chatBackgroundImage: image });
    if (!saved) {
      showToast('背景保存失败，图片可能过大。', 'warning');
      return;
    }

    syncAppearanceControls();
    showToast('聊天背景已更新并即时生效。');
  });
  reader.addEventListener('error', () => showToast('图片读取失败，请重试。', 'warning'));
  reader.readAsDataURL(file);
}

async function saveAvatarFile(file, avatarId, onSaved, onError) {
  if (!file?.type?.startsWith('image/')) {
    showToast('请选择本地图片文件。', 'warning');
    return;
  }
  try {
    await putAvatarBlob(avatarId, file, { createdAt: Date.now() });
    onSaved(file);
  } catch {
    onError();
  }
}

function handleAvatarUpload(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  void saveAvatarFile(
    file,
    'star',
    (selectedFile) => {
      const saved = writeCharacter({ ...readCharacter(), avatar: 'idb:star' });
      if (!saved) {
        showToast('头像保存失败，请检查浏览器存储空间。', 'warning');
        return;
      }
      elements.avatarFileName.textContent = selectedFile.name;
      void renderAvatar();
      showToast('星回头像已更新并即时生效。');
    },
    () => showToast('头像保存失败，请检查浏览器存储空间。', 'warning'),
  );
}

function handleUserAvatarUpload(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  void saveAvatarFile(
    file,
    'user',
    (selectedFile) => {
      const saved = updateSettings({ userAvatar: 'idb:user' });
      if (!saved) {
        showToast('头像保存失败，请检查浏览器存储空间。', 'warning');
        return;
      }
      elements.userAvatarFileName.textContent = selectedFile.name;
      void renderUserAvatar();
      showToast('我的头像已更新并即时生效。');
    },
    () => showToast('头像保存失败，请检查浏览器存储空间。', 'warning'),
  );
}
function handleClick(event) {
  const actionButton = event.target.closest('[data-settings-action]');
  if (!actionButton) return;

  const action = actionButton.dataset.settingsAction;
  if (action === 'login') showToast('登录功能已预留，本版本不连接账号服务。');
  if (action === 'register') showToast('注册功能已预留，本版本不连接账号服务。');
  if (action === 'clear-avatar') {
    writeCharacter({ ...readCharacter(), avatar: '' });
    elements.avatarInput.value = '';
    elements.avatarFileName.textContent = '未选择文件';
    void deleteAvatarBlob('star').catch(() => {});
    void renderAvatar();
    showToast('已恢复默认星回头像。');
  }
  if (action === 'clear-user-avatar') {
    updateSettings({ userAvatar: '' });
    elements.userAvatarInput.value = '';
    elements.userAvatarFileName.textContent = '未选择文件';
    void deleteAvatarBlob('user').catch(() => {});
    void renderUserAvatar();
    showToast('已恢复默认我的头像。');
  }
  if (action === 'save-all') {
    saveAllSettings();
    return;
  }
  if (action === 'set-bubble-color') {
    const isStar = actionButton.dataset.bubbleTarget === 'star';
    updateSettings(isStar ? { bubbleColorStar: actionButton.dataset.colorValue } : { bubbleColor: actionButton.dataset.colorValue });
    syncAppearanceControls();
    showToast(isStar ? '对方气泡颜色已更新。' : '我的气泡颜色已更新。');
    return;
  }
  if (action === 'set-bubble-scheme') {
    updateSettings({
      bubbleColor: actionButton.dataset.bubbleUser,
      bubbleColorStar: actionButton.dataset.bubbleStar,
    });
    syncAppearanceControls();
    showToast('已应用配色方案。');
    return;
  }
  if (action === 'clear-chat-background') {
    updateSettings({ chatBackgroundType: 'color', chatBackgroundImage: '' });
    elements.chatBackgroundInput.value = '';
    syncAppearanceControls();
    showToast('已恢复纯色聊天背景。');
  }
}

function bindEvents() {
  if (!viewRoot || eventsBound) return;

  viewRoot.addEventListener('input', handleRangeInput);
  viewRoot.addEventListener('change', (event) => {
    if (event.target === elements.userAvatarInput) {
      handleUserAvatarUpload(event);
      return;
    }
    if (event.target === elements.avatarInput) {
      handleAvatarUpload(event);
      return;
    }
    if (event.target === elements.chatBackgroundInput) {
      handleChatBackgroundUpload(event);
      return;
    }
    handleSettingsChange(event);
  });
  viewRoot.addEventListener('click', handleClick);
  eventsBound = true;
}

export function initSettingsView(root = document.getElementById('view-settings')) {
  if (!root) return false;

  viewRoot = root;
  viewRoot.innerHTML = `
    <div class="settings-page">
      <header class="settings-header">
        <p class="settings-eyebrow">PREFERENCES</p>
        <h2 class="settings-title">设置</h2>
        <p class="settings-intro">调整星回的回复方式、头像与界面外观。所有数据只保存在本机浏览器。</p>
      </header>

      <section class="settings-card" aria-labelledby="settingsAccountTitle">
        <div class="settings-card__heading">
          <div>
            <p class="settings-kicker">账号</p>
            <h3 id="settingsAccountTitle">登录与注册</h3>
          </div>
          <span class="settings-badge">预留</span>
        </div>
        <p class="settings-description">按钮仅作界面预留，不会发起网络请求，也不会写入登录状态。</p>
        <div class="settings-actions">
          <button class="settings-button settings-button--primary" type="button" data-settings-action="login">登录</button>
          <button class="settings-button" type="button" data-settings-action="register">注册</button>
        </div>
      </section>

      <section class="settings-card" aria-labelledby="settingsChatTitle">
        <div class="settings-card__heading">
          <div>
            <p class="settings-kicker">聊天设置</p>
            <h3 id="settingsChatTitle">回复节奏</h3>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field__label">
            <span>回复延迟范围</span>
            <small>0–600 秒，默认 1–3 秒</small>
          </div>
          <div class="settings-delay-row">
            <label>
              <span>最短</span>
              <input id="settingDelayMin" data-setting="delay-min" type="number" min="0" max="600" step="1" inputmode="numeric" />
            </label>
            <span class="settings-delay-separator">至</span>
            <label>
              <span>最长</span>
              <input id="settingDelayMax" data-setting="delay-max" type="number" min="0" max="600" step="1" inputmode="numeric" />
            </label>
            <span class="settings-unit">秒</span>
          </div>
        </div>

        <label class="settings-switch-row">
          <span>
            <strong>正在输入</strong>
            <small>等待回复时显示“对方正在输入…”</small>
          </span>
          <span class="settings-switch">
            <input id="settingTypingIndicator" data-setting="typing-indicator" type="checkbox" />
            <span aria-hidden="true"></span>
          </span>
        </label>

        <label class="settings-switch-row">
          <span>
            <strong>字卡连发</strong>
            <small>开启后星回一次会连发多条字卡消息</small>
          </span>
          <span class="settings-switch">
            <input id="settingMultiReplyEnabled" data-setting="multi-reply-enabled" type="checkbox" />
            <span aria-hidden="true"></span>
          </span>
        </label>

        <div class="settings-field">
          <div class="settings-field__label">
            <span>连发条数</span>
            <small>最少 1 条，最多 10 条</small>
          </div>
          <div class="settings-delay-row">
            <label>
              <span>最少</span>
              <input id="settingMultiReplyMin" data-setting="multi-reply-min" type="number" min="1" max="10" step="1" inputmode="numeric" />
            </label>
            <span class="settings-delay-separator">至</span>
            <label>
              <span>最多</span>
              <input id="settingMultiReplyMax" data-setting="multi-reply-max" type="number" min="1" max="10" step="1" inputmode="numeric" />
            </label>
            <span class="settings-unit">条</span>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field__label">
            <span>连发间隔</span>
            <small>每条消息之间的等待时间</small>
          </div>
          <div class="settings-delay-row">
            <label>
              <span>最少</span>
              <input id="settingMultiReplyGapMin" data-setting="multi-reply-gap-min" type="number" min="0.2" max="10" step="0.1" inputmode="decimal" />
            </label>
            <span class="settings-delay-separator">至</span>
            <label>
              <span>最多</span>
              <input id="settingMultiReplyGapMax" data-setting="multi-reply-gap-max" type="number" min="0.2" max="10" step="0.1" inputmode="decimal" />
            </label>
            <span class="settings-unit">秒</span>
          </div>
        </div>
        <div class="settings-field settings-field--inline">
          <label for="settingPromptQuestionnaireChance">
            <strong>星回随机发题概率</strong>
            <small>0%–100%，默认 30%</small>
          </label>
          <input class="settings-number-input" id="settingPromptQuestionnaireChance" data-setting="prompt-questionnaire-chance" type="number" min="0" max="100" step="1" inputmode="numeric" />
        </div>

        <div class="settings-field settings-field--inline">
          <label for="settingPromptQuestionnaireIntervalHours">
            <strong>发题间隔</strong>
            <small>0–12 小时，默认 0.5</small>
          </label>
          <input class="settings-number-input" id="settingPromptQuestionnaireIntervalHours" data-setting="prompt-questionnaire-interval" type="number" min="0" max="12" step="0.5" inputmode="decimal" />
        </div>

        <div class="settings-field settings-field--probability">
          <label class="settings-switch-row settings-switch-row--compact" for="settingReadNoReplyEnabled">
            <span>
              <strong>已读不回</strong>
              <small>命中时只标记已读，不发送回复</small>
            </span>
            <span class="settings-switch">
              <input id="settingReadNoReplyEnabled" data-setting="read-no-reply-enabled" type="checkbox" />
              <span aria-hidden="true"></span>
            </span>
          </label>
          <div class="settings-probability" data-probability-control="readNoReply">
            <input id="settingReadNoReplyRange" data-probability-range="readNoReply" type="range" min="1" max="100" step="1" />
            <label>
              <input id="settingReadNoReplyNumber" data-setting="probability-number" data-probability="readNoReply" type="number" min="1" max="100" step="1" inputmode="numeric" />
              <span>%</span>
            </label>
            <output id="settingReadNoReplyOutput">15%</output>
          </div>
        </div>
      </section>
      <section class="settings-card" aria-labelledby="settingsSpellCardTitle">
        <div class="settings-card__heading">
          <div>
            <p class="settings-kicker">拼接</p>
            <h3 id="settingsSpellCardTitle">拼接字卡</h3>
          </div>
        </div>

        <label class="settings-switch-row">
          <span>
            <strong>启用拼接字卡</strong>
            <small>从字卡库抽多张字卡拼成一句话或逐条发送</small>
          </span>
          <span class="settings-switch">
            <input id="settingSpellCardEnabled" data-setting="spell-card-enabled" type="checkbox" />
            <span aria-hidden="true"></span>
          </span>
        </label>

        <div class="settings-field settings-field--inline">
          <label for="settingSpellCardChance">
            <strong>拼接触发概率</strong>
            <small>1%–100%，默认 15%</small>
          </label>
          <input class="settings-number-input" id="settingSpellCardChance" data-setting="spell-card-chance" type="number" min="1" max="100" step="1" inputmode="numeric" />
        </div>

        <div class="settings-field">
          <div class="settings-field__label">
            <span>拼接字卡数</span>
            <small>每次抽取 1–10 张字卡</small>
          </div>
          <div class="settings-delay-row">
            <label>
              <span>最少</span>
              <input id="settingSpellCardMin" data-setting="spell-card-min" type="number" min="1" max="10" step="1" inputmode="numeric" />
            </label>
            <span class="settings-delay-separator">至</span>
            <label>
              <span>最多</span>
              <input id="settingSpellCardMax" data-setting="spell-card-max" type="number" min="1" max="10" step="1" inputmode="numeric" />
            </label>
            <span class="settings-unit">张</span>
          </div>
        </div>

        <div class="settings-field settings-field--inline">
          <label for="settingSpellCardMode">
            <strong>发送形态</strong>
            <small>单气泡拼成一句，或逐张分条发送</small>
          </label>
          <select id="settingSpellCardMode" data-setting="spell-card-mode">
            <option value="single">拼成一条</option>
            <option value="split">逐张多条</option>
            <option value="each">连发时每条都拼接</option>
          </select>
        </div>

        <label class="settings-switch-row">
          <span>
            <strong>换行连接符</strong>
            <small>拼接时随机用换行分隔两张字卡</small>
          </span>
          <span class="settings-switch">
            <input id="settingSpellCardNewline" data-setting="spell-card-newline" type="checkbox" />
            <span aria-hidden="true"></span>
          </span>
        </label>

        <div class="settings-field">
          <div class="settings-field__label">
            <span>自定义连接符</span>
            <small>每行一个，例如：～、…、🌙</small>
          </div>
          <textarea class="settings-textarea" id="settingSpellCardCustom" data-setting="spell-card-custom" rows="3" placeholder="每行一个连接符"></textarea>
        </div>

        <div class="settings-preview" id="spellCardPreviewBox">
          <p class="settings-preview__summary" id="spellCardSummary">—</p>
          <p class="settings-preview__text" id="spellCardPreview">—</p>
        </div>
      </section>
      <section class="settings-card" aria-labelledby="settingsProbabilityTitle">
        <div class="settings-card__heading">
          <div>
            <p class="settings-kicker">回复概率</p>
            <h3 id="settingsProbabilityTitle">内容偏好</h3>
          </div>
        </div>

        <div class="settings-field settings-field--probability">
          <div class="settings-field__label">
            <span>星回回表情包</span>
            <small>1%–100%，默认 10%</small>
          </div>
          <div class="settings-probability" data-probability-control="stickerReply">
            <input id="settingStickerReplyRange" data-probability-range="stickerReply" type="range" min="1" max="100" step="1" />
            <label>
              <input id="settingStickerReplyNumber" data-setting="probability-number" data-probability="stickerReply" type="number" min="1" max="100" step="1" inputmode="numeric" />
              <span>%</span>
            </label>
            <output id="settingStickerReplyOutput">10%</output>
          </div>
        </div>

        <div class="settings-field settings-field--probability">
          <div class="settings-field__label">
            <span>拍一拍回复</span>
            <small>1%–100%，默认 70%，不回概率为剩余百分比</small>
          </div>
          <div class="settings-probability" data-probability-control="patReply">
            <input id="settingPatReplyRange" data-probability-range="patReply" type="range" min="1" max="100" step="1" />
            <label>
              <input id="settingPatReplyNumber" data-setting="probability-number" data-probability="patReply" type="number" min="1" max="100" step="1" inputmode="numeric" />
              <span>%</span>
            </label>
            <output id="settingPatReplyOutput">70%</output>
          </div>
        </div>
      </section>

      <section class="settings-card" aria-labelledby="settingsFavoriteTitle">
        <div class="settings-card__heading">
          <div>
            <p class="settings-kicker">收藏</p>
            <h3 id="settingsFavoriteTitle">收藏概率</h3>
          </div>
        </div>
        <div class="settings-field settings-field--probability">
          <div class="settings-field__label">
            <span>星回自动收藏·聊天</span>
            <small>0%–100%，默认 30%；命中后我发出的聊天消息会被标记为「梦角收藏」</small>
          </div>
          <div class="settings-probability" data-probability-control="starFavorite">
            <input id="settingStarFavoriteRange" data-probability-range="starFavorite" type="range" min="0" max="100" step="1" />
            <label>
              <input id="settingStarFavoriteNumber" data-setting="probability-number" data-probability="starFavorite" type="number" min="0" max="100" step="1" inputmode="numeric" />
              <span>%</span>
            </label>
            <output id="settingStarFavoriteOutput">30%</output>
          </div>
        </div>
        <div class="settings-field settings-field--probability">
          <div class="settings-field__label">
            <span>星回自动收藏·卡片</span>
            <small>0%–100%，默认 30%；命中后我发的问卷卡片会被收藏</small>
          </div>
          <div class="settings-probability" data-probability-control="starFavoriteCard">
            <input id="settingStarFavoriteCardRange" data-probability-range="starFavoriteCard" type="range" min="0" max="100" step="1" />
            <label>
              <input id="settingStarFavoriteCardNumber" data-setting="probability-number" data-probability="starFavoriteCard" type="number" min="0" max="100" step="1" inputmode="numeric" />
              <span>%</span>
            </label>
            <output id="settingStarFavoriteCardOutput">30%</output>
          </div>
        </div>

        <div class="settings-field settings-field--probability">
          <div class="settings-field__label">
            <span>星回自动收藏·朋友圈</span>
            <small>0%–100%，默认 30%；命中后我发的朋友圈会被收藏</small>
          </div>
          <div class="settings-probability" data-probability-control="starFavoriteFeed">
            <input id="settingStarFavoriteFeedRange" data-probability-range="starFavoriteFeed" type="range" min="0" max="100" step="1" />
            <label>
              <input id="settingStarFavoriteFeedNumber" data-setting="probability-number" data-probability="starFavoriteFeed" type="number" min="0" max="100" step="1" inputmode="numeric" />
              <span>%</span>
            </label>
            <output id="settingStarFavoriteFeedOutput">30%</output>
          </div>
        </div>
      </section>

      <section class="settings-card" aria-labelledby="settingsFeedTitle">
        <div class="settings-card__heading">
          <div>
            <p class="settings-kicker">朋友圈</p>
            <h3 id="settingsFeedTitle">朋友圈互动</h3>
          </div>
        </div>

        <label class="settings-switch-row">
          <span>
            <strong>开启朋友圈</strong>
            <small>关闭后星回不再自动发动态</small>
          </span>
          <span class="settings-switch">
            <input id="settingFeedEnabled" data-setting="feed-enabled" type="checkbox" />
            <span aria-hidden="true"></span>
          </span>
        </label>

        <label class="settings-switch-row">
          <span>
            <strong>星回自动发动态</strong>
            <small>按下面的间隔随机发布</small>
          </span>
          <span class="settings-switch">
            <input id="settingFeedAutoPost" data-setting="feed-auto-post" type="checkbox" />
            <span aria-hidden="true"></span>
          </span>
        </label>

        <div class="settings-field">
          <div class="settings-field__label">
            <span>发动态间隔</span>
            <small>1–1440 分钟，默认 30–180 分钟</small>
          </div>
          <div class="settings-delay-row">
            <label>
              <span>最短</span>
              <input id="settingFeedIntervalMin" data-setting="feed-interval-min" type="number" min="1" max="1440" step="1" inputmode="numeric" />
            </label>
            <span class="settings-delay-separator">至</span>
            <label>
              <span>最长</span>
              <input id="settingFeedIntervalMax" data-setting="feed-interval-max" type="number" min="1" max="1440" step="1" inputmode="numeric" />
            </label>
            <span class="settings-unit">分钟</span>
          </div>
        </div>

        <div class="settings-field settings-field--inline">
          <label for="settingFeedDailyMax">
            <strong>每天最多发动态</strong>
            <small>1–24 条，默认 4 条</small>
          </label>
          <input class="settings-number-input" id="settingFeedDailyMax" data-setting="feed-daily-max" type="number" min="1" max="24" step="1" inputmode="numeric" />
        </div>
        <div class="settings-field settings-field--probability">
          <div class="settings-field__label">
            <span>到点发动态概率</span>
            <small>0%–100%，默认 50%</small>
          </div>
          <div class="settings-probability" data-probability-control="feedPostChance">
            <input id="settingFeedPostChanceRange" data-probability-range="feedPostChance" type="range" min="0" max="100" step="1" />
            <label>
              <input id="settingFeedPostChanceNumber" data-setting="probability-number" data-probability="feedPostChance" type="number" min="0" max="100" step="1" inputmode="numeric" />
              <span>%</span>
            </label>
            <output id="settingFeedPostChanceOutput">0%</output>
          </div>
        </div>
        <div class="settings-field settings-field--probability">
          <div class="settings-field__label">
            <span>星回点赞我的动态</span>
            <small>0%–100%，默认 60%</small>
          </div>
          <div class="settings-probability" data-probability-control="feedLikeProbability">
            <input id="settingFeedLikeProbabilityRange" data-probability-range="feedLikeProbability" type="range" min="0" max="100" step="1" />
            <label>
              <input id="settingFeedLikeProbabilityNumber" data-setting="probability-number" data-probability="feedLikeProbability" type="number" min="0" max="100" step="1" inputmode="numeric" />
              <span>%</span>
            </label>
            <output id="settingFeedLikeProbabilityOutput">0%</output>
          </div>
        </div>
        <div class="settings-field settings-field--probability">
          <div class="settings-field__label">
            <span>星回评论我的动态</span>
            <small>0%–100%，默认 75%</small>
          </div>
          <div class="settings-probability" data-probability-control="feedCommentProbability">
            <input id="settingFeedCommentProbabilityRange" data-probability-range="feedCommentProbability" type="range" min="0" max="100" step="1" />
            <label>
              <input id="settingFeedCommentProbabilityNumber" data-setting="probability-number" data-probability="feedCommentProbability" type="number" min="0" max="100" step="1" inputmode="numeric" />
              <span>%</span>
            </label>
            <output id="settingFeedCommentProbabilityOutput">0%</output>
          </div>
        </div>
        <div class="settings-field settings-field--probability">
          <div class="settings-field__label">
            <span>星回回应我的评论</span>
            <small>0%–100%，默认 50%</small>
          </div>
          <div class="settings-probability" data-probability-control="feedReplyProbability">
            <input id="settingFeedReplyProbabilityRange" data-probability-range="feedReplyProbability" type="range" min="0" max="100" step="1" />
            <label>
              <input id="settingFeedReplyProbabilityNumber" data-setting="probability-number" data-probability="feedReplyProbability" type="number" min="0" max="100" step="1" inputmode="numeric" />
              <span>%</span>
            </label>
            <output id="settingFeedReplyProbabilityOutput">0%</output>
          </div>
        </div>
        <div class="settings-field settings-field--probability">
          <div class="settings-field__label">
            <span>回应时回复我（而非新评论）</span>
            <small>0%–100%，默认 50%</small>
          </div>
          <div class="settings-probability" data-probability-control="feedReplyToCommentProbability">
            <input id="settingFeedReplyToCommentProbabilityRange" data-probability-range="feedReplyToCommentProbability" type="range" min="0" max="100" step="1" />
            <label>
              <input id="settingFeedReplyToCommentProbabilityNumber" data-setting="probability-number" data-probability="feedReplyToCommentProbability" type="number" min="0" max="100" step="1" inputmode="numeric" />
              <span>%</span>
            </label>
            <output id="settingFeedReplyToCommentProbabilityOutput">0%</output>
          </div>
        </div>
      </section>

      <section class="settings-card" aria-labelledby="settingsRoastTitle">
        <div class="settings-card__heading">
          <div>
            <p class="settings-kicker">互动</p>
            <h3 id="settingsRoastTitle">他的吐槽</h3>
          </div>
        </div>

        <label class="settings-switch-row">
          <span>
            <strong>开启他的吐槽</strong>
            <small>星回偶尔主动吐槽你一句，内容取自字卡页的「他的吐槽」</small>
          </span>
          <span class="settings-switch">
            <input id="settingRoastEnabled" data-setting="roast-enabled" type="checkbox" />
            <span aria-hidden="true"></span>
          </span>
        </label>
        <div class="settings-field settings-field--probability">
          <div class="settings-field__label">
            <span>吐槽概率</span>
            <small>0%–100%，默认 8%</small>
          </div>
          <div class="settings-probability" data-probability-control="roastProbability">
            <input id="settingRoastProbabilityRange" data-probability-range="roastProbability" type="range" min="0" max="100" step="1" />
            <label>
              <input id="settingRoastProbabilityNumber" data-setting="probability-number" data-probability="roastProbability" type="number" min="0" max="100" step="1" inputmode="numeric" />
              <span>%</span>
            </label>
            <output id="settingRoastProbabilityOutput">0%</output>
          </div>
        </div>

        <div class="settings-field settings-field--inline">
          <label for="settingRoastInterval">
            <strong>吐槽冷却</strong>
            <small>两次吐槽至少间隔 0–1440 分钟，默认 20 分钟</small>
          </label>
          <input class="settings-number-input" id="settingRoastInterval" data-setting="roast-interval" type="number" min="0" max="1440" step="1" inputmode="numeric" />
        </div>
      </section>

      <section class="settings-card" aria-labelledby="settingsAvatarTitle">
        <div class="settings-card__heading">
          <div>
            <p class="settings-kicker">头像</p>
            <h3 id="settingsAvatarTitle">星回头像与昵称</h3>
          </div>
        </div>
        <div class="settings-field settings-field--inline">
          <label for="settingCharacterName">
            <strong>星回昵称</strong>
            <small>用于聊天顶栏和消息称呼</small>
          </label>
          <input class="settings-text-input" id="settingCharacterName" data-setting="character-name" type="text" maxlength="20" autocomplete="off" />
        </div>
        <div class="settings-avatar">
          <span class="settings-avatar__preview" id="settingsAvatarPreview" aria-hidden="true"><span>星</span></span>
          <div class="settings-avatar__copy">
            <strong>上传本地图片</strong>
            <small>支持常见图片格式，原图保存在 IndexedDB 并即时生效。</small>
            <div class="settings-avatar__actions">
              <label class="settings-button settings-button--primary" for="settingsAvatarInput">选择图片</label>
              <input class="settings-file-input" id="settingsAvatarInput" type="file" accept="image/*" />
              <button class="settings-text-button" type="button" data-settings-action="clear-avatar">恢复默认</button>
            </div>
            <span class="settings-file-name" id="settingsAvatarFileName">未选择文件</span>
          </div>
        </div>
      </section>

      <section class="settings-card" aria-labelledby="settingsUserAvatarTitle">
        <div class="settings-card__heading">
          <div>
            <p class="settings-kicker">头像</p>
            <h3 id="settingsUserAvatarTitle">我的头像与昵称</h3>
          </div>
        </div>
        <div class="settings-field settings-field--inline">
          <label for="settingUserName">
            <strong>我的昵称</strong>
            <small>用于我的头像占位和消息称呼</small>
          </label>
          <input class="settings-text-input" id="settingUserName" data-setting="user-name" type="text" maxlength="20" autocomplete="off" />
        </div>
        <div class="settings-avatar">
          <span class="settings-avatar__preview" id="settingsUserAvatarPreview" aria-hidden="true"><span>我</span></span>
          <div class="settings-avatar__copy">
            <strong>上传本地图片</strong>
            <small>用于聊天气泡旁的用户头像，原图保存在 IndexedDB。</small>
            <div class="settings-avatar__actions">
              <label class="settings-button settings-button--primary" for="settingsUserAvatarInput">选择图片</label>
              <input class="settings-file-input" id="settingsUserAvatarInput" type="file" accept="image/*" />
              <button class="settings-text-button" type="button" data-settings-action="clear-user-avatar">恢复默认</button>
            </div>
            <span class="settings-file-name" id="settingsUserAvatarFileName">未选择文件</span>
          </div>
        </div>
      </section>

      <section class="settings-card" aria-labelledby="settingsAppearanceTitle">
        <div class="settings-card__heading">
          <div>
            <p class="settings-kicker">外观</p>
            <h3 id="settingsAppearanceTitle">聊天外观与显示</h3>
          </div>
        </div>

        <fieldset class="settings-fieldset settings-chat-appearance">
          <legend>聊天背景</legend>
          <div class="settings-field settings-field--inline settings-field--flush">
            <label for="settingChatBackgroundType">
              <strong>背景类型</strong>
              <small>纯色或保存在本机的图片</small>
            </label>
            <select id="settingChatBackgroundType" data-setting="chat-background-type">
              <option value="color">纯色</option>
              <option value="image">本地图片</option>
            </select>
          </div>
          <div class="settings-field settings-field--inline settings-field--flush">
            <label for="settingChatBackgroundColor">
              <strong>背景颜色</strong>
              <small>选择图片后仍作为图片占位底色</small>
            </label>
            <input class="settings-color-input" id="settingChatBackgroundColor" data-setting="chat-background-color" type="color" aria-label="聊天背景颜色" />
          </div>
          <div class="settings-background-upload">
            <div>
              <strong>本地背景图片</strong>
              <small>最大 2MB，不上传到网络</small>
            </div>
            <div class="settings-avatar__actions">
              <label class="settings-button" for="settingsChatBackgroundInput">选择图片</label>
              <input class="settings-file-input" id="settingsChatBackgroundInput" type="file" accept="image/*" />
              <button class="settings-text-button" type="button" data-settings-action="clear-chat-background">清除图片</button>
            </div>
            <span class="settings-file-name" id="settingsChatBackgroundFileName">未选择文件</span>
          </div>
        </fieldset>

        <fieldset class="settings-fieldset settings-bubble-palette">
          <legend>气泡配色</legend>
          <p class="settings-fieldset__hint">我的气泡与对方气泡可以分别设置；文字颜色会按底色自动取高对比色。</p>

          <div class="settings-schemes" aria-label="配色方案">
            <button class="settings-scheme" type="button" data-settings-action="set-bubble-scheme" data-bubble-user="#111111" data-bubble-star="#FFFFFF" aria-label="墨白">
              <span class="settings-scheme__chip" style="--chip-a: #111111; --chip-b: #FFFFFF"></span>
              <span>墨白</span>
            </button>
            <button class="settings-scheme" type="button" data-settings-action="set-bubble-scheme" data-bubble-user="#FFFFFF" data-bubble-star="#111111" aria-label="反白">
              <span class="settings-scheme__chip" style="--chip-a: #FFFFFF; --chip-b: #111111"></span>
              <span>反白</span>
            </button>
            <button class="settings-scheme" type="button" data-settings-action="set-bubble-scheme" data-bubble-user="#3A3A3A" data-bubble-star="#F2F2F2" aria-label="炭灰">
              <span class="settings-scheme__chip" style="--chip-a: #3A3A3A; --chip-b: #F2F2F2"></span>
              <span>炭灰</span>
            </button>
            <button class="settings-scheme" type="button" data-settings-action="set-bubble-scheme" data-bubble-user="#D6E4FF" data-bubble-star="#FFFFFF" aria-label="雾霭蓝">
              <span class="settings-scheme__chip" style="--chip-a: #D6E4FF; --chip-b: #FFFFFF"></span>
              <span>雾霭蓝</span>
            </button>
            <button class="settings-scheme" type="button" data-settings-action="set-bubble-scheme" data-bubble-user="#FFD6E0" data-bubble-star="#FFFFFF" aria-label="樱花粉">
              <span class="settings-scheme__chip" style="--chip-a: #FFD6E0; --chip-b: #FFFFFF"></span>
              <span>樱花粉</span>
            </button>
            <button class="settings-scheme" type="button" data-settings-action="set-bubble-scheme" data-bubble-user="#D8F5E0" data-bubble-star="#FFFFFF" aria-label="薄荷绿">
              <span class="settings-scheme__chip" style="--chip-a: #D8F5E0; --chip-b: #FFFFFF"></span>
              <span>薄荷绿</span>
            </button>
            <button class="settings-scheme" type="button" data-settings-action="set-bubble-scheme" data-bubble-user="#FFF3D6" data-bubble-star="#FFFFFF" aria-label="奶油黄">
              <span class="settings-scheme__chip" style="--chip-a: #FFF3D6; --chip-b: #FFFFFF"></span>
              <span>奶油黄</span>
            </button>
            <button class="settings-scheme" type="button" data-settings-action="set-bubble-scheme" data-bubble-user="#E8DCFF" data-bubble-star="#FFFFFF" aria-label="淡紫">
              <span class="settings-scheme__chip" style="--chip-a: #E8DCFF; --chip-b: #FFFFFF"></span>
              <span>淡紫</span>
            </button>
          </div>

          <div class="settings-bubble-row">
            <strong>我的气泡</strong>
            <div class="settings-swatches" aria-label="我的气泡颜色">
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-bubble-target="user" data-color-value="#111111" style="--swatch-color: #111111" aria-label="墨黑"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-bubble-target="user" data-color-value="#3A3A3A" style="--swatch-color: #3A3A3A" aria-label="炭灰"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-bubble-target="user" data-color-value="#D6E4FF" style="--swatch-color: #D6E4FF" aria-label="雾霭蓝"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-bubble-target="user" data-color-value="#FFD6E0" style="--swatch-color: #FFD6E0" aria-label="樱花粉"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-bubble-target="user" data-color-value="#D8F5E0" style="--swatch-color: #D8F5E0" aria-label="薄荷绿"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-bubble-target="user" data-color-value="#FFF3D6" style="--swatch-color: #FFF3D6" aria-label="奶油黄"></button>
              <label class="settings-swatch settings-swatch--custom" aria-label="自定义我的气泡颜色">
                <input id="settingBubbleColor" data-setting="bubble-color" type="color" />
              </label>
            </div>
          </div>

          <div class="settings-bubble-row">
            <strong>对方气泡</strong>
            <div class="settings-swatches" aria-label="对方气泡颜色">
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-bubble-target="star" data-color-value="#FFFFFF" style="--swatch-color: #FFFFFF" aria-label="纯白"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-bubble-target="star" data-color-value="#F2F2F2" style="--swatch-color: #F2F2F2" aria-label="浅灰"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-bubble-target="star" data-color-value="#FAF7F0" style="--swatch-color: #FAF7F0" aria-label="米白"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-bubble-target="star" data-color-value="#EDEDED" style="--swatch-color: #EDEDED" aria-label="雾灰"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-bubble-target="star" data-color-value="#F3E8FF" style="--swatch-color: #F3E8FF" aria-label="淡紫"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-bubble-target="star" data-color-value="#FFF0E0" style="--swatch-color: #FFF0E0" aria-label="暖橘"></button>
              <label class="settings-swatch settings-swatch--custom" aria-label="自定义对方气泡颜色">
                <input id="settingBubbleColorStar" data-setting="bubble-color-star" type="color" />
              </label>
            </div>
          </div>
        </fieldset>

        <label class="settings-switch-row">
          <span>
            <strong>显示时间戳</strong>
            <small>关闭后消息下方不再显示时间</small>
          </span>
          <span class="settings-switch">
            <input id="settingShowTimestamp" data-setting="show-timestamp" type="checkbox" />
            <span aria-hidden="true"></span>
          </span>
        </label>

        <div class="settings-field settings-field--inline">
          <label for="settingFontSize">
            <strong>字体大小</strong>
            <small>调整全局字号</small>
          </label>
          <select id="settingFontSize" data-setting="font-size">
            <option value="small">小</option>
            <option value="medium">中</option>
            <option value="large">大</option>
          </select>
        </div>

      </section>

      <div class="settings-footer">
        <button class="settings-button settings-button--primary settings-save" type="button" data-settings-action="save-all">保存</button>
      </div>
    </div>
    <div class="settings-toast" id="settingsToast" role="status" aria-live="polite" hidden></div>
  `;

  elements = {
    toast: viewRoot.querySelector('#settingsToast'),
    delayMin: viewRoot.querySelector('#settingDelayMin'),
    delayMax: viewRoot.querySelector('#settingDelayMax'),
    typingIndicator: viewRoot.querySelector('#settingTypingIndicator'),
    multiReplyEnabled: viewRoot.querySelector('#settingMultiReplyEnabled'),
    multiReplyMin: viewRoot.querySelector('#settingMultiReplyMin'),
    multiReplyMax: viewRoot.querySelector('#settingMultiReplyMax'),
    multiReplyGapMin: viewRoot.querySelector('#settingMultiReplyGapMin'),
    multiReplyGapMax: viewRoot.querySelector('#settingMultiReplyGapMax'),
    spellCardEnabled: viewRoot.querySelector('#settingSpellCardEnabled'),
    spellCardChance: viewRoot.querySelector('#settingSpellCardChance'),
    spellCardMin: viewRoot.querySelector('#settingSpellCardMin'),
    spellCardMax: viewRoot.querySelector('#settingSpellCardMax'),
    spellCardMode: viewRoot.querySelector('#settingSpellCardMode'),
    spellCardNewline: viewRoot.querySelector('#settingSpellCardNewline'),
    spellCardCustom: viewRoot.querySelector('#settingSpellCardCustom'),
    spellCardSummary: viewRoot.querySelector('#spellCardSummary'),
    spellCardPreview: viewRoot.querySelector('#spellCardPreview'),
    readNoReplyEnabled: viewRoot.querySelector('#settingReadNoReplyEnabled'),
    readNoReplyRange: viewRoot.querySelector('#settingReadNoReplyRange'),
    readNoReplyNumber: viewRoot.querySelector('#settingReadNoReplyNumber'),
    readNoReplyOutput: viewRoot.querySelector('#settingReadNoReplyOutput'),
    stickerReplyRange: viewRoot.querySelector('#settingStickerReplyRange'),
    stickerReplyNumber: viewRoot.querySelector('#settingStickerReplyNumber'),
    stickerReplyOutput: viewRoot.querySelector('#settingStickerReplyOutput'),
    patReplyRange: viewRoot.querySelector('#settingPatReplyRange'),
    patReplyNumber: viewRoot.querySelector('#settingPatReplyNumber'),
    patReplyOutput: viewRoot.querySelector('#settingPatReplyOutput'),
    avatarPreview: viewRoot.querySelector('#settingsAvatarPreview'),
    avatarInput: viewRoot.querySelector('#settingsAvatarInput'),
    avatarFileName: viewRoot.querySelector('#settingsAvatarFileName'),
    userAvatarPreview: viewRoot.querySelector('#settingsUserAvatarPreview'),
    userAvatarInput: viewRoot.querySelector('#settingsUserAvatarInput'),
    userAvatarFileName: viewRoot.querySelector('#settingsUserAvatarFileName'),
    characterName: viewRoot.querySelector('#settingCharacterName'),
    userName: viewRoot.querySelector('#settingUserName'),
    promptQuestionnaireChance: viewRoot.querySelector('#settingPromptQuestionnaireChance'),
    promptQuestionnaireIntervalHours: viewRoot.querySelector('#settingPromptQuestionnaireIntervalHours'),
    showTimestamp: viewRoot.querySelector('#settingShowTimestamp'),
    fontSize: viewRoot.querySelector('#settingFontSize'),
    chatBackgroundType: viewRoot.querySelector('#settingChatBackgroundType'),
    chatBackgroundColor: viewRoot.querySelector('#settingChatBackgroundColor'),
    chatBackgroundInput: viewRoot.querySelector('#settingsChatBackgroundInput'),
    chatBackgroundFileName: viewRoot.querySelector('#settingsChatBackgroundFileName'),
    bubbleColor: viewRoot.querySelector('#settingBubbleColor'),
    bubbleColorStar: viewRoot.querySelector('#settingBubbleColorStar'),
    saveAll: viewRoot.querySelector('[data-settings-action="save-all"]'),
    feedEnabled: viewRoot.querySelector('#settingFeedEnabled'),
    feedAutoPost: viewRoot.querySelector('#settingFeedAutoPost'),
    feedIntervalMin: viewRoot.querySelector('#settingFeedIntervalMin'),
    feedIntervalMax: viewRoot.querySelector('#settingFeedIntervalMax'),
    feedDailyMax: viewRoot.querySelector('#settingFeedDailyMax'),
    roastEnabled: viewRoot.querySelector('#settingRoastEnabled'),
    roastInterval: viewRoot.querySelector('#settingRoastInterval'),
  };

  // 概率类控件（滑块 + 数字 + 输出）统一登记，便于同步与保存。
  ["starFavorite", "starFavoriteCard", "starFavoriteFeed", "feedPostChance", "feedLikeProbability", "feedCommentProbability", "feedReplyProbability", "feedReplyToCommentProbability", "roastProbability"].forEach((key) => {
    const cap = key[0].toUpperCase() + key.slice(1);
    elements[key + "Range"] = viewRoot.querySelector("#setting" + cap + "Range");
    elements[key + "Number"] = viewRoot.querySelector("#setting" + cap + "Number");
    elements[key + "Output"] = viewRoot.querySelector("#setting" + cap + "Output");
  });

  bindEvents();
  syncSettings();
  return true;
}

export function onSettingsViewEnter() {
  syncSettings();
}
