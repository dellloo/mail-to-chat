import type { MessageObject, ParserLanguage } from '@chatmail/core';
import { buildCss, DEFAULT_SETTINGS, ICONS, isDarkColor, renderMessages, THEMES, type ChatSettings } from '@chatmail/ui';

/** Options Page: liest/schreibt chrome.storage.sync, mit Live-Vorschau. */

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Element nicht gefunden: ${sel}`);
  return el;
};

let settings: ChatSettings = { ...DEFAULT_SETTINGS, custom: { ...DEFAULT_SETTINGS.custom } };

/* ---------- Lokalisierung der Options Page (DE/EN) ---------- */

const OPTIONS_I18N: Record<'de' | 'en', Record<string, string>> = {
  de: {
    tagline: 'Deine Mails. Dein Tempo. Kein Chaos.', badge: '100% LOKAL',
    hTheme: 'Chat-Design', hDisplay: 'Darstellung', hIdentity: 'Identität', hBehavior: 'Verhalten',
    hSkin: 'Design', hLang: 'Sprachen', hPreview: 'Live-Vorschau', hTip: 'Profi-Tipp: Geteilte Ansicht',
    ownBubble: 'Eigene Bubble', ownText: 'Eigene Textfarbe', otherBubble: 'Fremde Bubble',
    otherText: 'Fremde Textfarbe', bgColor: 'Hintergrund', radius: 'Randradius',
    fontSize: 'Schriftgröße', fsSmall: 'Klein', fsNormal: 'Normal', fsLarge: 'Groß',
    timestamps: 'Zeitstempel', tsAlways: 'Immer sichtbar', tsHover: 'Nur beim Hover', tsHidden: 'Versteckt',
    ownName: 'Eigener Name', ownEmails: 'Eigene E-Mail-Adressen (eine pro Zeile, Alias-Support)',
    identityHint: 'Wird sonst automatisch aus Gmail erkannt. Bestimmt, welche Bubbles rechts (deine) stehen.',
    optSig: 'Signaturen einklappen', optAtts: 'Anhänge-Galerie anzeigen',
    optDates: 'Datums-Trenner („Heute", „Gestern")',
    behaviorHint: 'Wenn aktiv: jede E-Mail wird automatisch als Chat-Ansicht geöffnet – ohne Ausnahme. Hier kannst du den Chat-Modus dauerhaft an- oder abschalten.',
    skinEnable: 'Komplette Gmail-Oberfläche umgestalten', skinPresets: 'Empfohlene Designs (stylen Gmail UND Chat)',
    skinAccent: 'Akzentfarbe', skinBg: 'Hintergrund', skinSurface: 'Flächen/Listen', skinText: 'Textfarbe',
    skinRadius: 'Eckenrundung', skinFont: 'Schriftart', skinFontDefault: 'Gmail-Standard', skinCompact: 'Kompakte Dichte',
    skinHint: 'Wirkt sofort in allen offenen Gmail-Tabs. Gmail ändert gelegentlich seinen Code - falls etwas komisch aussieht: Skin kurz aus- und wieder einschalten oder auf Update warten.',
    quoteDetect: 'Zitat-Erkennung in Mails', lDe: 'Deutsch', lEn: 'Englisch', lFr: 'Französisch', lEs: 'Spanisch', lIt: 'Italienisch',
    autosave: 'Änderungen werden automatisch gespeichert', savedNow: '✓ Gespeichert',
    chatSeparate: 'Chat-Design separat anpassen', chatSeparateHint: 'Aus = der Chat folgt automatisch dem allgemeinen Design oben.',
    tipBody: 'Mail-Liste und offene Mail nebeneinander (wie in Thunderbird) ist eine <strong>native Gmail-Funktion</strong> und funktioniert perfekt mit der Chat-Ansicht:<br><br>In Gmail: <strong>Zahnrad-Symbol (oben rechts) → „Lesebereich" → „Rechts neben dem Posteingang"</strong>',
    bmcText: 'Hey, ich bin Dello :) Ich baue Mail to Chat ganz alleine in meiner Freizeit – ohne Werbung, ohne Tracking, ohne Abo. Wenn dieses Tool deinen Mail-Alltag ein Stück schöner und übersichtlicher macht, freue ich mich riesig über einen Kaffee :)<br><strong>Versprochen: Alle Funktionen bleiben für immer kostenlos.</strong>',
    bmcBtn: `${ICONS.coffee} Spendier mir einen Kaffee`,
    footer: 'Mail to Chat v1.0.9 · Alle Daten bleiben auf deinem Gerät · Open Source',
  },
  en: {
    tagline: 'Your mail. Your pace. No chaos.', badge: '100% LOCAL',
    hTheme: 'Chat design', hDisplay: 'Display', hIdentity: 'Identity', hBehavior: 'Behavior',
    hSkin: 'Design', hLang: 'Languages', hPreview: 'Live preview', hTip: 'Pro tip: Split view',
    ownBubble: 'Your bubble', ownText: 'Your text color', otherBubble: 'Their bubble',
    otherText: 'Their text color', bgColor: 'Background', radius: 'Corner radius',
    fontSize: 'Font size', fsSmall: 'Small', fsNormal: 'Normal', fsLarge: 'Large',
    timestamps: 'Timestamps', tsAlways: 'Always visible', tsHover: 'On hover only', tsHidden: 'Hidden',
    ownName: 'Your name', ownEmails: 'Your email addresses (one per line, alias support)',
    identityHint: 'Otherwise detected automatically from Gmail. Determines which bubbles appear on the right (yours).',
    optSig: 'Collapse signatures', optAtts: 'Show attachment gallery',
    optDates: 'Date separators ("Today", "Yesterday")',
    behaviorHint: 'When active: every email opens automatically in chat view – without exception. Toggle chat mode permanently on or off here.',
    skinEnable: 'Restyle the entire Gmail interface', skinPresets: 'Recommended designs (style Gmail AND chat)',
    skinAccent: 'Accent color', skinBg: 'Background', skinSurface: 'Surfaces/lists', skinText: 'Text color',
    skinRadius: 'Corner radius', skinFont: 'Font', skinFontDefault: 'Gmail default', skinCompact: 'Compact density',
    skinHint: 'Applies instantly in all open Gmail tabs. Gmail occasionally changes its code - if something looks off, toggle the skin off and on or wait for an update.',
    quoteDetect: 'Quote detection in mails', lDe: 'German', lEn: 'English', lFr: 'French', lEs: 'Spanish', lIt: 'Italian',
    autosave: 'Changes are saved automatically', savedNow: '✓ Saved',
    chatSeparate: 'Customize chat design separately', chatSeparateHint: 'Off = the chat automatically follows the overall design above.',
    tipBody: 'Mail list and open mail side by side (like Thunderbird) is a <strong>native Gmail feature</strong> and works perfectly with the chat view:<br><br>In Gmail: <strong>gear icon (top right) → "Reading pane" → "Right of inbox"</strong>',
    bmcText: "Hey, I'm Dello :) I build Mail to Chat all by myself in my free time - no ads, no tracking, no subscription. If this tool makes your daily email routine a bit nicer and clearer, I'd be absolutely thrilled to receive a coffee :)<br><strong>Promised: All features will remain free forever.</strong>",
    bmcBtn: `${ICONS.coffee} Buy me a coffee`,
    footer: 'Mail to Chat v1.0.9 · All data stays on your device · Open source',
  },
};

function applyOptionsLanguage(): void {
  const t = OPTIONS_I18N[settings.uiLanguage] ?? OPTIONS_I18N.de;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key && t[key]) el.innerHTML = t[key] as string;
  });
  document.documentElement.lang = settings.uiLanguage;
}

/* ---------- Empfohlene Gmail-Skin-Designs ---------- */

const SKIN_PRESETS: { label: string; chatThemeId?: string; skin: ChatSettings['gmailSkin'] }[] = [
  { label: 'Bumblebee', chatThemeId: 'bumblebee', skin: { enabled: true, accent: '#e6b400', bg: '#101216', surface: '#1a1d23', text: '#eceef2', radius: 12, font: '', compact: false, flair: 'none' } },
  { label: 'Discord Dark', chatThemeId: 'discord', skin: { enabled: true, accent: '#5865F2', bg: '#313338', surface: '#2B2D31', text: '#DBDEE1', radius: 10, font: '', compact: false, flair: 'none' } },
  { label: 'WhatsApp Night', chatThemeId: 'whatsapp', skin: { enabled: true, accent: '#25D366', bg: '#111B21', surface: '#202C33', text: '#E9EDEF', radius: 12, font: '', compact: false, flair: 'none' } },
  { label: 'Telegram Night', chatThemeId: 'telegram', skin: { enabled: true, accent: '#2AABEE', bg: '#0E1621', surface: '#17212B', text: '#F5F5F5', radius: 14, font: '', compact: false, flair: 'none' } },
  { label: 'Clean Light', chatThemeId: 'imessage', skin: { enabled: true, accent: '#1A73E8', bg: '#F6F8FC', surface: '#FFFFFF', text: '#1F1F1F', radius: 14, font: '', compact: false, flair: 'none' } },
  { label: 'Slack Aubergine', chatThemeId: 'slack', skin: { enabled: true, accent: '#2BAC76', bg: '#19171D', surface: '#3F0E40', text: '#FFFFFF', radius: 8, font: '', compact: false, flair: 'none' } },
  { label: 'Pride', skin: { enabled: true, accent: '#FF4FA3', bg: '#16121C', surface: '#231B2E', text: '#F4EEF9', radius: 14, font: '', compact: false, flair: 'pride' } },
];

/** Chat-Design aus einem Preset ableiten: benanntes Theme oder Farb-Ableitung. */
function applyChatFromPreset(p: { chatThemeId?: string; skin: ChatSettings['gmailSkin'] }): void {
  if (p.chatThemeId) {
    settings.themeId = p.chatThemeId;
  } else {
    deriveChatFromSkin(p.skin);
  }
}

/** Custom-Chat-Theme aus den Skin-Farben ableiten (ein Stil ueberall). */
function deriveChatFromSkin(skin: ChatSettings['gmailSkin']): void {
  settings.themeId = 'custom';
  settings.custom = {
    ownBubble: skin.accent,
    ownText: isDarkColor(skin.accent) ? '#ffffff' : '#1a1a1a',
    otherBubble: skin.surface,
    otherText: skin.text,
    background: skin.bg,
    radius: Math.max(8, Math.min(24, skin.radius + 4)),
  };
}

function renderSkinPresets(): void {
  const wrap = document.querySelector<HTMLElement>('#skin-presets');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const p of SKIN_PRESETS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'theme-chip';
    chip.innerHTML = `<span class="swatch" style="background:${p.skin.accent}"></span>${p.label}`;
    chip.addEventListener('click', () => {
      settings.gmailSkin = { ...p.skin };
      if (!settings.chatThemeSeparate) applyChatFromPreset(p);
      fillForm();
      scheduleSave();
    });
    wrap.appendChild(chip);
  }
}

/** Beispiel-Chat für die Live-Vorschau - lokalisiert (DE/EN). */
function sampleMessages(lang: 'de' | 'en'): MessageObject[] {
  const t =
    lang === 'en'
      ? {
          q: 'Hi! Can we move the meeting to 3 pm?',
          a: 'Sure, works even better for me. 👍',
          c: 'Great, see you later! Agenda attached.',
          me: 'You',
          file: 'agenda.pdf',
        }
      : {
          q: 'Hi! Können wir das Meeting auf 15 Uhr verschieben?',
          a: 'Klar, passt mir sogar besser. 👍',
          c: 'Super, dann bis später! Anbei noch die Agenda.',
          me: 'Du',
          file: 'agenda.pdf',
        };
  return [
    {
      sender: { name: 'Max Mustermann', email: 'max@example.com' },
      timestamp: '09:14',
      bodyHtml: t.q,
      bodyText: '',
      attachments: [],
      isOwn: false,
    },
    {
      sender: { name: t.me },
      timestamp: '09:21',
      bodyHtml: t.a,
      bodyText: '',
      attachments: [],
      isOwn: true,
      signatureHtml: 'Dello<br>Mail to Chat',
    },
    {
      sender: { name: 'Max Mustermann', email: 'max@example.com' },
      timestamp: '09:25',
      bodyHtml: t.c,
      bodyText: '',
      attachments: [{ kind: 'file', name: t.file, url: '#' }],
      isOwn: false,
    },
  ];
}

function renderPreview(): void {
  const preview = $('#preview');
  preview.innerHTML = `<style>${buildCss(settings).replace(':host { all: initial; }', '')}</style>${renderMessages(
    sampleMessages(settings.uiLanguage),
    settings,
  )}`;
  renderSkinPreview();
}

/** Segmented Control: aktive Sprache markieren. */
function syncLangSeg(): void {
  document.querySelectorAll<HTMLButtonElement>('#ui-language-seg button').forEach((b) => {
    b.classList.toggle('on', b.getAttribute('data-lang') === settings.uiLanguage);
  });
}

/** Mini-Gmail-Mock: zeigt Skin-Änderungen (Farben, Radius, Font, Dichte) sofort. */
function renderSkinPreview(): void {
  const el = document.querySelector<HTMLElement>('#skin-preview');
  if (!el) return;
  const s = settings.gmailSkin;
  if (!s.enabled) {
    el.innerHTML = '';
    return;
  }
  const font = s.font ? `font-family:${s.font};` : '';
  const PRIDE = 'linear-gradient(90deg,#e40303,#ff8c00,#ffed00,#008026,#24408e,#732982)';
  const flairTop = s.flair === 'pride' ? `<div style="height:4px;border-radius:99px;background:${PRIDE};margin-bottom:8px"></div>` : '';
  const flairBottom = s.flair === 'paws' ? `<div style="font-size:13px;opacity:.4;letter-spacing:14px;margin-top:6px">🐾 🦊 🐾 🐢 🐾 🦁</div>` : '';
  const composeBg = s.flair === 'pride' ? `background:${PRIDE};color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.4)` : `background:${s.accent};color:#1a1a1a`;
  const row = (unread: boolean, from: string, subj: string): string => `
    <div style="background:${s.surface};color:${s.text};border-radius:${s.radius}px;padding:${s.compact ? '3px' : '8px'} 12px;margin:4px 0;display:flex;gap:10px;align-items:center;font-weight:${unread ? 700 : 400};${font}font-size:12.5px">
      <span style="opacity:.7;min-width:96px;flex-shrink:0">${from}</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${subj}</span>
    </div>`;
  el.innerHTML = `
    <div style="background:${s.bg};border-radius:12px;padding:12px;margin-top:14px;box-shadow:inset 0 0 0 1px rgba(128,128,128,0.2)">
      ${flairTop}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="${composeBg};font-weight:700;border-radius:${Math.round(s.radius * 1.4)}px;padding:6px 14px;font-size:12px;${font}box-shadow:0 1px 4px rgba(0,0,0,0.25)">Schreiben</span>
        <span style="background:${s.surface};border-radius:${s.radius}px;flex:1;padding:6px 12px;color:${s.text};opacity:.6;font-size:12px;${font}">In E-Mails suchen</span>
      </div>
      ${row(true, 'Max Mustermann', 'Meeting morgen 15 Uhr?')}
      ${row(false, 'DHL Paket', 'Ihre Sendung ist unterwegs')}
      ${row(false, 'Anna Beispiel', 'Re: Budget Q3 - passt so!')}
      <div style="text-align:right;margin-top:8px"><span style="color:${s.accent};font-size:11.5px;${font}">Link-Akzent ›</span></div>
      ${flairBottom}
    </div>`;
}

