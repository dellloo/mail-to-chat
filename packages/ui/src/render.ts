import { dayKey, dayLabel, parseMailDate, type MessageObject } from '@chatmail/core';
import { getTheme, type Theme } from './themes';
import { ICONS } from './icons';
import type { ChatSettings } from './settings';

/** Farb-Rotation für Gesprächspartner (Avatare + Gruppennamen). */
const GROUP_COLORS = ['#e57373', '#64b5f6', '#81c784', '#ffb74d', '#ba68c8', '#4db6ac', '#f06292', '#a1887f'];

const I18N = {
  de: {
    showSig: 'Signatur anzeigen', attachment: 'Anhang', image: 'Bild', openOriginal: 'Original öffnen ↗',
    placeholder: 'Nachricht', send: 'Senden (Enter)', fullEditor: 'Voller Gmail-Editor: Formatierung, Anhänge, CC/BCC',
    sendFailed: 'Senden fehlgeschlagen - bitte im klassischen Editor versuchen',
    exportPdf: 'Als PDF exportieren',
    contactTitle: 'Kontakt', copyMail: 'E-Mail kopieren', copied: 'Kopiert ✓',
    searchMails: 'Alle Mails dieser Person', noMail: 'E-Mail unbekannt',
    replyOne: 'Auf diese Mail antworten', forwardOne: 'Diese Mail weiterleiten',
    attach: 'Anhang hinzufügen (öffnet Gmail-Editor mit Dateiauswahl)',
    fwd: 'Weitergeleitet',
  },
  en: {
    showSig: 'Show signature', attachment: 'Attachment', image: 'Image', openOriginal: 'Open original ↗',
    placeholder: 'Message', send: 'Send (Enter)', fullEditor: 'Full Gmail editor: formatting, attachments, CC/BCC',
    sendFailed: 'Send failed - please use the classic editor',
    exportPdf: 'Export as PDF',
    contactTitle: 'Contact', copyMail: 'Copy email', copied: 'Copied ✓',
    searchMails: 'All mails from this person', noMail: 'Email unknown',
    replyOne: 'Reply to this mail', forwardOne: 'Forward this mail',
    attach: 'Add attachment (opens Gmail editor with file picker)',
    fwd: 'Forwarded',
  },
};

/** Callbacks für interaktive Chat-Funktionen (Antworten aus dem Chat). */
export interface ChatViewHandlers {
  /** Sendet eine Antwort. true = erfolgreich (Eingabe wird geleert). */
  onSend?: (text: string) => Promise<boolean>;
  /** Öffnet den vollständigen Gmail-Editor (erscheint unter dem Chat).
   *  Bereits getippter Composer-Text wird als draft übergeben und übernommen. */
  onOpenFullEditor?: (draft: string) => void;
  /** Öffnet Gmail-Editor + Datei-Anhang-Dialog (draft wird übernommen). */
  onOpenAttach?: (draft: string) => void;
  /** Auf eine BESTIMMTE Nachricht antworten (Index im Thread). */
  onReplyTo?: (index: number, draft: string) => void;
  /** Eine BESTIMMTE Nachricht weiterleiten (Index im Thread). */
  onForward?: (index: number, draft: string) => void;
}

const FONT_SIZES = { small: '12.5px', normal: '14px', large: '16px' } as const;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Initialen für Avatare: "Max Mustermann" → "MM". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return '?';
  const first = [...(words[0] ?? '')][0] ?? '?';
  const second = words.length > 1 ? [...(words[words.length - 1] ?? '')][0] ?? '' : '';
  return (first + second).toUpperCase();
}

/** Luminanz-Check: erkennt dunkle Custom-Farben (Redundanz zum dark-Flag der Themes). */
export function isDarkColor(color: string): boolean {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45;
}

/** Theme dunkel? Flag (vordefiniert) ODER Luminanz des Custom-Hintergrunds. */
function themeIsDark(t: Theme): boolean {
  return !!t.dark || (t.id === 'custom' && isDarkColor(t.background));
}

function resolveTheme(settings: ChatSettings): Theme {
  if (settings.themeId === 'custom') {
    return {
      id: 'custom',
      label: 'Custom',
      ownBubble: settings.custom.ownBubble,
      ownText: settings.custom.ownText,
      otherBubble: settings.custom.otherBubble,
      otherText: settings.custom.otherText,
      background: settings.custom.background,
      radius: settings.custom.radius,
    };
  }
  return getTheme(settings.themeId);
}

