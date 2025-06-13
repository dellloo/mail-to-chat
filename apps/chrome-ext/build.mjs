import * as esbuild from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Build: bündelt Content Script + Options Page nach apps/chrome-ext/dist. */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const dist = resolve(here, 'dist');

await mkdir(dist, { recursive: true });

const alias = {
  '@chatmail/core': resolve(root, 'packages/core/src/index.ts'),
  '@chatmail/ui': resolve(root, 'packages/ui/src/index.ts'),
  '@chatmail/adapter-gmail': resolve(root, 'packages/adapters/gmail/src/index.ts'),
};

await esbuild.build({
  entryPoints: {
    content: resolve(here, 'src/content.ts'),
    options: resolve(here, 'src/options.ts'),
    background: resolve(here, 'src/background.ts'),
  },
  outdir: dist,
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  minify: true,
  sourcemap: false,
  alias,
  logLevel: 'info',
});

await cp(resolve(here, 'manifest.json'), resolve(dist, 'manifest.json'));
await cp(resolve(here, 'src/options.html'), resolve(dist, 'options.html'));
await cp(resolve(here, 'icons'), resolve(dist, 'icons'), { recursive: true });

// Firefox-Build: gleiche Bundles, eigenes Manifest (V2)
const ffDist = resolve(root, 'apps/firefox-ext/dist');
await mkdir(ffDist, { recursive: true });
for (const f of ['content.js', 'options.js', 'background.js', 'options.html']) {
  await cp(resolve(dist, f), resolve(ffDist, f));
}
await cp(resolve(here, 'icons'), resolve(ffDist, 'icons'), { recursive: true });
await cp(resolve(root, 'apps/firefox-ext/manifest.src.json'), resolve(ffDist, 'manifest.json'));

console.log('✓ Build fertig:');
console.log('  Chrome  → apps/chrome-ext/dist  ("Entpackte Erweiterung laden")');
console.log('  Firefox → apps/firefox-ext/dist (about:debugging → "Temporäres Add-on laden")');