function renderThemeChips(): void {
  const wrap = $('#themes');
  wrap.innerHTML = '';
  const all = [
    ...THEMES,
    { id: 'custom', label: 'Custom', ownBubble: settings.custom.ownBubble, otherBubble: settings.custom.otherBubble },
  ];
  for (const t of all) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'theme-chip' + (settings.themeId === t.id ? ' sel' : '');
    // Doppel-Swatch: eigene + fremde Bubble-Farbe auf einen Blick
    const own = t.ownBubble && !t.ownBubble.startsWith('linear') ? t.ownBubble : '#888';
    const other = 'otherBubble' in t && t.otherBubble ? t.otherBubble : '#ccc';
    chip.innerHTML = `<span class="swatch" style="background:${own};z-index:1;position:relative"></span><span class="swatch" style="background:${other};margin-left:-9px"></span>${t.label}`;
    chip.addEventListener('click', () => {
      settings.themeId = t.id;
      renderThemeChips();
      syncCustomVisibility();
      renderPreview();
      scheduleSave();
    });
    wrap.appendChild(chip);
  }
}

function syncCustomVisibility(): void {
  $('#custom-fields').classList.toggle('visible', settings.themeId === 'custom');
}

function fillForm(): void {
  renderThemeChips();
  syncCustomVisibility();
  ($('#c-own') as HTMLInputElement).value = settings.custom.ownBubble;
  ($('#c-own-text') as HTMLInputElement).value = settings.custom.ownText;
  ($('#c-other') as HTMLInputElement).value = settings.custom.otherBubble;
  ($('#c-other-text') as HTMLInputElement).value = settings.custom.otherText;
  ($('#c-bg') as HTMLInputElement).value = settings.custom.background;
  ($('#c-radius') as HTMLInputElement).value = String(settings.custom.radius);
  $('#c-radius-val').textContent = `${settings.custom.radius}px`;
  ($('#font-size') as HTMLSelectElement).value = settings.fontSize;
  ($('#timestamps') as HTMLSelectElement).value = settings.timestamps;
  ($('#own-name') as HTMLInputElement).value = settings.ownName;
  ($('#own-emails') as HTMLTextAreaElement).value = settings.ownEmails.join('\n');
  ($('#chat-separate') as HTMLInputElement).checked = settings.chatThemeSeparate;
  $('#chat-theme-fields').classList.toggle('visible', settings.chatThemeSeparate);
  ($('#filter-sig') as HTMLInputElement).checked = settings.filterSignatures;
  ($('#show-atts') as HTMLInputElement).checked = settings.showAttachments;
  ($('#date-separators') as HTMLInputElement).checked = settings.showDateSeparators;
  syncLangSeg();
  document.querySelectorAll<HTMLInputElement>('.lang').forEach((cb) => {
    cb.checked = settings.languages.includes(cb.value as ParserLanguage);
  });
  ($('#skin-enabled') as HTMLInputElement).checked = settings.gmailSkin.enabled;
  ($('#skin-accent') as HTMLInputElement).value = settings.gmailSkin.accent;
  ($('#skin-bg') as HTMLInputElement).value = settings.gmailSkin.bg;
  ($('#skin-surface') as HTMLInputElement).value = settings.gmailSkin.surface;
  ($('#skin-text') as HTMLInputElement).value = settings.gmailSkin.text;
  ($('#skin-radius') as HTMLInputElement).value = String(settings.gmailSkin.radius);
  $('#skin-radius-val').textContent = `${settings.gmailSkin.radius}px`;
  ($('#skin-font') as HTMLSelectElement).value = settings.gmailSkin.font;
  ($('#skin-compact') as HTMLInputElement).checked = settings.gmailSkin.compact;
  renderPreview();
}

