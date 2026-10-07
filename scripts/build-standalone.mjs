// Inline the Vite build output into a single self-contained HTML file.
//
// The result (standalone.html) opens straight from the local filesystem with no
// network access at all, which makes it usable on phones in networks where
// *.workers.dev is blocked.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const outFile = path.join(rootDir, 'standalone.html');

let html = await readFile(path.join(distDir, 'index.html'), 'utf8');
let inlined = 0;

const scriptTags = [...html.matchAll(/<script\b[^>]*\bsrc="\/([^"]+\.js)"[^>]*><\/script>/g)];
for (const match of scriptTags) {
  const code = await readFile(path.join(distDir, match[1]), 'utf8');
  if (code.includes('</script')) {
    throw new Error(`${match[1]} contains "</script" and cannot be inlined safely.`);
  }
  html = html.replace(match[0], () => `<script type="module">\n${code}\n</script>`);
  inlined += 1;
}

const styleTags = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="\/([^"]+\.css)"[^>]*>/g)];
for (const match of styleTags) {
  const code = await readFile(path.join(distDir, match[1]), 'utf8');
  if (code.includes('</style')) {
    throw new Error(`${match[1]} contains "</style" and cannot be inlined safely.`);
  }
  html = html.replace(match[0], () => `<style>\n${code}\n</style>`);
  inlined += 1;
}

const remaining = [...html.matchAll(/(?:src|href)="\/([^"]+)"/g)].map((m) => m[1]);
if (remaining.length > 0) {
  throw new Error(`External references left after inlining: ${remaining.join(', ')}`);
}

await writeFile(outFile, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`Inlined ${inlined} assets -> standalone.html (${kb} KB, self-contained)`);