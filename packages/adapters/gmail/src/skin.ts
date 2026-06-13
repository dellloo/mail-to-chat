import { isDarkColor, type ChatSettings } from '@chatmail/ui';

/**
 * Gmail-Skin-Engine (Beta): legt ein CSS-Layer über die GESAMTE Gmail-Oberfläche.
 * Defensiv gebaut: Gmail-Klassennamen sind obfuskiert und ändern sich -
 * jede Regel degradiert sanft, wenn ein Selektor nicht mehr greift.
 */

const STYLE_ID = 'chatmail-skin';

export function buildSkinCss(skin: ChatSettings['gmailSkin']): string {
  const { accent, bg, surface, text, radius } = skin;
  const font = skin.font
    ? `html.cm-skin, html.cm-skin body, html.cm-skin * { font-family: ${skin.font}, -apple-system, sans-serif !important; }`
    : '';
  const compact = skin.compact
    ? `html.cm-skin .zA { height: 28px !important; }
       html.cm-skin .nH .aeF { line-height: 1.25 !important; }`
    : '';
  // Flair: Pride (Regenbogen-Akzente) oder Dots (Punkte-Muster für Kids)
  const PRIDE = 'linear-gradient(90deg,#e40303,#ff8c00,#ffed00,#008026,#24408e,#732982)';
  const flair =
    skin.flair === 'pride'
      ? `html.cm-skin body::before { content:''; position:fixed; top:0; left:0; right:0; height:4px; z-index:2147483647; pointer-events:none; background:${PRIDE}; }
         html.cm-skin .T-I.T-I-KE { background:${PRIDE} !important; color:#fff !important; text-shadow:0 1px 2px rgba(0,0,0,0.45); }
         html.cm-skin ::selection { background:#ff8c0055; }`
      : skin.flair === 'paws'
        ? `html.cm-skin body { background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Ctext x='14' y='52' font-size='38' opacity='0.09'%3E%F0%9F%A6%8A%3C/text%3E%3Ctext x='120' y='96' font-size='34' opacity='0.08' transform='rotate(12 140 80)'%3E%F0%9F%90%A2%3C/text%3E%3Ctext x='30' y='156' font-size='36' opacity='0.08' transform='rotate(-10 50 140)'%3E%F0%9F%A6%81%3C/text%3E%3Ctext x='140' y='196' font-size='28' opacity='0.10'%3E%F0%9F%90%BE%3C/text%3E%3C/svg%3E") !important; background-size: 220px 220px !important; }`
        : '';

  // Dunkler Skin: Original-Mails sind für WEISSEN Hintergrund designt -
  // Inline-Farben im klassischen Mail-Body neutralisieren (wie im Chat-Dark-Mode).
  // WICHTIG: fill muss auf svg UND alle Kinder (path/rect/circle/g) gesetzt werden,
  // da Gmail presentation-Attribute direkt auf <path> setzt und diese nicht von <svg> erben.
  // CSS fill: !important überschreibt SVG-Präsentations-Attribute in allen modernen Browsern.
  // ICON-FIX STRATEGIE v1.0.5:
  // Problem: Gmail ändert regelmäßig seine Klassen (.T-I war früher stabil, nicht mehr sicher).
  // Problem: Icons sitzen 1-3 Ebenen tief in Buttons, direkte Kind-Selektoren greifen nicht.
  // Lösung:
  //   - Kein Klassen-Abhängigkeit: statt .T-I → [role="button"] + <button>
  //   - Chatmail-Buttons ausschließen via id-Attribut (stabil)
  //   - filter:brightness(0)invert(1) macht JEDE Farbe weiß (transparent bleibt transparent)
  //   - 3-Ebenen-Tiefe deckt alle bekannten Gmail-Icon-Verschachtelungen ab
  //   - fill+color zusätzlich für SVG + Icon-Fonts
  const darkMailFix = isDarkColor(bg)
    ? `/* === Dark-Theme v1.0.5: Nuclear Icon Fix ===
          Kein .T-I-Abhängigkeit. [role=button]+button in Toolbars,
          3 Ebenen tief, chatmail-Buttons via id ausgeschlossen. === */

       /* 1. Toolbar-Buttons: color für Icon-Fonts (die via CSS color rendern) */
       html.cm-skin div[gh="mtb"] [role="button"]:not([id*="chatmail"]),
       html.cm-skin div[gh="mtb"] button:not([id*="chatmail"]),
       html.cm-skin .G-atb [role="button"]:not([id*="chatmail"]) { color: ${text} !important; opacity: 1 !important; }

       /* 2. SVG fill: Präsentations-Attribute überschreiben */
       html.cm-skin div[gh="mtb"] [role="button"]:not([id*="chatmail"]) svg,
       html.cm-skin div[gh="mtb"] [role="button"]:not([id*="chatmail"]) svg *,
       html.cm-skin div[gh="mtb"] button:not([id*="chatmail"]) svg,
       html.cm-skin div[gh="mtb"] button:not([id*="chatmail"]) svg *,
       html.cm-skin .G-atb [role="button"]:not([id*="chatmail"]) svg,
       html.cm-skin .G-atb [role="button"]:not([id*="chatmail"]) svg * { fill: ${text} !important; color: ${text} !important; }

       /* 3. NUCLEAR FILTER: brightness(0)invert(1) auf 3 Ebenen Tiefe.
          Wirkt auf CSS-Mask, background-image, inline-SVG und Icon-Fonts.
          Transparent bleibt transparent (alpha=0 überlebt den Filter). */
       html.cm-skin div[gh="mtb"] [role="button"]:not([id*="chatmail"]) > *,
       html.cm-skin div[gh="mtb"] [role="button"]:not([id*="chatmail"]) > * > *,
       html.cm-skin div[gh="mtb"] [role="button"]:not([id*="chatmail"]) > * > * > *,
       html.cm-skin div[gh="mtb"] button:not([id*="chatmail"]) > *,
       html.cm-skin div[gh="mtb"] button:not([id*="chatmail"]) > * > *,
       html.cm-skin div[gh="mtb"] button:not([id*="chatmail"]) > * > * > *,
       html.cm-skin .G-atb [role="button"]:not([id*="chatmail"]) > *,
       html.cm-skin .G-atb [role="button"]:not([id*="chatmail"]) > * > * { filter: brightness(0) invert(1) !important; }

       /* 4. Hover-Feedback */
       html.cm-skin div[gh="mtb"] [role="button"]:not([id*="chatmail"]):hover,
       html.cm-skin div[gh="mtb"] button:not([id*="chatmail"]):hover,
       html.cm-skin .G-atb [role="button"]:not([id*="chatmail"]):hover { background: rgba(255,255,255,0.10) !important; border-radius: 8px; }

       /* 5. Per-Email-Zeile hover-Icons (.zA rows) */
       html.cm-skin .zA [role="button"]:not([id*="chatmail"]) { color: ${text} !important; }
       html.cm-skin .zA [role="button"]:not([id*="chatmail"]) > *,
       html.cm-skin .zA [role="button"]:not([id*="chatmail"]) > * > * { filter: brightness(0) invert(1) !important; }
       html.cm-skin .zA [role="button"]:not([id*="chatmail"]) svg,
       html.cm-skin .zA [role="button"]:not([id*="chatmail"]) svg * { fill: ${text} !important; }

       /* 6. Stern/Wichtig/Reply Icons */
       html.cm-skin .iH svg, html.cm-skin .iH svg *,
       html.cm-skin .aJ svg, html.cm-skin .aJ svg * { fill: ${text} !important; opacity: 0.80; }

       /* 7. Meta-Labels, Datum, Sender-Chips */
       html.cm-skin .Di, html.cm-skin .ar5, html.cm-skin .Dj, html.cm-skin .amH,
       html.cm-skin .gE .g3, html.cm-skin .gH span, html.cm-skin .hb span { color: ${text} !important; opacity: 0.85; }

       /* 8. Mail-Body: Inline-Farben neutralisieren */
       html.cm-skin .a3s, html.cm-skin .a3s *:not(img):not(a) { color: ${text} !important; background: transparent !important; border-color: rgba(255,255,255,0.25) !important; }
       html.cm-skin .a3s a, html.cm-skin .a3s a * { color: #8ab4f8 !important; background: transparent !important; }
       html.cm-skin .ii.gt { background: transparent !important; }`
    : '';
  return `
/* Grundflächen */
html.cm-skin, html.cm-skin body, html.cm-skin .nH.bkK, html.cm-skin .aeJ { background: ${bg} !important; }
html.cm-skin .nH, html.cm-skin .aeF, html.cm-skin .AO { background: transparent !important; }
html.cm-skin body, html.cm-skin .zA, html.cm-skin .hP, html.cm-skin .a3s, html.cm-skin .gD { color: ${text} !important; }

/* Gmail-Settings-Seiten: innere Content-Areas mit Skin-Hintergrund abdecken.
   Ohne diese Regel gilt body-color: ${text} auf weißen settings-Hintergründen → Text unsichtbar. */
html.cm-skin .nH.bkK .w-asV,
html.cm-skin .nH.bkK .Kj,
html.cm-skin .nH.bkK .bAK { background: ${surface} !important; color: ${text} !important; }

/* Listen & Karten */
html.cm-skin .zA { background: ${surface} !important; border-radius: ${radius}px !important; margin: 2px 6px !important; border: none !important; }
html.cm-skin .zA:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.25) !important; }
html.cm-skin .zA.zE { background: ${surface} !important; filter: brightness(1.15); }
html.cm-skin .Bs, html.cm-skin .adn, html.cm-skin .gs { background: ${surface} !important; border-radius: ${radius}px !important; }
html.cm-skin .ha h2 { color: ${text} !important; }

/* Toolbar, Suche, Seitenleiste */
html.cm-skin .gb_Ne, html.cm-skin form.gb_De, html.cm-skin .aoG { background: ${surface} !important; border-radius: ${radius}px !important; }
html.cm-skin .G-atb { background: transparent !important; border-bottom: 1px solid rgba(128,128,128,0.18) !important; }
html.cm-skin .aim .TO { border-radius: 0 ${radius * 1.4}px ${radius * 1.4}px 0 !important; }
html.cm-skin .TO.nZ, html.cm-skin .aim .TO.nZ { background: ${accent}33 !important; }
html.cm-skin .TO.nZ .nU a, html.cm-skin .TO.nZ .bsU { color: ${accent} !important; font-weight: 700 !important; }

/* Akzente: Schreiben-Button, Links, aktive Elemente */
html.cm-skin .T-I.T-I-KE { background: ${accent} !important; color: #1a1a1a !important; border-radius: ${radius * 1.4}px !important; box-shadow: 0 2px 8px ${accent}66 !important; }
html.cm-skin .a3s a, html.cm-skin .nU a { color: ${accent} !important; }
html.cm-skin ::selection { background: ${accent}55; }

/* Scrollbars */
html.cm-skin ::-webkit-scrollbar { width: 10px; height: 10px; }
html.cm-skin ::-webkit-scrollbar-thumb { background: ${accent}55; border-radius: 99px; }
html.cm-skin ::-webkit-scrollbar-track { background: transparent; }

${font}
${compact}
${darkMailFix}
${flair}
`;
}

/** Skin anwenden/entfernen - live, ohne Reload. */
export function applySkin(settings: ChatSettings): void {
  const root = document.documentElement;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!settings.gmailSkin?.enabled) {
    style?.remove();
    root.classList.remove('cm-skin');
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = buildSkinCss(settings.gmailSkin);
  root.classList.add('cm-skin');
}
