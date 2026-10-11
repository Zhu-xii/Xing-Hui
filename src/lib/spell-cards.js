import { pickRandom } from './random.js';

// 字卡来源标签（聊天气泡上的小 chip）
export const SPELL_CARD_TAG = '拼接字卡';
export const MULTI_REPLY_TAG = '字卡连发';

// 内置连接符：逗号、句号、顿号、空格、省略号、感叹号、问号、破折号
export const SPELL_CARD_SEPARATORS = ['，', '。', '、', ' ', '……', '！', '？', '——'];

// 连接符池 = 内置 + 可选换行 + 用户自定义（去空）
export function spellCardSeparatorPool(options = {}) {
  const pool = SPELL_CARD_SEPARATORS.slice();
  if (options.spellCardNewline) pool.push('\n');
  const custom = Array.isArray(options.spellCardCustomSeparators) ? options.spellCardCustomSeparators : [];
  custom.forEach((item) => {
    const value = String(item ?? '');
    if (value.trim()) pool.push(value);
  });
  return pool.length ? pool : [' '];
}

// 把若干张字卡拼成一条消息，相邻两张之间随机插入连接符
export function joinSpellCards(segments, options = {}) {
  const separators = spellCardSeparatorPool(options);
  return (Array.isArray(segments) ? segments : [])
    .map((segment) => String(segment ?? '').trim())
    .filter(Boolean)
    .reduce((result, segment, index) => (
      index === 0 ? segment : `${result}${pickRandom(separators)}${segment}`
    ), '');
}