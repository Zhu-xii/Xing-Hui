import '../styles/settings.css';
import {
  DEFAULT_SETTINGS,
  readCharacter,
  readSettings,
  updateSettings,
  writeCharacter,
} from '../lib/storage.js';
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
  const { userAvatar } = readSettings();
  return renderAvatarPreview(elements?.userAvatarPreview, userAvatar, '我', '我的头像预览');
}
function syncAppearanceControls(settings = readSettings()) {
  if (!elements) return;

  elements.chatBackgroundType.value = settings.chatBackgroundType;
  elements.chatBackgroundColor.value = settings.chatBackgroundColor;
  elements.bubbleColor.value = settings.bubbleColor;
  elements.chatBackgroundFileName.textContent = settings.chatBackgroundType === 'image' && settings.chatBackgroundImage
    ? '已保存本地背景图片'
    : '未选择文件';

  viewRoot.querySelectorAll('[data-color-value]').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.colorValue.toUpperCase() === settings.bubbleColor.toUpperCase());
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
  elements.readNoReplyEnabled.checked = settings.readNoReplyEnabled;
  elements.readNoReplyNumber.disabled = !settings.readNoReplyEnabled;
  elements.readNoReplyRange.disabled = !settings.readNoReplyEnabled;

  syncProbability('readNoReply', settings.readNoReply);
  syncProbability('stickerReply', settings.stickerReply);
  syncProbability('patReply', settings.patReply);

  elements.promptQuestionnaireChance.value = String(settings.promptQuestionnaireChance);
  elements.promptQuestionnaireIntervalHours.value = String(settings.promptQuestionnaireIntervalHours);
  elements.showTimestamp.checked = settings.showTimestamp;
  elements.fontSize.value = settings.fontSize;
  syncAppearanceControls(settings);

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

function saveProbability(key, value, minimum = 1) {
  const settings = readSettings();
  const next = enabledValue(value, settings[key] ?? DEFAULT_SETTINGS[key], minimum);
  updateSettings({ [key]: next });
  syncProbability(key, next);
}

function handleRangeInput(event) {
  const target = event.target;
  const delaySetting = target.dataset.setting;
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

  if (setting === 'read-no-reply-enabled') {
    updateSettings({ readNoReplyEnabled: target.checked });
    target.disabled = false;
    elements.readNoReplyNumber.disabled = !target.checked;
    elements.readNoReplyRange.disabled = !target.checked;
    return;
  }

  if (setting === 'prompt-questionnaire-chance') {
    updateSettings({ promptQuestionnaireChance: Math.min(1, Math.max(0, Number(target.value) || 0)) });
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
  }
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
  if (action === 'set-bubble-color') {
    updateSettings({ bubbleColor: actionButton.dataset.colorValue });
    syncAppearanceControls();
    showToast('气泡颜色已更新。');
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

        <div class="settings-field settings-field--inline">
          <label for="settingPromptQuestionnaireChance">
            <strong>星回随机发题概率</strong>
            <small>0–1，默认 0.3</small>
          </label>
          <input class="settings-number-input" id="settingPromptQuestionnaireChance" data-setting="prompt-questionnaire-chance" type="number" min="0" max="1" step="0.1" inputmode="decimal" />
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

      <section class="settings-card" aria-labelledby="settingsAvatarTitle">
        <div class="settings-card__heading">
          <div>
            <p class="settings-kicker">头像</p>
            <h3 id="settingsAvatarTitle">星回头像</h3>
          </div>
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
            <h3 id="settingsUserAvatarTitle">我的头像</h3>
          </div>
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
          <legend>气泡颜色</legend>
          <p class="settings-fieldset__hint">默认淡蓝，所有气泡文字保持黑色。</p>
          <div class="settings-swatches" aria-label="气泡调色盘">
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-color-value="#DDEEFF" style="--swatch-color: #DDEEFF" aria-label="淡蓝"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-color-value="#DDF3F5" style="--swatch-color: #DDF3F5" aria-label="薄荷"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-color-value="#F7E8F1" style="--swatch-color: #F7E8F1" aria-label="浅粉"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-color-value="#FFF0D9" style="--swatch-color: #FFF0D9" aria-label="杏色"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-color-value="#E5EBFF" style="--swatch-color: #E5EBFF" aria-label="薰衣草"></button>
            <button class="settings-swatch" type="button" data-settings-action="set-bubble-color" data-color-value="#EFF2F5" style="--swatch-color: #EFF2F5" aria-label="雾灰"></button>
            <label class="settings-swatch settings-swatch--custom" aria-label="自定义气泡颜色">
              <input id="settingBubbleColor" data-setting="bubble-color" type="color" />
            </label>
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
    </div>
    <div class="settings-toast" id="settingsToast" role="status" aria-live="polite" hidden></div>
  `;

  elements = {
    toast: viewRoot.querySelector('#settingsToast'),
    delayMin: viewRoot.querySelector('#settingDelayMin'),
    delayMax: viewRoot.querySelector('#settingDelayMax'),
    typingIndicator: viewRoot.querySelector('#settingTypingIndicator'),
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
    promptQuestionnaireChance: viewRoot.querySelector('#settingPromptQuestionnaireChance'),
    promptQuestionnaireIntervalHours: viewRoot.querySelector('#settingPromptQuestionnaireIntervalHours'),
    showTimestamp: viewRoot.querySelector('#settingShowTimestamp'),
    fontSize: viewRoot.querySelector('#settingFontSize'),
    chatBackgroundType: viewRoot.querySelector('#settingChatBackgroundType'),
    chatBackgroundColor: viewRoot.querySelector('#settingChatBackgroundColor'),
    chatBackgroundInput: viewRoot.querySelector('#settingsChatBackgroundInput'),
    chatBackgroundFileName: viewRoot.querySelector('#settingsChatBackgroundFileName'),
    bubbleColor: viewRoot.querySelector('#settingBubbleColor'),
  };

  bindEvents();
  syncSettings();
  return true;
}

export function onSettingsViewEnter() {
  syncSettings();
}