export function buildCss(settings: ChatSettings): string {
  const t = resolveTheme(settings);
  const dark = themeIsDark(t);
  // Minimal hat keinen eigenen Hintergrund: Meta-Farben muessen der UMGEBUNG
  // folgen (Gmail hell ODER dunkel) - color-mix auf currentColor macht genau das.
  const meta = t.minimal
    ? 'color-mix(in srgb, currentColor 55%, transparent)'
    : dark
      ? 'rgba(255,255,255,0.55)'
      : 'rgba(0,0,0,0.45)';
  return `
/* all:initial isoliert gegen Gmail-CSS - ABER color muss explizit wieder
   vererbt werden, sonst ist das Minimal-Theme auf Gmail-Dark unlesbar
   (Text faellt auf initial = schwarz zurueck statt Gmails heller Schrift). */
:host { all: initial; color: inherit; }
/* Variablen auf :host UND .cm-chat - Kontaktkarte/Lightbox liegen als
   Geschwister von .cm-chat im Shadow Root und brauchen sie ebenfalls. */
:host, .cm-chat {
  --cm-own-bubble: ${t.ownBubble};
  --cm-own-text: ${t.ownText};
  --cm-other-bubble: ${t.otherBubble};
  --cm-other-text: ${t.otherText};
  --cm-bg: ${t.background};
  --cm-radius: ${t.radius}px;
  --cm-meta: ${meta};
  --cm-input-bg: ${dark ? 'rgba(255,255,255,0.09)' : '#ffffff'};
  --cm-input-text: ${dark ? '#eceef2' : '#16181d'};
  --cm-card-bg: ${dark ? '#23262d' : '#ffffff'};
  --cm-font-size: ${FONT_SIZES[settings.fontSize]};
}
.cm-chat {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: var(--cm-font-size);
  line-height: 1.45;
  letter-spacing: 0.1px;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  background: var(--cm-bg);
  padding: 18px 16px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.cm-empty {
  text-align: center; padding: 36px 16px; color: var(--cm-meta);
  font-size: 1.05em;
}
@keyframes cmIn {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}
.cm-row { display: flex; flex-direction: column; max-width: 100%; animation: cmIn 0.28s cubic-bezier(0.21, 1.02, 0.55, 1) both; margin-top: 10px; }
/* Nachrichten-Gruppierung: gleiche Absender rücken zusammen (Messenger-Pattern) */
.cm-row.grp-mid, .cm-row.grp-end { margin-top: 2px; }
@media (prefers-reduced-motion: reduce) { .cm-row { animation: none; } }
.cm-row.own { align-items: flex-end; }
.cm-row.other { align-items: flex-start; }
.cm-avatar-spacer { width: 30px; flex-shrink: 0; }
.cm-msg { display: flex; gap: 8px; align-items: flex-end; max-width: 82%; }
.cm-avatar {
  width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
  background: var(--cm-sender-color, #90a4ae); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; letter-spacing: 0.3px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
  user-select: none;
}
.cm-stack { display: flex; flex-direction: column; min-width: 0; }
.cm-bubble {
  position: relative;
  padding: 8px 12px;
  border-radius: var(--cm-radius);
  background: var(--cm-other-bubble);
  color: var(--cm-other-text);
  overflow-wrap: break-word;
  word-break: break-word;
  box-shadow: 0 1px 1.5px rgba(0,0,0,0.1);
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}
.cm-bubble:hover { box-shadow: 0 3px 10px rgba(0,0,0,0.16); transform: translateY(-1px); }
@media (prefers-reduced-motion: reduce) { .cm-bubble, .cm-bubble:hover { transition: none; transform: none; } }
.cm-row.own .cm-bubble { background: var(--cm-own-bubble); color: var(--cm-own-text); }
/* Gruppen-Eckenlogik: innere Ecken zur Gesprächsseite hin abgeflacht */
.cm-row.own.grp-start .cm-bubble { border-bottom-right-radius: 6px; }
.cm-row.own.grp-mid .cm-bubble { border-top-right-radius: 6px; border-bottom-right-radius: 6px; }
.cm-row.own.grp-end .cm-bubble { border-top-right-radius: 6px; }
.cm-row.other.grp-start .cm-bubble { border-bottom-left-radius: 6px; }
.cm-row.other.grp-mid .cm-bubble { border-top-left-radius: 6px; border-bottom-left-radius: 6px; }
.cm-row.other.grp-end .cm-bubble { border-top-left-radius: 6px; }
/* Bubble-Schwänzchen am Gruppenende (background:inherit trägt auch Gradients) */
.cm-row.own.grp-end .cm-bubble, .cm-row.own.grp-solo .cm-bubble { border-bottom-right-radius: 4px; }
.cm-row.other.grp-end .cm-bubble, .cm-row.other.grp-solo .cm-bubble { border-bottom-left-radius: 4px; }
.cm-row.own.grp-end .cm-bubble::after, .cm-row.own.grp-solo .cm-bubble::after {
  content: ''; position: absolute; bottom: 0; right: -6px; width: 12px; height: 14px;
  background: inherit; clip-path: polygon(0 0, 100% 100%, 0 100%);
}
.cm-row.other.grp-end .cm-bubble::after, .cm-row.other.grp-solo .cm-bubble::after {
  content: ''; position: absolute; bottom: 0; left: -6px; width: 12px; height: 14px;
  background: inherit; clip-path: polygon(100% 0, 100% 100%, 0 100%);
}
.cm-chat.minimal .cm-bubble::after { display: none; }
.cm-chat.minimal .cm-bubble { background: transparent; box-shadow: none; padding: 2px 0; }
.cm-chat.minimal .cm-bubble:hover { transform: none; box-shadow: none; }
.cm-chat.minimal .cm-row.own .cm-bubble { font-weight: 600; text-align: right; }
.cm-chat.minimal .cm-avatar { display: none; }
.cm-sender { font-size: 0.8em; font-weight: 600; margin-bottom: 2px; color: var(--cm-sender-color, var(--cm-meta)); }
/* WhatsApp-Style Antwort-Kontext: worauf wurde geantwortet */
.cm-quote {
  display: flex; flex-direction: column; gap: 1px;
  padding: 6px 10px; margin-bottom: 6px; border-radius: 8px;
  border-left: 3px solid color-mix(in srgb, currentColor 55%, transparent);
  background: color-mix(in srgb, currentColor 10%, transparent);
  font-size: 0.86em;
}
.cm-quote[data-cm-jump] { cursor: pointer; transition: background 0.15s; }
.cm-quote[data-cm-jump]:hover { background: color-mix(in srgb, currentColor 18%, transparent); }
.cm-quote-name { font-weight: 700; font-size: 0.92em; opacity: 0.9; }
.cm-quote-text { opacity: 0.75; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.cm-quote-time { opacity: 0.5; font-size: 0.85em; font-variant-numeric: tabular-nums; }
@keyframes cmFlash { 30% { box-shadow: 0 0 0 3px var(--cm-own-bubble); } }
.cm-row.cm-flash .cm-bubble { animation: cmFlash 1.1s ease; }
.cm-time { font-size: 0.72em; color: var(--cm-meta); margin-top: 3px; padding: 0 4px; font-variant-numeric: tabular-nums; }
.cm-row.own .cm-time { text-align: right; }
.cm-chat.ts-hover .cm-time { opacity: 0; transition: opacity 0.15s; }
.cm-chat.ts-hover .cm-row:hover .cm-time { opacity: 1; }
.cm-chat.ts-hidden .cm-time { display: none; }
/* Dark Mode: Original-Mails sind für WEISSEN Hintergrund designt (Inline-Farben).
   In dunklen Themes werden Textfarben/Hintergründe innerhalb der Bubbles
   neutralisiert, damit nie dunkle Schrift auf dunklem Grund landet. */
.cm-chat.dark .cm-body, .cm-chat.dark .cm-body * {
  color: var(--cm-other-text) !important;
  background: transparent !important;
  border-color: rgba(255,255,255,0.25) !important;
}
.cm-chat.dark .cm-row.own .cm-body, .cm-chat.dark .cm-row.own .cm-body * { color: var(--cm-own-text) !important; }
.cm-chat.dark .cm-body a, .cm-chat.dark .cm-body a * { color: #8ab4f8 !important; text-decoration: underline; }
.cm-chat.dark .cm-body img { background: transparent !important; }
/* HTML Safe Mode: weißer Container für Mail-Inhalte bei dunklen Themes.
   HTML-Mails sind für weißen Hintergrund designt - Inline-Farben wie
   color:#000 wären auf dunklem Bubble-BG unsichtbar. Safe Mode gibt dem
   Body-Container explizit weißen Grund und lässt Mail-eigene Inline-Styles
   wieder greifen. Höhere Spezifität (.dark.html-safe) schlägt .dark-Regeln
   selbst bei !important (CSS-Priorität: gleich important → höhere Spezifität). */
.cm-chat.dark.html-safe .cm-body {
  /* Inset box-shadow statt Gradient: kein CSS-transparent-Grau-Problem.
     Weißer Hintergrund + Bubble-Farbe als inset shadow an den Kanten.
     border-radius = Bubble-Radius minus Bubble-Padding (8px) → nahtlose Ecken. */
  background: #ffffff !important;
  color: #1a1a1a !important;
  padding: 10px 14px; margin: 4px 0;
  border-radius: max(0px, calc(var(--cm-radius) - 8px));
  overflow: hidden;
}
.cm-chat.dark.html-safe .cm-row.other .cm-body {
  box-shadow: inset 0 0 14px 3px var(--cm-other-bubble);
}
.cm-chat.dark.html-safe .cm-row.own .cm-body {
  box-shadow: inset 0 0 14px 3px var(--cm-own-bubble);
}
.cm-chat.dark.html-safe .cm-body * { color: unset !important; background: unset !important; border-color: unset !important; }
.cm-chat.dark.html-safe .cm-body img { background: transparent !important; max-width: 100% !important; }
.cm-chat.dark.html-safe .cm-body a { color: #0066cc !important; text-decoration: underline; }
.cm-body img { max-width: 100%; height: auto !important; border-radius: 8px; cursor: zoom-in; transition: filter 0.15s; }
.cm-body img:hover { filter: brightness(1.06); }
/* Newsletter-Härtung: feste Breiten (600px-Tabellen etc.) werden fluid,
   nichts darf die Bubble sprengen - egal wie wild das Mail-HTML ist. */
.cm-body table { width: 100% !important; height: auto !important; table-layout: auto !important; }
.cm-body * { max-width: 100% !important; min-width: 0 !important; }
.cm-body a { color: inherit; text-decoration: underline; }
.cm-body p, .cm-body div { margin: 0 0 0.4em 0; }
.cm-body > *:last-child { margin-bottom: 0; }
.cm-sig { margin-top: 6px; font-size: 0.85em; }
.cm-sig summary { cursor: pointer; color: var(--cm-meta); list-style: none; user-select: none; transition: opacity 0.15s; }
.cm-sig summary:hover { opacity: 0.7; }
.cm-sig summary::before { content: '▸ '; }
.cm-sig[open] summary::before { content: '▾ '; }
.cm-sig-body { margin-top: 4px; opacity: 0.75; animation: cmIn 0.18s ease both; }
/* Weitergeleitete Nachricht: eingeklappter Block mit Vorschau (Absender + Betreff + 1. Satz) */
.cm-fwd {
  margin-top: 8px; border-left: 3px solid color-mix(in srgb, currentColor 35%, transparent);
  background: color-mix(in srgb, currentColor 7%, transparent);
  border-radius: 8px; padding: 7px 10px; font-size: 0.9em;
}
.cm-fwd-sum { cursor: pointer; list-style: none; user-select: none; display: flex; flex-direction: column; gap: 2px; }
.cm-fwd-sum::-webkit-details-marker { display: none; }
.cm-fwd-tag { font-weight: 700; font-size: 0.92em; display: flex; align-items: center; gap: 4px; }
.cm-fwd-tag::after { content: '▸'; margin-left: auto; font-weight: 400; opacity: 0.6; transition: transform 0.15s; }
.cm-fwd[open] .cm-fwd-tag::after { transform: rotate(90deg); }
.cm-fwd-prev { opacity: 0.7; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
.cm-fwd-body { margin-top: 7px; padding-top: 7px; border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent); opacity: 0.9; animation: cmIn 0.18s ease both; }
.cm-atts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.cm-att-chip {
  display: inline-flex; align-items: center; gap: 5px;
  background: rgba(0,0,0,0.07); border-radius: 999px;
  padding: 4px 12px; font-size: 0.8em; text-decoration: none; color: inherit;
  transition: background 0.15s, transform 0.15s;
}
.cm-att-chip:hover { background: rgba(0,0,0,0.13); transform: translateY(-1px); }
.cm-att-img {
  max-width: 200px; max-height: 150px; border-radius: 10px; display: block;
  object-fit: cover; cursor: zoom-in;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.cm-att-img:hover { transform: scale(1.025); box-shadow: 0 4px 14px rgba(0,0,0,0.25); }

/* ---------- Toolbar, Datums-Trenner, Reaktionen ---------- */
.cm-toolbar { display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 4px; }
.cm-tool {
  border: none; border-radius: 999px; padding: 5px 13px; cursor: pointer;
  font-size: 0.82em; font-family: inherit; font-weight: 600;
  background: var(--cm-input-bg); color: var(--cm-input-text);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1);
  transition: transform 0.15s, filter 0.15s;
}
.cm-tool { display: inline-flex; align-items: center; gap: 6px; }
.cm-tool:hover { transform: translateY(-1px); filter: brightness(1.08); }
.cm-day {
  align-self: center; font-size: 0.75em; font-weight: 600;
  color: var(--cm-meta); background: var(--cm-input-bg);
  border-radius: 999px; padding: 3px 14px; margin: 4px 0;
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  animation: cmIn 0.28s ease both;
}
.cm-stack { position: relative; }
.cm-avatar { cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease; }
.cm-avatar:hover { transform: scale(1.12); box-shadow: 0 2px 8px rgba(0,0,0,0.3); }

/* Pro-Nachricht-Aktionen (Hover): Antworten / Weiterleiten */
.cm-actions {
  position: absolute; top: -14px; display: flex; gap: 4px; z-index: 5;
  opacity: 0; transform: translateY(4px) scale(0.92);
  transition: opacity 0.15s ease, transform 0.15s ease;
  pointer-events: none;
}
.cm-row.other .cm-actions { right: 6px; }
.cm-row.own .cm-actions { left: 6px; }
.cm-stack:hover .cm-actions { opacity: 1; transform: none; pointer-events: auto; }
.cm-act {
  width: 28px; height: 28px; border-radius: 50%; border: none; cursor: pointer;
  background: var(--cm-card-bg); color: var(--cm-input-text); font-size: 13px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.22), 0 0 0 1px rgba(128,128,128,0.15);
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.12s ease, background 0.12s ease;
}
.cm-act:hover { transform: scale(1.18); }

/* ---------- Kontaktkarte (Avatar-Klick) ---------- */
.cm-contact {
  position: fixed; z-index: 2147483646; min-width: 230px; max-width: 300px;
  background: var(--cm-card-bg, #ffffff); color: var(--cm-input-text, #16181d);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  border-radius: 14px; padding: 14px 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(128,128,128,0.15);
  animation: cmIn 0.18s ease both;
  font-size: 13px;
}
.cm-contact .cm-c-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.cm-contact .cm-c-avatar {
  width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
  background: var(--cm-c-color, #90a4ae); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700;
}
.cm-contact .cm-c-name { font-weight: 700; font-size: 14px; }
.cm-contact .cm-c-mail { opacity: 0.7; word-break: break-all; }
.cm-contact .cm-c-actions { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.cm-contact button, .cm-contact a {
  border: none; border-radius: 8px; padding: 7px 12px; cursor: pointer;
  font: inherit; font-weight: 600; text-align: center; text-decoration: none;
  background: rgba(128,128,128,0.14); color: inherit;
  transition: background 0.15s, transform 0.15s;
}
.cm-contact button:hover, .cm-contact a:hover { background: rgba(128,128,128,0.26); transform: translateY(-1px); }

/* ---------- Composer (direkt antworten) ---------- */
.cm-composer {
  display: flex; gap: 8px; align-items: flex-end;
  margin-top: 10px; position: sticky; bottom: 6px;
}
.cm-comp-input {
  flex: 1; resize: none; border: none; outline: none;
  border-radius: 20px; padding: 10px 16px; font: inherit; line-height: 1.4;
  background: var(--cm-input-bg); color: var(--cm-input-text);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.08);
  transition: box-shadow 0.15s; max-height: 120px;
}
.cm-comp-input:focus { box-shadow: inset 0 0 0 2px var(--cm-own-bubble), 0 1px 6px rgba(0,0,0,0.12); }
.cm-comp-send, .cm-comp-full {
  width: 40px; height: 40px; border-radius: 50%; border: none; flex-shrink: 0;
  cursor: pointer; font-size: 15px; display: flex; align-items: center; justify-content: center;
  transition: transform 0.15s ease, filter 0.15s ease, opacity 0.15s;
}
.cm-comp-send { background: var(--cm-own-bubble); color: var(--cm-own-text); box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
.cm-comp-send:hover { transform: scale(1.1); filter: brightness(1.06); }
.cm-comp-full { background: var(--cm-input-bg); color: var(--cm-input-text); box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1); font-weight: 700; font-size: 13px; }
.cm-comp-full:hover { transform: scale(1.08); }
.cm-comp-send:active, .cm-comp-full:active, .cm-tool:active, .cm-act:active, .cm-contact button:active { transform: scale(0.92); }
.cm-comp-send:focus-visible, .cm-comp-full:focus-visible, .cm-tool:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--cm-own-bubble); }
.cm-composer.sending .cm-comp-send { opacity: 0.55; cursor: progress; animation: cmPulse 1s ease infinite; }
@keyframes cmPulse { 50% { transform: scale(0.92); } }
.cm-composer.error .cm-comp-input { box-shadow: inset 0 0 0 2px #e53935; }

/* ---------- Lightbox ---------- */
.cm-lb {
  position: fixed; inset: 0; z-index: 2147483646;
  background: rgba(10, 10, 12, 0.82);
  backdrop-filter: blur(6px);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
}
.cm-lb.open { opacity: 1; pointer-events: auto; }
.cm-lb img {
  max-width: 90vw; max-height: 84vh; border-radius: 12px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.6);
  transform: scale(0.96); transition: transform 0.22s cubic-bezier(0.21, 1.02, 0.55, 1);
}
.cm-lb.open img { transform: scale(1); }
.cm-lb-x {
  position: absolute; top: 18px; right: 22px;
  width: 38px; height: 38px; border-radius: 50%; border: none;
  background: rgba(255,255,255,0.12); color: #fff; font-size: 17px;
  cursor: pointer; transition: background 0.15s;
  display: flex; align-items: center; justify-content: center;
}
.cm-lb-x:hover { background: rgba(255,255,255,0.25); }
.cm-lb-cap { color: rgba(255,255,255,0.8); font-size: 13px; max-width: 80vw; text-align: center; }
.cm-lb-open {
  color: rgba(255,255,255,0.85); font-size: 13px; text-decoration: none;
  background: rgba(255,255,255,0.1); padding: 7px 16px; border-radius: 999px;
  transition: background 0.15s;
}
.cm-lb-open:hover { background: rgba(255,255,255,0.22); }

/* ---------- Smart Quote-Collapse ---------- */
/* blockquote-Inhalte in Chat-Bubbles werden standardmäßig eingeklappt.
   Ein Badge-Button zeigt die Zeilenzahl; Klick klappt auf/zu mit Animation. */
.cm-bq-btn {
  display: inline-flex; align-items: center; gap: 5px;
  border: none; border-radius: 999px; cursor: pointer;
  font-size: 0.78em; font-weight: 600; font-family: inherit;
  padding: 3px 11px; margin: 4px 0;
  background: color-mix(in srgb, currentColor 11%, transparent);
  color: inherit; opacity: 0.6; line-height: 1.6;
  transition: opacity 0.15s, background 0.15s;
  user-select: none;
}
.cm-bq-btn:hover { opacity: 1; background: color-mix(in srgb, currentColor 19%, transparent); }
.cm-bq-btn:active { transform: scale(0.95); }
.cm-bq-content {
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  transition: max-height 0.22s cubic-bezier(0.22,1,0.36,1), opacity 0.18s ease;
}
.cm-bq-content.cm-bq-open {
  max-height: 2000px;
  opacity: 1;
}
/* Lightbox nicht durch max-height blockieren */
.cm-lb .cm-bq-content { max-height: none !important; opacity: 1 !important; }
`;
}

