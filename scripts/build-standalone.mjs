// Inline the Vite build output into a single self-contained HTML file.
//
// The result (standalone.html) opens straight from the local filesystem with no
// network access at all, which makes it usable on phones in networks where
// *.workers.dev is blocked.
//
// 注意：vite.config.js 里 base 是 './'，所以产物里的引用是 "./assets/xxx.js"，
// 不是 "/assets/xxx.js"。正则必须两种都接受，否则会静默内联 0 个资源、
// 生成一个只有空壳的 standalone.html 却不报错。
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const outFile = path.join(rootDir, 'standalone.html');

const RESOURCE_SRC = String.raw`\.?\/?assets\/[^"]+`;

let html = await readFile(path.join(distDir, 'index.html'), 'utf8');
let inlined = 0;

const scriptTags = [
  ...html.matchAll(new RegExp(`<script\\b[^>]*\\bsrc="${RESOURCE_SRC}\\.js"[^>]*><\\/script>`, 'g')),
];
for (const match of scriptTags) {
  const rel = match[0].match(/src="([^"]+)"/)[1];
  const file = path.join(distDir, rel.replace(/^\.?\//, ''));
  const code = await readFile(file, 'utf8');
  if (code.includes('</script')) {
    throw new Error(`${rel} contains "</script" and cannot be inlined safely.`);
  }
  html = html.replace(match[0], () => `<script type="module">\n${code}\n</script>`);
  inlined += 1;
}

const styleTags = [
  ...html.matchAll(
    new RegExp(`<link\\b[^>]*\\brel="stylesheet"[^>]*\\bhref="${RESOURCE_SRC}\\.css"[^>]*>`, 'g'),
  ),
];
for (const match of styleTags) {
  const rel = match[0].match(/href="([^"]+)"/)[1];
  const file = path.join(distDir, rel.replace(/^\.?\//, ''));
  const code = await readFile(file, 'utf8');
  if (code.includes('</style')) {
    throw new Error(`${rel} contains "</style" and cannot be inlined safely.`);
  }
  html = html.replace(match[0], () => `<style>\n${code}\n</style>`);
  inlined += 1;
}

// 兜底：任何指向 assets 的残留引用都说明内联失败，必须报错而不是生成坏文件。
const remaining = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map((m) => m[1]);
if (remaining.length > 0) {
  throw new Error(`External references left after inlining: ${remaining.join(', ')}`);
}

if (inlined === 0) {
  throw new Error('Inlined 0 assets — dist/index.html 里没有找到可内联的 js/css，检查 vite base 配置。');
}

await writeFile(outFile, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`Inlined ${inlined} assets -> standalone.html (${kb} KB, self-contained)`);
