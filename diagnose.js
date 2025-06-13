// ============================================================
// Mail to Chat — Diagnose-Script v1.0.4
// In Gmail-Tab in DevTools-Konsole einfügen (F12 → Console → Paste)
// ============================================================

(function diagnose() {
  const out = [];
  const ok  = (msg) => out.push('✅ ' + msg);
  const err = (msg) => out.push('❌ ' + msg);
  const inf = (msg) => out.push('ℹ️  ' + msg);

  // 1. Extension-Instanz
  const gen = document.documentElement.dataset.chatmailGen;
  const ver = document.documentElement.dataset.mailToChat;
  gen ? ok(`Generation-Counter: ${gen}`) : err('chatmailGen fehlt — Content-Script nicht gelaufen');
  ver ? ok(`Version im DOM: ${ver}`) : err('mailToChat-Version fehlt');

  // 2. Toolbar-Elemente
  const grp  = document.getElementById('chatmail-tb-group');
  const btn  = document.getElementById('chatmail-toggle-tb');
  const gear = document.getElementById('chatmail-settings-btn');
  grp  ? ok(`GROUP gefunden, display="${grp.style.display}", z-index="${grp.style.zIndex}"`)
       : err('chatmail-tb-group FEHLT');
  btn  ? ok(`Toggle-Button gefunden, innerHTML="${btn.innerHTML.slice(0,60)}"`)
       : err('chatmail-toggle-tb FEHLT');
  gear ? ok('Gear-Button gefunden') : inf('Gear-Button nicht vorhanden');

  // 3. Toolbar-Container
  const toolbars = Array.from(document.querySelectorAll('div[gh="mtb"]'));
  inf(`div[gh="mtb"] Knoten: ${toolbars.length}`);
  toolbars.forEach((t, i) => {
    const r = t.getBoundingClientRect();
    inf(`  [${i}] pos=${t.style.position} rect=(${Math.round(r.left)},${Math.round(r.top)},w=${Math.round(r.width)},h=${Math.round(r.height)})`);
  });

  // 4. Thread-Header
  const headers = Array.from(document.querySelectorAll('h2.hP'));
  inf(`h2.hP Knoten: ${headers.length}`);
  headers.forEach((h, i) => {
    const rects = h.getClientRects();
    inf(`  [${i}] sichtbar=${rects.length > 0} text="${(h.textContent||'').slice(0,50)}"`);
  });

  // 5. Nachrichten-Nodes (div.adn)
  const adnAll     = document.querySelectorAll('div.adn');
  const adnVisible = Array.from(adnAll).filter(el => el.getClientRects().length > 0);
  adnAll.length
    ? (adnVisible.length
        ? ok(`div.adn: ${adnAll.length} total, ${adnVisible.length} sichtbar`)
        : err(`div.adn: ${adnAll.length} gefunden, aber 0 sichtbar → activate() gibt false zurück!`))
    : err('Keine div.adn-Elemente — Gmail hat andere Struktur oder Mail ist nicht aufgeklappt');

  // 6. Klick-Test
  if (btn) {
    inf('Klick-Test auf Toggle-Button → schau ob [Mail to Chat] Toggle geklickt in der Konsole erscheint:');
    btn.click();
  }

  // 7. Overlay-Check: liegt etwas ÜBER dem Button?
  if (btn) {
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top  + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    if (top === btn || btn.contains(top)) {
      ok(`Kein Overlay: elementFromPoint(${Math.round(cx)},${Math.round(cy)}) trifft Button direkt`);
    } else {
      err(`OVERLAY GEFUNDEN: elementFromPoint trifft "${top?.tagName}.${top?.className?.slice?.(0,60)}" statt den Button!`);
      err(`  → Das Element blockiert alle Klicks auf den Button.`);
    }
  }

  // 8. Pointer-Events
  if (btn) {
    const pe = getComputedStyle(btn).pointerEvents;
    pe === 'none'
      ? err(`pointer-events: none auf Button → Klicks werden ignoriert!`)
      : ok(`pointer-events: ${pe}`);
    let el = btn.parentElement;
    while (el && el !== document.body) {
      const ppe = getComputedStyle(el).pointerEvents;
      if (ppe === 'none') {
        err(`pointer-events: none auf ELTERNELEMENT ${el.tagName}#${el.id}.${el.className.slice?.(0,40)}`);
        break;
      }
      el = el.parentElement;
    }
  }

  // 9. Chrome-Context
  try {
    const alive = typeof chrome !== 'undefined' && !!chrome.runtime?.id && !!chrome.storage?.sync;
    alive ? ok(`Extension-Context lebt: runtime.id="${chrome.runtime.id}"`)
           : err('Extension-Context TOT — chrome.runtime.id fehlt → getSettings() gibt nur Defaults zurück');
  } catch(e) {
    err('chrome.*-Zugriff wirft: ' + e);
  }

  // Ausgabe
  console.log('\n=== Mail to Chat Diagnose ===');
  out.forEach(l => console.log(l));
  console.log('=== Ende ===\n');
  return out;
})();

// ============================================================
// ICON-RENDERING DIAGNOSE (separat ausführen wenn Icons unsichtbar)
// Zeigt für jeden Toolbar-Button wie Gmail das Icon rendert:
// icon-font (color) | SVG-fill | CSS-mask (background-color) | background-image
// ============================================================
(function diagnoseIcons() {
  const toolbar = document.querySelector('div[gh="mtb"]');
  if (!toolbar) { console.log('❌ Kein toolbar div[gh="mtb"] gefunden'); return; }

  const buttons = Array.from(toolbar.querySelectorAll('.T-I, [role="button"]'))
    .filter(b => !b.id.startsWith('chatmail')); // unsere Buttons überspringen

  console.log(`\n=== Icon-Diagnose: ${buttons.length} Buttons in div[gh="mtb"] ===`);

  buttons.forEach((btn, i) => {
    const cs = getComputedStyle(btn);
    console.log(`\n▶ Button ${i}: class="${btn.className.slice(0,70)}" aria-label="${btn.getAttribute('aria-label')||''}"`);
    console.log(`  color=${cs.color} | background=${cs.backgroundColor}`);

    const children = Array.from(btn.querySelectorAll('*')).slice(0, 8);
    children.forEach((child, j) => {
      const s = getComputedStyle(child);
      const maskImg = (s.webkitMaskImage || s.maskImage || 'none');
      const bgImg   = s.backgroundImage;
      const fill    = s.fill;
      const color   = s.color;
      const bgColor = s.backgroundColor;
      const font    = s.fontFamily;
      const text    = (child.textContent || '').trim().slice(0, 20);

      // Nur interessante Properties ausgeben
      const parts = [`  Child[${j}] <${child.tagName}> class="${child.className.slice(0,40)}"`];
      if (maskImg !== 'none') parts.push(`    🎭 CSS-MASK → mask-image: ${maskImg.slice(0,80)}`);
      if (bgImg !== 'none')   parts.push(`    🖼  BG-IMAGE → ${bgImg.slice(0,80)}`);
      if (fill !== 'rgb(0, 0, 0)' && fill !== 'none') parts.push(`    ▲ SVG fill=${fill}`);
      if (font.includes('Material') || font.includes('Symbols') || font.includes('Icons'))
        parts.push(`    🔤 ICON-FONT → font="${font.slice(0,60)}" text="${text}"`);
      if (bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent')
        parts.push(`    🎨 background-color=${bgColor}`);
      if (parts.length > 1) console.log(parts.join('\n'));
    });
  });
  console.log('\n=== Icon-Diagnose Ende ===');
})();