export function renderMessages(messages: MessageObject[], settings: ChatSettings): string {
  const t = resolveTheme(settings);
  const i18n = I18N[settings.uiLanguage] ?? I18N.de;

  // Stabile Farbzuordnung pro Absender (Avatare + Gruppen-Namen)
  const senderColors = new Map<string, string>();
  let colorIdx = 0;
  const colorFor = (key: string): string => {
    let c = senderColors.get(key);
    if (!c) {
      c = GROUP_COLORS[colorIdx % GROUP_COLORS.length] as string;
      senderColors.set(key, c);
      colorIdx++;
    }
    return c;
  };

  const otherSenders = new Set(
    messages.filter((m) => !m.isOwn).map((m) => m.sender.email ?? m.sender.name),
  );
  const isGroup = otherSenders.size > 1;

  // Pass 1: Datums-Trenner vorberechnen (Trenner brechen Gruppen)
  let lastDay = '';
  const seps: string[] = messages.map((m) => {
    if (!settings.showDateSeparators) return '';
    const d = parseMailDate(m.timestamp);
    // Sanity-Guard: unplausible Jahre (V8-Parse-Artefakte) → lieber KEIN Trenner als ein falscher
    if (d && d.getFullYear() >= 2005 && d.getFullYear() <= 2100) {
      const key = dayKey(d);
      if (key !== lastDay) {
        lastDay = key;
        return `<div class="cm-day">${esc(dayLabel(d, settings.uiLanguage))}</div>\n`;
      }
    }
    return '';
  });

  // Pass 2: Gruppierung - aufeinanderfolgende Nachrichten desselben Absenders
  const keyOf = (m: MessageObject): string => `${m.isOwn ? 'me' : ''}|${m.sender.email ?? m.sender.name}`;
  const groupPos = (idx: number): 'solo' | 'start' | 'mid' | 'end' => {
    const m = messages[idx] as MessageObject;
    const prevSame = idx > 0 && keyOf(messages[idx - 1] as MessageObject) === keyOf(m) && seps[idx] === '';
    const nextSame =
      idx < messages.length - 1 &&
      keyOf(messages[idx + 1] as MessageObject) === keyOf(m) &&
      seps[idx + 1] === '';
    if (prevSame && nextSame) return 'mid';
    if (prevSame) return 'end';
    if (nextSame) return 'start';
    return 'solo';
  };

  const rows = messages
    .map((m, idx) => {
      const daySep = seps[idx] ?? '';
      const pos = groupPos(idx);
      const side = m.isOwn ? 'own' : 'other';
      const senderKey = m.sender.email ?? m.sender.name;
      const color = !m.isOwn ? colorFor(senderKey) : '';
      const styleVars = [
        color ? `--cm-sender-color:${color}` : '',
        `animation-delay:${Math.min(idx * 35, 420)}ms`,
      ]
        .filter(Boolean)
        .join(';');
      // Avatar nur am Gruppenende (Messenger-Pattern); davor Platzhalter für Ausrichtung
      const showAvatar = !m.isOwn && (pos === 'end' || pos === 'solo');
      const avatar = !m.isOwn
        ? showAvatar
          ? `<div class="cm-avatar" data-cm-name="${esc(m.sender.name)}" data-cm-email="${esc(m.sender.email ?? '')}" data-cm-color="${color}" title="${esc(m.sender.name)}">${esc(initials(m.sender.name))}</div>`
          : '<div class="cm-avatar-spacer"></div>'
        : '';
      // Name nur am Gruppenanfang zeigen (sonst Wiederholung)
      const senderLine =
        !m.isOwn && isGroup && (pos === 'start' || pos === 'solo')
          ? `<div class="cm-sender">${esc(m.sender.name)}</div>`
          : '';
      // Antwort-Kontext (WhatsApp-Style): klickbar, wenn das Original im Thread auffindbar ist
      let quoteChip = '';
      if (m.replyTo) {
        const previewKey = m.replyTo.preview.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60);
        const targetIdx = previewKey
          ? messages.findIndex(
              (mm, j) =>
                j < idx && mm.bodyText.replace(/\s+/g, ' ').trim().toLowerCase().startsWith(previewKey),
            )
          : -1;
        const jumpAttr = targetIdx >= 0 ? ` data-cm-jump="${targetIdx}" role="button" tabindex="0"` : '';
        quoteChip = `<div class="cm-quote"${jumpAttr}><span class="cm-quote-name">${esc(m.replyTo.name)}</span><span class="cm-quote-text">${esc(m.replyTo.preview)}</span>${m.replyTo.timestamp ? `<span class="cm-quote-time">${esc(m.replyTo.timestamp)}</span>` : ''}</div>`;
      }
      const sig = m.signatureHtml
        ? `<details class="cm-sig"><summary>${i18n.showSig}</summary><div class="cm-sig-body">${m.signatureHtml}</div></details>`
        : '';
      // Weitergeleitete Nachricht: eingeklappter Block mit sichtbarer Vorschau (Absender + Betreff +
      // erster Satz), aufklappbar. Natives <details> → kein extra JS-Wiring nötig.
      const fwd = m.forwarded
        ? `<details class="cm-fwd"><summary class="cm-fwd-sum"><span class="cm-fwd-tag">↪ ${esc(i18n.fwd)}${m.forwarded.sender ? `: ${esc(m.forwarded.sender)}` : ''}</span><span class="cm-fwd-prev">${esc(m.forwarded.preview)}</span></summary><div class="cm-fwd-body">${m.forwarded.bodyHtml}</div></details>`
        : '';
      const atts =
        settings.showAttachments && m.attachments.length
          ? `<div class="cm-atts">${m.attachments
              .map((a) =>
                a.kind === 'image' && a.url
                  ? `<img class="cm-att-img" src="${esc(a.url)}" alt="${esc(a.name)}" data-cm-full="${esc(a.url)}">`
                  : `<a class="cm-att-chip" href="${a.url ? esc(a.url) : '#'}" target="_blank" rel="noopener">📎 ${esc(a.name)}</a>`,
              )
              .join('')}</div>`
          : '';
      const time = m.timestamp ? `<div class="cm-time">${esc(m.timestamp)}</div>` : '';
      const actions = `<div class="cm-actions"><button type="button" class="cm-act" data-cm-act="reply" data-cm-idx="${idx}" title="${i18n.replyOne}">${ICONS.reply}</button><button type="button" class="cm-act" data-cm-act="forward" data-cm-idx="${idx}" title="${i18n.forwardOne}">${ICONS.forward}</button></div>`;
      // Sicherheitsnetz: falls bodyHtml trotz Parser-Fixes leer bleibt (z. B. bei
      // Google-Notification-Cards), bodyText als Plain-Text-Fallback rendern.
      const bodyContent = m.bodyHtml.trim()
        ? m.bodyHtml
        : m.bodyText
          ? m.bodyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
          : '';
      return `${daySep}<div class="cm-row ${side} grp-${pos}" data-cm-row="${idx}" style="${styleVars}">
  <div class="cm-msg">${avatar}<div class="cm-stack">${actions}<div class="cm-bubble">${senderLine}${quoteChip}<div class="cm-body">${bodyContent}</div>${fwd}${atts}${sig}</div>${time}</div></div>
</div>`;
    })
    .join('\n');

  const empty =
    messages.length === 0 ? `<div class="cm-empty">${ICONS.chat} ${settings.uiLanguage === 'en' ? 'No messages in this thread yet' : 'Noch keine Nachrichten in diesem Thread'}</div>` : '';

  const classes = ['cm-chat', `ts-${settings.timestamps}`];
  if (t.minimal) classes.push('minimal');
  if (themeIsDark(t)) classes.push('dark');
  if (themeIsDark(t) && settings.htmlSafeBg !== false) classes.push('html-safe');
  return `<div class="${classes.join(' ')}">${empty}${rows}</div>`;
}

