#!/usr/bin/env node
/**
 * Baut die auto-ablaufende animierte Demo (docs/demo-video.html) — self-contained,
 * für Screen-Recording (Cmd+Shift+5). Echter Renderer + Animations-Director.
 * Nutzung: npm run build:demo-video
 */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const res = await build({
  entryPoints: [resolve(root, 'apps/chrome-ext/src/demo-video.ts')],
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
<title>Mail to Chat — Demo-Video</title>
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 18px; padding: 36px 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #eceef2;
    background: radial-gradient(1300px 700px at 50% -15%, #2b2f6b 0%, #14152b 48%, #0a0b16 100%);
    overflow: hidden; }
  .brand { text-align: center; }
  .brand h1 { margin: 0; font-size: 26px; letter-spacing: -0.4px; }
  .brand p { margin: 4px 0 0; opacity: 0.66; font-size: 14px; }

  /* Toolbar mit iOS-Schalter */
  .toolbar { width: min(880px, 96vw); display: flex; align-items: center; gap: 14px;
    background: #23262e; border-radius: 14px 14px 0 0; padding: 10px 16px; }
  .tb-label { font-size: 13px; opacity: 0.6; }
  .switch { display: inline-flex; align-items: center; gap: 9px; font-size: 13px; opacity: 0.9; }
  #ios-toggle { width: 46px; height: 26px; border-radius: 99px; background: #4a4f5a; position: relative;
    transition: background 0.3s; }
  #ios-toggle::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px;
    border-radius: 50%; background: #fff; transition: left 0.3s cubic-bezier(0.4,0,0.2,1); box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
  #ios-toggle.on { background: #e6b400; }
  #ios-toggle.on::after { left: 23px; }
  #gear { margin-left: auto; font-size: 18px; opacity: 0.7; cursor: pointer; }

  /* Fenster mit zwei Ebenen (klassisch + chat) */
  .window { width: min(880px, 96vw); height: 560px; position: relative; overflow: hidden;
    border-radius: 0 0 16px 16px; background: #1a1d23;
    box-shadow: 0 30px 80px rgba(0,0,0,0.55); }
  #classic, #cm-slot { position: absolute; inset: 0; transition: opacity 0.5s ease; }
  #cm-slot { opacity: 0; }
  /* Klassische "Vorher"-Ansicht: verschachtelte Zitate */
  #classic { padding: 22px 26px; overflow: hidden; color: #c9ccd3; background: #fff; }
  #classic .cmail { border-bottom: 1px solid #e6e6e6; padding: 12px 0; }
  #classic .ch { color: #202124; font-weight: 600; font-size: 14px; }
  #classic .cm { color: #5f6368; font-size: 13.5px; line-height: 1.5; margin-top: 4px; }
  #classic .q { color: #80868b; border-left: 2px solid #dadce0; padding-left: 10px; margin-top: 6px;
    font-size: 12.5px; }

  /* Theme-Label */
  #theme-label { position: fixed; top: 26px; left: 50%; transform: translateX(-50%) translateY(-12px);
    background: rgba(0,0,0,0.72); color: #fff; padding: 8px 18px; border-radius: 99px; font-size: 14px;
    font-weight: 600; opacity: 0; transition: opacity 0.3s, transform 0.3s; pointer-events: none; z-index: 50; }
  #theme-label.show { opacity: 1; transform: translateX(-50%) translateY(0); }

  /* Mock-Einstellungs-Panel */
  #settings { position: absolute; top: 0; right: 0; width: 280px; height: 100%; background: #20232b;
    border-left: 1px solid rgba(255,255,255,0.08); transform: translateX(100%); transition: transform 0.4s cubic-bezier(0.4,0,0.2,1);
    padding: 20px; z-index: 40; }
  #settings.open { transform: translateX(0); }
  #settings h3 { margin: 0 0 14px; font-size: 15px; }
  #settings .lbl { font-size: 12px; opacity: 0.6; margin: 16px 0 8px; }
  #sw { display: flex; flex-wrap: wrap; gap: 8px; }
  .swatch { width: 34px; height: 34px; border-radius: 9px; border: 2px solid rgba(255,255,255,0.15); }
  #settings .row { display: flex; align-items: center; justify-content: space-between; font-size: 13px;
    padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
  #settings .mini { width: 36px; height: 20px; border-radius: 99px; background: #e6b400; position: relative; }
  #settings .mini::after { content:''; position:absolute; top:2px; right:2px; width:16px; height:16px; border-radius:50%; background:#fff; }

  /* Fake-Cursor */
  #cursor { position: fixed; width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff;
    background: rgba(255,255,255,0.25); margin: -11px 0 0 -11px; pointer-events: none; opacity: 0; z-index: 60;
    transition: left 0.6s cubic-bezier(0.4,0,0.2,1), top 0.6s cubic-bezier(0.4,0,0.2,1), transform 0.15s; }
  #cursor.tap { transform: scale(0.6); }
  .foot { opacity: 0.45; font-size: 12px; }
</style>
</head>
<body>
  <div class="brand"><h1>💬 Mail to Chat</h1><p>Aus dem E-Mail-Chaos wird ein klarer Chat.</p></div>

  <div class="toolbar">
    <span class="tb-label">Gmail</span>
    <span class="switch">Klassisch <span id="ios-toggle"></span> Chat</span>
    <span id="gear">⚙️</span>
  </div>

  <div class="window">
    <div id="classic">
      <div class="cmail"><div class="ch">Anna Berg — Sommerfest 2026</div>
        <div class="cm">Hallo! Hast du das Briefing für das Sommerfest schon gesehen?
          <div class="q">&gt; Am 12.06. schrieb Du:<div class="q">&gt;&gt; Wann passt dir ein Call?
            <div class="q">&gt;&gt;&gt; Am 11.06. schrieb Anna Berg: Donnerstag 14 Uhr?…</div></div></div></div></div>
      <div class="cmail"><div class="ch">Du — Re: Sommerfest 2026</div>
        <div class="cm">Hi Anna, ja — sieht super aus.
          <div class="q">&gt; Anfang der weitergeleiteten Nachricht: Von: Eventlocation München…
            <div class="q">&gt;&gt; Mit freundlichen Grüßen, Anna Berg, Stadtwerk Kultur gGmbH, Tel: 089…</div></div></div></div>
      <div class="cmail"><div class="ch">Anna Berg — Re: Sommerfest 2026</div>
        <div class="cm">Perfekt, Donnerstag passt.<div class="q">&gt; … 10 weitere zitierte Ebenen …</div></div></div>
    </div>
    <div id="cm-slot"></div>
    <div id="settings">
      <h3>⚙️ Einstellungen</h3>
      <div class="lbl">Design / Theme</div>
      <div id="sw"></div>
      <div class="lbl">Verhalten</div>
      <div class="row">Auto-Aktivierung <span class="mini"></span></div>
      <div class="row">Signaturen einklappen <span class="mini"></span></div>
      <div class="row">Anhänge anzeigen <span class="mini"></span></div>
    </div>
  </div>

  <div class="foot">100% lokal · Open Source (GPL-3.0) · fiktive Demo-Inhalte</div>
  <div id="theme-label"></div>
  <div id="cursor"></div>
<script>${js}</script>
</body>
</html>
`;

writeFileSync(resolve(root, 'docs/demo-video.html'), html);
console.log('✓ docs/demo-video.html geschrieben (' + Math.round(html.length / 1024) + ' KB).');
console.log('  Im Browser öffnen → läuft automatisch in Schleife → mit Cmd+Shift+5 aufnehmen.');
