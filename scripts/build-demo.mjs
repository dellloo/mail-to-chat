#!/usr/bin/env node
/**
 * Baut eine self-contained Demo-Seite (docs/demo.html) mit dem ECHTEN Chat-Renderer
 * und fiktiven Inhalten. Für Store-Screenshots / als hostbare Live-Demo.
 * Nutzung: npm run build:demo
 */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const res = await build({
  entryPoints: [resolve(root, 'apps/chrome-ext/src/demo.ts')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  write: false,
});
const js = res.outputFiles[0].text.replace(/<\/script>/gi, '<\\/script>');

const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mail to Chat — Demo</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 22px; padding: 40px 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #2b2f6b 0%, #14152b 45%, #0b0c18 100%);
    color: #eceef2; }
  .head { text-align: center; }
  .head h1 { margin: 0; font-size: 30px; letter-spacing: -0.5px; }
  .head p { margin: 6px 0 0; opacity: 0.72; font-size: 16px; }
  .window { width: min(840px, 96vw); height: 660px; border-radius: 18px; overflow: hidden;
    box-shadow: 0 30px 80px rgba(0,0,0,0.55), 0 2px 0 rgba(255,255,255,0.05) inset;
    display: flex; flex-direction: column; background: #1a1d23; }
  .titlebar { height: 38px; flex: 0 0 38px; display: flex; align-items: center; gap: 8px;
    padding: 0 14px; background: #23262e; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .r { background: #ff5f57; } .y { background: #febc2e; } .g { background: #28c840; }
  .titlebar span { margin-left: 10px; font-size: 13px; opacity: 0.6; }
  #cm-slot { flex: 1; min-height: 0; }
  #cm-themes { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  #cm-themes button { border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.06);
    color: #eceef2; padding: 7px 14px; border-radius: 999px; font-size: 13px; cursor: pointer;
    transition: all 0.15s; }
  #cm-themes button:hover { background: rgba(255,255,255,0.12); }
  #cm-themes button.on { background: #e6b400; color: #1a1a1a; border-color: #e6b400; font-weight: 700; }
  .foot { opacity: 0.5; font-size: 13px; }
</style>
</head>
<body>
  <div class="head">
    <h1>💬 Mail to Chat</h1>
    <p>Aus dem E-Mail-Chaos wird ein klarer Chat — wie WhatsApp, aber für deine Mails.</p>
  </div>
  <div class="window">
    <div class="titlebar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span>Mail to Chat — Demo</span></div>
    <div id="cm-slot"></div>
  </div>
  <div id="cm-themes"></div>
  <div class="foot">100% lokal · Open Source (GPL-3.0) · fiktive Demo-Inhalte</div>
<script>${js}</script>
</body>
</html>
`;

writeFileSync(resolve(root, 'docs/demo.html'), html);
console.log('✓ docs/demo.html geschrieben (' + Math.round(html.length / 1024) + ' KB).');
console.log('  Lokal öffnen (Doppelklick) oder hosten — für Screenshots Theme-Buttons nutzen.');