/** Lightbox in den Shadow Root einbauen und Klicks auf Bilder abfangen. */
function wireLightbox(shadow: ShadowRoot, settings: ChatSettings): void {
  const i18n = I18N[settings.uiLanguage] ?? I18N.de;
  const lb = document.createElement('div');
  lb.className = 'cm-lb';
  lb.innerHTML = `<button class="cm-lb-x" title="Schließen (Esc)">✕</button><img alt=""><div class="cm-lb-cap"></div><a class="cm-lb-open" target="_blank" rel="noopener">${i18n.openOriginal}</a>`;
  shadow.appendChild(lb);

  const img = lb.querySelector('img') as HTMLImageElement;
  const cap = lb.querySelector('.cm-lb-cap') as HTMLElement;
  const openLink = lb.querySelector('.cm-lb-open') as HTMLAnchorElement;

  const close = (): void => lb.classList.remove('open');
  const open = (src: string, caption = ''): void => {
    img.src = src;
    openLink.href = src;
    cap.textContent = caption;
    cap.style.display = caption ? '' : 'none';
    lb.classList.add('open');
  };

  shadow.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // Bild angeklickt (Anhang-Thumbnail oder Inline-Bild im Body) → Lightbox
    if (target instanceof HTMLImageElement && !lb.contains(target)) {
      const src = target.getAttribute('data-cm-full') ?? target.getAttribute('src');
      if (src) {
        e.preventDefault();
        e.stopPropagation();
        open(src, target.getAttribute('alt') ?? '');
      }
      return;
    }
    // Backdrop oder ✕ → schließen
    if (target === lb || target.classList.contains('cm-lb-x')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lb.classList.contains('open')) close();
  });
}