function readForm(): void {
  const prevSkinJson = JSON.stringify(settings.gmailSkin);
  settings.custom.ownBubble = ($('#c-own') as HTMLInputElement).value;
  settings.custom.ownText = ($('#c-own-text') as HTMLInputElement).value;
  settings.custom.otherBubble = ($('#c-other') as HTMLInputElement).value;
  settings.custom.otherText = ($('#c-other-text') as HTMLInputElement).value;
  settings.custom.background = ($('#c-bg') as HTMLInputElement).value;
  settings.custom.radius = Number(($('#c-radius') as HTMLInputElement).value);
  settings.fontSize = ($('#font-size') as HTMLSelectElement).value as ChatSettings['fontSize'];
  settings.timestamps = ($('#timestamps') as HTMLSelectElement).value as ChatSettings['timestamps'];
  settings.ownName = ($('#own-name') as HTMLInputElement).value.trim();
  settings.ownEmails = ($('#own-emails') as HTMLTextAreaElement).value
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));
  {
    const wasSeparate = settings.chatThemeSeparate;
    settings.chatThemeSeparate = ($('#chat-separate') as HTMLInputElement).checked;
    $('#chat-theme-fields').classList.toggle('visible', settings.chatThemeSeparate);
    // Separat ausgeschaltet: Chat wieder ans allgemeine Design koppeln
    if (wasSeparate && !settings.chatThemeSeparate && settings.gmailSkin.enabled) {
      const match = SKIN_PRESETS.find(
        (pr) => pr.skin.accent === settings.gmailSkin.accent && pr.skin.bg === settings.gmailSkin.bg,
      );
      if (match) applyChatFromPreset(match);
      else deriveChatFromSkin(settings.gmailSkin);
      renderThemeChips();
    }
  }
  settings.filterSignatures = ($('#filter-sig') as HTMLInputElement).checked;
  settings.showAttachments = ($('#show-atts') as HTMLInputElement).checked;
  settings.showDateSeparators = ($('#date-separators') as HTMLInputElement).checked;
  // uiLanguage wird über das Segmented Control gesetzt (eigener Click-Handler)
  settings.languages = Array.from(document.querySelectorAll<HTMLInputElement>('.lang:checked')).map(
    (cb) => cb.value as ParserLanguage,
  );
  if (settings.languages.length === 0) settings.languages = ['de', 'en'];
  $('#c-radius-val').textContent = `${settings.custom.radius}px`;
  settings.gmailSkin = {
    enabled: ($('#skin-enabled') as HTMLInputElement).checked,
    accent: ($('#skin-accent') as HTMLInputElement).value,
    bg: ($('#skin-bg') as HTMLInputElement).value,
    surface: ($('#skin-surface') as HTMLInputElement).value,
    text: ($('#skin-text') as HTMLInputElement).value,
    radius: Number(($('#skin-radius') as HTMLInputElement).value),
    font: ($('#skin-font') as HTMLSelectElement).value,
    compact: ($('#skin-compact') as HTMLInputElement).checked,
    flair: settings.gmailSkin.flair, // wird über Presets gesetzt, manuelle Edits behalten es
  };
  if (!settings.chatThemeSeparate && settings.gmailSkin.enabled && prevSkinJson !== JSON.stringify(settings.gmailSkin)) {
    deriveChatFromSkin(settings.gmailSkin);
    renderThemeChips();
  }
  $('#skin-radius-val').textContent = `${settings.gmailSkin.radius}px`;
}

