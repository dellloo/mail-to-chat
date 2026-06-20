#!/usr/bin/env node
/**
 * Packt die gebaute Chrome-Extension (apps/chrome-ext/dist) als versioniertes ZIP für den
 * Chrome Web Store. ZIP-Wurzel = dist-Inhalt (manifest.json liegt OBEN, kein Unterordner).
 *
 * Nutzung:  npm run package
 * Ergebnis: releases/mail-to-chat-chrome-vX.Y.Z.zip  → im CWS Developer Dashboard hochladen.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'apps/chrome-ext/dist');
const releases = resolve(root, 'releases');

// 1) Bauen. (Der Manifest-Copy kann in manchen Sandbox-Mounts an Dateisystem-Rechten scheitern;
//    wir tolerieren das, solange content.js + manifest.json valide im dist liegen.)
try {
  execSync('node apps/chrome-ext/build.mjs', { cwd: root, stdio: 'inherit' });
} catch (err) {
  const ok = ['content.js', 'manifest.json', 'options.js'].every(
    (f) => existsSync(resolve(dist, f)) && statSync(resolve(dist, f)).size > 0,
  );
  if (!ok) {
    console.error('Build fehlgeschlagen und dist unvollständig — abgebrochen.');
    throw err;
  }
  console.warn('Warnung: Build-Schritt meldete einen Fehler, dist ist aber vollständig — fahre fort.');
}

// 2) Version aus dem gebauten Manifest lesen
const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'));
const version = manifest.version;

mkdirSync(releases, { recursive: true });
const zipName = `mail-to-chat-chrome-v${version}.zip`;
const out = resolve(releases, zipName);
if (existsSync(out)) rmSync(out);

// 3) Inhalt von dist zippen (versteckte Dateien ausgeschlossen)
execSync(`cd "${dist}" && zip -r -X "${out}" . -x ".*"`, { stdio: 'inherit', shell: '/bin/bash' });

const sizeKb = Math.round(statSync(out).size / 1024);
console.log(`\n✓ ${zipName} (${sizeKb} KB) erstellt in releases/`);
console.log('  → Chrome Web Store Developer Dashboard → „Paket hochladen".');