/** Thread als druckbares Fenster öffnen (Drucken → "Als PDF sichern"). */
export function exportThread(messages: MessageObject[], settings: ChatSettings): void {
  const w = window.open('', '_blank', 'width=780,height=920');
  if (!w) return;
  const css = buildCss(settings).replace(':host { all: initial; }', '');
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Mail to Chat - Export</title>` +
      `<style>${css} body{margin:0;padding:18px;background:#fff} .cm-actions,.cm-composer,.cm-toolbar{display:none!important} @media print { .cm-bubble{box-shadow:none} }</style>` +
      `</head><body>${renderMessages(messages, settings)}</body></html>`,
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}

/** Toolbar (Zusammenfassung/Export) + Summary-Card + Reaktionen verdrahten. */
function wireToolbar(
  shadow: ShadowRoot,
  chatEl: Element,
  messages: MessageObject[],
  settings: ChatSettings,
  handlers: ChatViewHandlers,
): void {
  const i18n = I18N[settings.uiLanguage] ?? I18N.de;

  const bar = document.createElement('div');
  bar.className = 'cm-toolbar';
  const exp = document.createElement('button');
  exp.className = 'cm-tool';
  exp.type = 'button';
  exp.innerHTML = `${ICONS.print}<span>${i18n.exportPdf}</span>`;
  exp.addEventListener('click', () => exportThread(messages, settings));
  bar.appendChild(exp);
  chatEl.prepend(bar);

  // Antwort-Kontext-Klick: zur Originalnachricht springen + kurz aufblitzen
  shadow.addEventListener('click', (e) => {
    const quote = (e.target as HTMLElement).closest?.('.cm-quote[data-cm-jump]') as HTMLElement | null;
    if (!quote) return;
    const row = shadow.querySelector<HTMLElement>(`.cm-row[data-cm-row="${quote.getAttribute('data-cm-jump')}"]`);
    if (!row) return;
    row.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    row.classList.add('cm-flash');
    setTimeout(() => row.classList.remove('cm-flash'), 1200);
  });

  // Pro-Nachricht-Aktionen verdrahten (oder entfernen, wenn keine Handler da sind)
  if (handlers.onReplyTo || handlers.onForward) {
    shadow.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest?.('.cm-act') as HTMLElement | null;
      if (!btn) return;
      const idx = Number(btn.getAttribute('data-cm-idx'));
      if (Number.isNaN(idx)) return;
      const input = shadow.querySelector('.cm-comp-input') as HTMLTextAreaElement | null;
      const draft = input?.value ?? '';
      if (input) input.value = '';
      if (btn.getAttribute('data-cm-act') === 'reply') handlers.onReplyTo?.(idx, draft);
      else handlers.onForward?.(idx, draft);
    });
  } else {
    shadow.querySelectorAll('.cm-actions').forEach((el) => el.remove());
  }
}

