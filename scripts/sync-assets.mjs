// Sync the Vite build output into the Cloudflare Workers static-assets folder.
//
// Cloudflare Workers serves whatever lives in `assets.directory` (see wrangler.jsonc),
// while Vite writes to `dist/`. This script keeps the two in step and drops files
// that Cloudflare does not need:
//   - _redirects    : SPA fallback is handled by not_found_handling in wrangler.jsonc
//   - .assetsignore : only relevant when deploying dist/ directly
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(rootDir, 'dist');
const destDir = path.join(rootDir, 'cloudflare-assets');
const EXCLUDED = new Set(['_redirects', '.assetsignore']);

// Guard: only ever clear the expected folder inside the project.
if (path.dirname(destDir) !== rootDir || path.basename(destDir) !== 'cloudflare-assets') {
  throw new Error(`Refusing to sync: unexpected destination ${destDir}`);
}

try {
  await stat(path.join(srcDir, 'index.html'));
} catch {
  throw new Error(`Missing ${srcDir}/index.html - run "npm run build" first.`);
}

await rm(destDir, { recursive: true, force: true });
await mkdir(destDir, { recursive: true });

let files = 0;
let bytes = 0;

await cp(srcDir, destDir, {
  recursive: true,
  filter: async (src) => {
    const base = path.basename(src);
    if (EXCLUDED.has(base)) return false;
    const info = await stat(src);
    if (info.isFile()) {
      files += 1;
      bytes += info.size;
    }
    return true;
  },
});

const kb = (bytes / 1024).toFixed(1);
console.log(`Synced ${files} files (${kb} KB) -> cloudflare-assets/`);