/** Auto-Save: debounced, mit dezentem Status-Feedback. */
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let statusTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.sync.set(settings, () => {
      const t = OPTIONS_I18N[settings.uiLanguage] ?? OPTIONS_I18N.de;
      const status = $('#status');
      status.classList.add('saved');
      status.innerHTML = `<span>${t['savedNow']}</span>`;
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        status.classList.remove('saved');
        status.innerHTML = `<span data-i18n="autosave">${t['autosave']}</span>`;
      }, 1800);
    });
  }, 400);
}

document.addEventListener('DOMContentLoaded', () => {
  // Roh-Storage lesen: nur wenn der Nutzer NIE eine Sprache gewählt hat,
  // greift die Browser-Sprache als Standard (de → DE, sonst EN).
  chrome.storage.sync.get(null, (raw) => {
    const items = (raw ?? {}) as Partial<ChatSettings>;
    const detected: ChatSettings['uiLanguage'] = (navigator.language || '').toLowerCase().startsWith('de')
      ? 'de'
      : 'en';
    settings = {
      ...DEFAULT_SETTINGS,
      uiLanguage: detected,
      ...items,
      custom: { ...DEFAULT_SETTINGS.custom, ...items.custom },
      gmailSkin: { ...DEFAULT_SETTINGS.gmailSkin, ...items.gmailSkin },
    };
    fillForm();
    renderSkinPresets();
    applyOptionsLanguage();
  });

  // Sprach-Switcher: 1 Klick, beide Optionen sichtbar
  document.querySelectorAll<HTMLButtonElement>('#ui-language-seg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.uiLanguage = (btn.getAttribute('data-lang') as ChatSettings['uiLanguage']) ?? 'de';
      syncLangSeg();
      applyOptionsLanguage();
      renderPreview();
      scheduleSave();
    });
  });
  // Live-Vorschau + Auto-Save bei jeder Eingabe (inkl. Sprachwechsel)
  document.body.addEventListener('input', () => {
    readForm();
    renderPreview();
    applyOptionsLanguage();
    scheduleSave();
  });
});