/** Kontaktkarte: Klick auf Avatar zeigt Name, E-Mail, Aktionen. */
function wireContactCard(shadow: ShadowRoot, settings: ChatSettings): void {
  const i18n = I18N[settings.uiLanguage] ?? I18N.de;
  const closeCard = (): void => shadow.querySelector('.cm-contact')?.remove();

  shadow.addEventListener('click', (e) => {
    const avatar = (e.target as HTMLElement).closest?.('.cm-avatar') as HTMLElement | null;
    if (!avatar) {
      // Klick außerhalb → Karte schließen (außer in die Karte selbst)
      if (!(e.target as HTMLElement).closest?.('.cm-contact')) closeCard();
      return;
    }
    e.stopPropagation();
    closeCard();

    const name = avatar.getAttribute('data-cm-name') ?? '?';
    const email = avatar.getAttribute('data-cm-email') ?? '';
    const color = avatar.getAttribute('data-cm-color') || '#90a4ae';

    const card = document.createElement('div');
    card.className = 'cm-contact';
    card.innerHTML = `
      <div class="cm-c-head">
        <div class="cm-c-avatar" style="--cm-c-color:${color}">${initials(name)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</div>
        <div>
          <div class="cm-c-name"></div>
          <div class="cm-c-mail"></div>
        </div>
      </div>
      <div class="cm-c-actions"></div>`;
    (card.querySelector('.cm-c-name') as HTMLElement).textContent = name;
    (card.querySelector('.cm-c-mail') as HTMLElement).textContent = email || i18n.noMail;

    const actions = card.querySelector('.cm-c-actions') as HTMLElement;
    if (email) {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.innerHTML = `${ICONS.copy} ${i18n.copyMail}`;
      copy.addEventListener('click', () => {
        void navigator.clipboard?.writeText(email).then(() => {
          copy.textContent = i18n.copied;
          setTimeout(closeCard, 900);
        });
      });
      actions.appendChild(copy);

      const search = document.createElement('a');
      search.href = `#search/${encodeURIComponent(`from:${email}`)}`;
      search.innerHTML = `${ICONS.search} ${i18n.searchMails}`;
      search.addEventListener('click', closeCard);
      actions.appendChild(search);
    }

    // Position: neben dem Avatar, im Viewport gehalten
    const r = avatar.getBoundingClientRect();
    card.style.left = `${Math.min(r.right + 10, window.innerWidth - 320)}px`;
    card.style.top = `${Math.min(r.top - 8, window.innerHeight - 180)}px`;
    shadow.appendChild(card);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCard();
  });
}

