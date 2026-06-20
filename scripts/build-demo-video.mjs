#!/usr/bin/env node
/**
 * Baut die animierte Demo (docs/demo-video.html) — Gmail-artiges 2-Spalten-Layout,
 * self-contained, für Screen-Recording (Cmd+Shift+5). Echter Renderer + Director.
 * Nutzung: npm run build:demo-video
 */
import { build } from 'esbuild';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Echtes Logo (statt Emoji) als Data-URL einbetten — self-contained.
const LOGO = 'data:image/png;base64,' + readFileSync(resolve(root, 'apps/chrome-ext/icons/icon128.png')).toString('base64');

const res = await build({
  entryPoints: [resolve(root, 'apps/chrome-ext/src/demo-video.ts')],
  bundle: true, format: 'iife', minify: true, target: 'es2020', write: false,
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
    gap: 16px; padding: 30px 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #eceef2;
    background: radial-gradient(1300px 700px at 50% -15%, #2b2f6b 0%, #14152b 48%, #0a0b16 100%); overflow: hidden; }
  .brand { text-align: center; }
  .brand h1 { margin: 0; font-size: 24px; letter-spacing: -0.4px; display: inline-flex; align-items: center; gap: 11px; }
  .logo { width: 34px; height: 34px; border-radius: 9px; }
  .brand p { margin: 3px 0 0; opacity: 0.62; font-size: 13px; }

  .topbar { width: min(920px, 96vw); display: flex; align-items: center; gap: 14px;
    background: #23262e; border-radius: 14px 14px 0 0; padding: 9px 16px; }
  .tb-label { font-size: 13px; opacity: 0.6; }
  .switch { display: inline-flex; align-items: center; gap: 9px; font-size: 13px; }
  #ios-toggle { width: 46px; height: 26px; border-radius: 99px; background: #4a4f5a; position: relative; transition: background 0.3s; }
  #ios-toggle::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%;
    background: #fff; transition: left 0.3s cubic-bezier(0.4,0,0.2,1); box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
  #ios-toggle.on { background: #e6b400; }
  #ios-toggle.on::after { left: 23px; }
  #gear { margin-left: auto; font-size: 18px; opacity: 0.75; cursor: pointer; }

  .window { width: min(920px, 96vw); height: 580px; display: flex; overflow: hidden;
    border-radius: 0 0 16px 16px; box-shadow: 0 30px 80px rgba(0,0,0,0.55); }
  .sidebar { width: 282px; flex: 0 0 282px; background: #1e2128; border-right: 1px solid rgba(255,255,255,0.06); overflow: hidden; }
  .sbhead { padding: 13px 16px; font-weight: 700; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .mrow { display: flex; gap: 10px; padding: 11px 14px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.04);
    transition: background 0.18s; }
  .mrow:hover { background: rgba(255,255,255,0.04); }
  .mrow.active { background: rgba(230,180,0,0.13); box-shadow: inset 3px 0 0 #e6b400; }
  .mav { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%; color: #fff; font-weight: 700;
    display: flex; align-items: center; justify-content: center; font-size: 15px; }
  .mtext { min-width: 0; flex: 1; }
  .mtop { display: flex; justify-content: space-between; gap: 8px; }
  .mfrom { font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mtime { font-size: 11px; opacity: 0.5; flex: 0 0 auto; }
  .msubj { font-size: 12.5px; opacity: 0.92; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
  .msnip { font-size: 12px; opacity: 0.55; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .reading { flex: 1; position: relative; overflow: hidden; background: #1a1d23; }
  #classic, #cm-slot { position: absolute; inset: 0; transition: opacity 0.5s ease; }
  #cm-slot { opacity: 0; }
  #classic { background: #fff; color: #3c4043; padding: 22px 26px; overflow: hidden; }
  #classic .subj { color: #202124; font-size: 19px; font-weight: 500; margin-bottom: 16px; }
  #classic .blk { border-top: 1px solid #eaeced; padding: 12px 0; }
  #classic .ch { color: #202124; font-weight: 600; font-size: 13.5px; }
  #classic .cb { color: #5f6368; font-size: 13px; line-height: 1.5; margin-top: 4px; }
  #classic .q { color: #80868b; border-left: 2px solid #dadce0; padding-left: 10px; margin-top: 6px; font-size: 12px; }

  #theme-label { position: fixed; top: 28px; left: 50%; transform: translateX(-50%) translateY(-16px) scale(0.96);
    background: rgba(10,12,24,0.9); color: #fff; padding: 13px 32px; border-radius: 99px; font-size: 22px; font-weight: 700;
    letter-spacing: -0.2px; box-shadow: 0 10px 34px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1);
    opacity: 0; transition: opacity 0.32s ease, transform 0.32s cubic-bezier(0.34,1.56,0.64,1); pointer-events: none; z-index: 50; }
  #theme-label.show { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }

  #settings { position: absolute; top: 0; right: 0; width: 268px; height: 100%; background: #20232b;
    border-left: 1px solid rgba(255,255,255,0.08); transform: translateX(100%);
    transition: transform 0.4s cubic-bezier(0.4,0,0.2,1); padding: 18px; z-index: 40; }
  #settings.open { transform: translateX(0); }
  #settings h3 { margin: 0 0 12px; font-size: 15px; }
  #settings .lbl { font-size: 12px; opacity: 0.6; margin: 14px 0 8px; }
  #sw { display: flex; flex-wrap: wrap; gap: 9px; }
  .swatch { width: 36px; height: 36px; border-radius: 9px; border: 2px solid rgba(255,255,255,0.15); cursor: pointer; }
  #settings .row { display: flex; align-items: center; justify-content: space-between; font-size: 13px;
    padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
  #settings .mini { width: 36px; height: 20px; border-radius: 99px; background: #e6b400; position: relative; }
  #settings .mini::after { content: ''; position: absolute; top: 2px; right: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; }

  #cursor { position: fixed; width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff; background: rgba(255,255,255,0.25);
    margin: -11px 0 0 -11px; pointer-events: none; opacity: 0; z-index: 60;
    transition: left 0.6s cubic-bezier(0.4,0,0.2,1), top 0.6s cubic-bezier(0.4,0,0.2,1), transform 0.15s; }
  #cursor.tap { transform: scale(0.6); }
  .foot { opacity: 0.45; font-size: 12px; }
</style>
</head>
<body>
  <div class="brand"><h1><img class="logo" src="${LOGO}" alt="Mail to Chat Logo">Mail to Chat</h1><p>Aus dem E-Mail-Chaos wird ein klarer Chat.</p></div>

  <div class="topbar">
    <span class="tb-label">Gmail</span>
    <span class="switch">Klassisch <span id="ios-toggle"></span> Chat</span>
    <span id="gear">⚙️</span>
  </div>

  <div class="window">
    <div class="sidebar">
      <div class="sbhead">Posteingang</div>
      <div id="maillist"></div>
    </div>
    <div class="reading">
      <div id="classic">
        <div class="subj">Antw: Wtrlt: Sommerfest 2026</div>
        <div class="blk"><div class="ch">Anna Berg &lt;anna.berg@…&gt;</div>
          <div class="cb">Perfekt, Donnerstag 14 Uhr passt. Danke dir!
            <div class="q">&gt; Am 12.06. schrieb Du: Hi Anna, ja — sieht super aus…
              <div class="q">&gt;&gt; Am 11.06. schrieb Anna Berg: Hallo! Hast du das Briefing…
                <div class="q">&gt;&gt;&gt; Anfang der weitergeleiteten Nachricht: Von: Eventlocation München, Betreff: Angebot…
                  <div class="q">&gt;&gt;&gt;&gt; Mit freundlichen Grüßen, Anna Berg, Stadtwerk Kultur gGmbH, Tel: 089 123 456 78, …</div></div></div></div></div></div>
        <div class="blk"><div class="ch">Du &lt;du@…&gt;</div>
          <div class="cb">Hi Anna, ja — sieht super aus. Wann passt dir ein Call?
            <div class="q">&gt; … weitere 8 zitierte Ebenen …</div></div></div>
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