/** Composer-Bar (Messenger-Eingabe) an den Chat anhängen. */
function wireComposer(chatEl: Element, settings: ChatSettings, handlers: ChatViewHandlers): void {
  if (!handlers.onSend) return;
  const i18n = I18N[settings.uiLanguage] ?? I18N.de;

  const bar = document.createElement('div');
  bar.className = 'cm-composer';
  if (handlers.onOpenFullEditor) {
    const full = document.createElement('button');
    full.className = 'cm-comp-full';
    full.type = 'button';
    full.title = i18n.fullEditor;
    full.textContent = 'Aa';
    full.addEventListener('click', () => {
      const input = bar.querySelector('.cm-comp-input') as HTMLTextAreaElement | null;
      handlers.onOpenFullEditor?.(input?.value ?? '');
      if (input) input.value = '';
    });
    bar.appendChild(full);
  }
  if (handlers.onOpenAttach) {
    const attach = document.createElement('button');
    attach.className = 'cm-comp-full cm-comp-attach';
    attach.type = 'button';
    attach.title = i18n.attach;
    attach.innerHTML = ICONS.attach;
    attach.addEventListener('click', () => {
      const input = bar.querySelector('.cm-comp-input') as HTMLTextAreaElement | null;
      handlers.onOpenAttach?.(input?.value ?? '');
      if (input) input.value = '';
    });
    bar.appendChild(attach);
  }
  const input = document.createElement('textarea');
  input.className = 'cm-comp-input';
  input.rows = 1;
  input.placeholder = i18n.placeholder;
  const send = document.createElement('button');
  send.className = 'cm-comp-send';
  send.type = 'button';
  send.title = i18n.send;
  send.innerHTML = ICONS.send;
  bar.append(input, send);
  chatEl.appendChild(bar);

  const autosize = (): void => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  };
  input.addEventListener('input', autosize);

  const doSend = async (): Promise<void> => {
    const text = input.value.trim();
    if (!text || bar.classList.contains('sending')) return;
    bar.classList.add('sending');
    try {
      const ok = await handlers.onSend!(text);
      if (ok) {
        input.value = '';
        autosize();
      } else {
        bar.classList.add('error');
        input.title = i18n.sendFailed;
        setTimeout(() => bar.classList.remove('error'), 2000);
      }
    } finally {
      bar.classList.remove('sending');
    }
  };
  send.addEventListener('click', () => void doSend());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void doSend();
    }
  });
}

/**
 * Smart Quote-Collapse: blockquote-Elemente in Chat-Bubbles werden standardmäßig
 * eingeklappt und zeigen einen Badge "X Zeilen zitiert". Klick klappt auf/zu.
 *
 * Warum Post-DOM statt HTML-Template: blockquotes müssen im echten DOM gemessen
 * werden (Zeilenzahl via Kinder-Elemente), HTML-String-Manipulation wäre fragil.
 */
function wireQuoteCollapse(shadow: ShadowRoot, settings: ChatSettings): void {
  const isEn = settings.uiLanguage === 'en';
  const label = (n: number): string => isEn ? `${n} quoted lines` : `${n} Zeilen zitiert`;

  shadow.querySelectorAll<HTMLElement>('.cm-body blockquote').forEach((bq) => {
    // Zeilenzahl schätzen: Block-Kinder (p, div, br, li) + 1 als Proxy für sichtbare Zeilen.
    // Genauer als Char-Count, stabiler als getBoundingClientRect() vor dem Rendern.
    const blockCount = bq.querySelectorAll('p, div, br, li, h1, h2, h3, h4, h5, h6, tr').length;
    const lineCount = Math.max(1, blockCount || Math.ceil((bq.textContent?.length ?? 0) / 60));

    const wrap = document.createElement('div');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cm-bq-btn';
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = `··· ${label(lineCount)}`;

    const content = document.createElement('div');
    content.className = 'cm-bq-content';
    // blockquote in den animierten Container verschieben
    bq.parentNode?.insertBefore(wrap, bq);
    content.appendChild(bq);
    wrap.appendChild(btn);
    wrap.appendChild(content);

    btn.addEventListener('click', () => {
      const isOpen = content.classList.contains('cm-bq-open');
      if (isOpen) {
        content.classList.remove('cm-bq-open');
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = `··· ${label(lineCount)}`;
      } else {
        content.classList.add('cm-bq-open');
        btn.setAttribute('aria-expanded', 'true');
        btn.textContent = `▲ ${label(lineCount)}`;
      }
    });
  });
}

/**
 * Erzeugt das komplette Chat-View-Element mit Shadow DOM (Style-Isolation
 * gegen Gmail-CSS in beide Richtungen), inkl. Lightbox und optionalem Composer.
 */
export function createChatView(
  messages: MessageObject[],
  settings: ChatSettings,
  handlers: ChatViewHandlers = {},
): HTMLElement {
  const host = document.createElement('div');
  host.className = 'chatmail-host';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = buildCss(settings);
  shadow.appendChild(style);
  const wrap = document.createElement('div');
  wrap.innerHTML = renderMessages(messages, settings);
  const chatEl = wrap.firstElementChild ?? wrap;
  shadow.appendChild(chatEl);
  wireToolbar(shadow, chatEl, messages, settings, handlers);
  wireComposer(chatEl, settings, handlers);
  wireContactCard(shadow, settings);
  wireLightbox(shadow, settings);
  wireQuoteCollapse(shadow, settings);
  return host;
}
