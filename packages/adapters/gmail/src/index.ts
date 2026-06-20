import { parseThread, type Attachment, type MessageObject, type Sender } from '@chatmail/core';
import { createChatView, ICONS, type ChatSettings } from '@chatmail/ui';
import { applySkin, updateSkinPageClass } from './skin';

export { applySkin, buildSkinCss } from './skin';

/**
 * Gmail-Adapter: extrahiert den Thread aus dem Gmail-DOM, übergibt an
 * chatmail-core und injiziert die Chat-Ansicht + Toggle-Button.
 *
 * Gmail-DOM-Anker (Stand 2026, mit Fallbacks):
 *  - Nachricht:        div.adn            (expandierte Mail im Thread)
 *  - Absender:         span.gD            (attr: email, name)
 *  - Zeitstempel:      span.g3
 *  - Body:             div.a3s
 *  - Betreff-Header:   h2.hP
 *  - Nachrichtenliste: div[role="list"]
 */

export interface AdapterDeps {
  getSettings: () => Promise<ChatSettings>;
  onSettingsChanged: (cb: () => void) => void;
  /** Öffnet die Options Page der Extension (via Background Worker). */
  openSettings?: () => void;
  /** Persistiert den Chat-Modus global (Button = harter Schalter für alle Mails). */
  setAutoActivate?: (on: boolean) => void;
}

/** Ringpuffer: letzte 50 Log-Einträge für window.__chatmailDebug.log */
const DEBUG_LOG: { t: number; msg: string }[] = [];
const DEBUG_LOG_MAX = 50;

/** Diagnose-Log: macht in der Browser-Konsole sichtbar, welche Station laeuft. */
function log(...args: unknown[]): void {
  const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  if (DEBUG_LOG.length >= DEBUG_LOG_MAX) DEBUG_LOG.shift();
  DEBUG_LOG.push({ t: Date.now(), msg });
  // console.log statt .info: die Info-Stufe ist in manchen Konsolen ausgeblendet
  console.log('[Mail to Chat]', ...args);
}

const BTN_ID = 'chatmail-toggle-btn';
const HOST_CLASS = 'chatmail-host';

const LABELS = {
  de: {
    active: 'Chat', inactive: 'Klassisch',
    tooltipOn: 'Chat-Ansicht aktiv · klicken zum Deaktivieren',
    tooltipOff: 'Chat-Ansicht aktivieren',
    replyCtx: 'Antwort auf', forwardCtx: 'Weiterleiten',
  },
  en: {
    active: 'Chat', inactive: 'Classic',
    tooltipOn: 'Chat view active · click to deactivate',
    tooltipOff: 'Activate chat view',
    replyCtx: 'Replying to', forwardCtx: 'Forwarding',
  },
};

// ---- Per-Thread-Einstellungen ------------------------------------------------
/** Storage-Key für Thread-spezifische Ansichts-Präferenzen. */
const THREAD_PREFS_KEY = 'chatmail-thread-prefs';
type ThreadMode = 'classic' | 'chat';
type ThreadPrefs = Record<string, ThreadMode>;

/**
 * Referenz auf scheduleCheck() aus initGmailAdapter — wird dort gesetzt.
 * Ermöglicht Context-Menu-Actions (Thread-Pref ändern) sofortiges Re-Check
 * ohne dass showThreadContextMenu() Closure-Zugriff auf scheduleCheck braucht.
 */
let scheduleCheckRef: (() => void) | null = null;

/** Kontext für das WhatsApp-Style-Banner über dem Gmail-Editor. */
let pendingCtx: { label: string; preview: string; time?: string } | null = null;

interface ThreadState {
  active: boolean;
  host: HTMLElement | null;
  hiddenList: HTMLElement | null;
  /** Gmails eigene Antworten/Weiterleiten-Reihe (im Chat-Modus versteckt). */
  hiddenReplyRow: HTMLElement | null;
  /** Compose-Mode: Chat bleibt oben, Gmails Editor wird darunter eingeblendet. */
  composeMode: boolean;
  /** Mapping Chat-Index → Gmail-DOM-Node (für Pro-Mail-Aktionen). */
  lastNodes: HTMLElement[];
  lastCount: number;
}

const state: ThreadState = {
  active: false,
  host: null,
  hiddenList: null,
  hiddenReplyRow: null,
  composeMode: false,
  lastNodes: [],
  lastCount: 0,
};

/**
 * Compose-Mode: Die Chat-Ansicht bleibt sichtbar, Gmails Editor erscheint
 * darunter - dafür wird die versteckte Thread-Liste wieder eingeblendet,
 * aber alle Mail-Zeilen außer dem Editor-Bereich bleiben unsichtbar.
 */
function setComposeMode(on: boolean): void {
  const list = state.hiddenList;
  if (!list) return;
  const entering = on && !state.composeMode;
  const items = Array.from(list.querySelectorAll<HTMLElement>('[role="listitem"]'));
  if (on) {
    list.style.removeProperty('display');
    let editorLi: HTMLElement | null = null;
    for (const li of items) {
      // Breiter Selektor: g_editable, contenteditable (egal ob ="true" oder ohne Wert),
      // textbox-role und Gmail-Klasse .Am.Al.editable — deckt alle bekannten Gmail-Editor-Varianten ab.
      const hasEditor = li.querySelector('[g_editable="true"], [contenteditable], div[role="textbox"], .Am.Al.editable');
      if (hasEditor) {
        li.style.removeProperty('display');
        editorLi = li;
      } else {
        li.style.display = 'none';
      }
    }
    // WhatsApp-Style: Kontext-Banner "Antwort auf: '…' · 09:14" über dem Editor
    if (editorLi && pendingCtx && !document.getElementById('chatmail-reply-ctx')) {
      const banner = document.createElement('div');
      banner.id = 'chatmail-reply-ctx';
      banner.style.cssText = [
        'margin:10px 8px 4px', 'padding:8px 14px', 'border-left:4px solid #e6b400',
        'background:rgba(230,180,0,0.13)', 'border-radius:10px', 'font-size:12.5px',
        'line-height:1.45', 'font-family:inherit',
      ].join(';');
      banner.textContent = `${pendingCtx.label}: „${pendingCtx.preview}"${pendingCtx.time ? ` · ${pendingCtx.time}` : ''}`;
      editorLi.prepend(banner);
    }
    // Editor liegt oft außerhalb des Sichtfelds → beim Öffnen hinscrollen
    if (entering) {
      requestAnimationFrame(() => {
        findComposeBody()?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  } else {
    document.getElementById('chatmail-reply-ctx')?.remove();
    pendingCtx = null;
    for (const li of items) li.style.removeProperty('display');
    list.style.display = 'none';
  }
  state.composeMode = on;
}

/**
 * Eigenen Account (Name + E-Mail) aus dem Gmail-Kontext erkennen.
 * Quelle 1: Account-Button aria-label "Google-Konto: Jane Doe (jane@gmail.com)"
 * Quelle 2: Dokumenttitel "Posteingang (3) - mail@gmail.com - Gmail"
 * Wichtig für Threads, in denen Zitat-Metazeilen nur den Namen tragen.
 */
function detectAccount(): { name?: string; email?: string } {
  for (const el of Array.from(document.querySelectorAll('a[aria-label], img[aria-label]'))) {
    const label = el.getAttribute('aria-label') ?? '';
    const m = label.match(/:\s*([^(]+?)\s*\(([^)\s]+@[^)\s]+)\)/);
    if (m?.[2]) return { name: m[1]?.trim(), email: m[2] };
    const plain = label.match(/\(([^)\s]+@[^)\s]+)\)/);
    if (plain?.[1]) return { email: plain[1] };
  }
  const t = document.title.match(/[-–]\s*([^\s]+@[^\s]+)\s*[-–]/);
  return { email: t?.[1] };
}

/** Zentrale isOwn-Logik: E-Mail-Match ODER exakter Namens-Match. */
function isOwnSender(sender: Sender, ownEmails: string[], ownNames: string[]): boolean {
  if (sender.email && ownEmails.some((e) => e.toLowerCase() === sender.email!.toLowerCase())) return true;
  const n = sender.name.trim().toLowerCase();
  return n.length > 0 && ownNames.some((o) => o.trim().toLowerCase() === n);
}

/**
 * Gmail-Anhang-Karten liegen AUSSERHALB des Mail-Bodys (div.aQH).
 * span[download_url] Format: "mime:dateiname:url" (url enthält selbst ":").
 */
export function parseDownloadUrl(downloadUrl: string): Attachment | null {
  const firstColon = downloadUrl.indexOf(':');
  const secondColon = downloadUrl.indexOf(':', firstColon + 1);
  if (firstColon < 0 || secondColon < 0) return null;
  const mime = downloadUrl.slice(0, firstColon);
  const name = downloadUrl.slice(firstColon + 1, secondColon) || 'Datei';
  const url = downloadUrl.slice(secondColon + 1);
  return { kind: mime.startsWith('image/') ? 'image' : 'file', name, url };
}

const IMAGE_NAME_RE = /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?|avif)\s*$/i;

/** Gmail-Bild-Thumbnails höher auflösen (sz=w360-h240 → sz=w1600). */
export function upscaleGmailThumb(url: string): string {
  return url.replace(/([?&]sz=)w\d+(-h\d+)?/, '$1w1600');
}

/**
 * Bombenfeste Anhang-Extraktion: drei redundante Strategien, dedupliziert.
 * Gmail ändert sein DOM regelmäßig - kein einzelner Selektor ist verlässlich.
 */
function extractAttachmentCards(node: HTMLElement): Attachment[] {
  const out: Attachment[] = [];
  const seen = new Set<string>();
  const push = (att: Attachment | null | undefined): void => {
    if (!att || !att.name) return;
    const key = `${att.name}|${att.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(att);
  };

  // Strategie 1 (legacy): download_url-Attribut "mime:name:url"
  node.querySelectorAll('[download_url]').forEach((card) => {
    const att = parseDownloadUrl(card.getAttribute('download_url') ?? '');
    if (att?.kind === 'image') {
      const thumb = card.querySelector('img')?.getAttribute('src');
      if (thumb) att.url = upscaleGmailThumb(thumb);
    }
    push(att);
  });

  // Strategie 2 (modern): Anhang-Karten in .aQH/.hq - Name aus .aV3 oder aria-label
  node.querySelectorAll('.aQH .aZo, .aQH [role="listitem"], .hq [role="listitem"], .aQH a').forEach((card) => {
    const ariaName = card.getAttribute('aria-label')?.replace(/^[^:]{0,40}:\s*/, '').trim();
    const name = card.querySelector('.aV3')?.textContent?.trim() || ariaName || '';
    if (!name) return;
    const thumb = card.querySelector('img')?.getAttribute('src') ?? undefined;
    const href =
      card instanceof HTMLAnchorElement
        ? card.href
        : card.querySelector('a')?.getAttribute('href') ?? undefined;
    const isImage =
      IMAGE_NAME_RE.test(name) || (!!thumb && /view=fimg|disp=thd/.test(thumb));
    if (isImage && thumb) {
      push({ kind: 'image', name, url: upscaleGmailThumb(thumb) });
    } else {
      push({ kind: 'file', name, url: href ?? thumb });
    }
  });

  // Strategie 3 (Sicherheitsnetz): jedes Attachment-Thumbnail-Bild im Knoten
  node.querySelectorAll('img[src*="view=fimg"], img[src*="disp=thd"]').forEach((img) => {
    const src = img.getAttribute('src');
    if (!src) return;
    const name = img.getAttribute('alt')?.trim() || 'Bild';
    // dedupe gegen Strategie 1/2: gleiche URL-Basis überspringen
    if (out.some((a) => a.url && a.url.split('&sz=')[0] === upscaleGmailThumb(src).split('&sz=')[0])) return;
    push({ kind: 'image', name, url: upscaleGmailThumb(src) });
  });

  return out;
}

/**
 * Portabler Sichtbarkeits-Test. WICHTIG: offsetParent ist in Firefox null,
 * sobald ein Vorfahre position:fixed/sticky hat (Gmail-Lesebereich!) -
 * getClientRects funktioniert in allen Browsern identisch.
 */
function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

/**
 * Feuert eine vollständige synthetische Pointer+Maus-Klick-Sequenz auf ein Element.
 * Gmails jsaction-Framework reagiert nur auf den KOMPLETTEN Satz
 * (pointerdown→mousedown→pointerup→mouseup→click). Ein nacktes .click() oder reine
 * Maus-Events triggern manche Handler NICHT — insbesondere das Super-Collapse-Band.
 * isTrusted ist NICHT erforderlich (live verifiziert v1.6.4 im 9-Mail-Marjan-Thread).
 */
function fireSyntheticClick(el: Element, clientX: number, clientY: number): void {
  const base: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX, clientY, button: 0 };
  const ptr: PointerEventInit = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  el.dispatchEvent(new PointerEvent('pointerdown', ptr));
  el.dispatchEvent(new MouseEvent('mousedown', base));
  el.dispatchEvent(new PointerEvent('pointerup', ptr));
  el.dispatchEvent(new MouseEvent('mouseup', base));
  el.dispatchEvent(new MouseEvent('click', base));
}

/**
 * SICHTBAREN Thread-Header finden. Gmail hält in Suche/Lesebereich/Labels
 * mehrere (unsichtbare) h2.hP im DOM - nur der sichtbare zählt. Damit
 * funktioniert die Chat-Ansicht in ALLEN Ansichten: Posteingang, Suche,
 * Spam, Labels, Lesebereich.
 */
function findThreadHeader(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('h2.hP'));
  return (
    candidates.find(isVisible) ??
    // Fallback: sichtbare Überschrift im Hauptbereich
    Array.from(document.querySelectorAll<HTMLElement>('div[role="main"] h2')).find(
      (h) => isVisible(h) && (h.textContent?.trim().length ?? 0) > 0,
    ) ??
    null
  );
}

function getMessageNodes(): HTMLElement[] {
  // Sichtbare div.adn finden, um den aktiven Thread-Container zu bestimmen.
  // Im Lesebereich-Modus (geteilte Ansicht) behält Gmail alte Thread-DOMs
  // unsichtbar im Hintergrund — nur der Container mit sichtbaren Nodes zählt.
  const visible = Array.from(document.querySelectorAll<HTMLElement>('div.adn')).filter(isVisible);
  if (visible.length === 0) return [];

  // Thread-Container [role="list"] des aktiven Threads ermitteln.
  // Darin liegen ALLE Nachrichten — auch eingeklappte. Gmail lädt alle Mail-Bodies
  // beim Thread-Öffnen vollständig in den DOM (kein lazy-load für div.a3s).
  // Eingeklappte Mails sind nur visuell versteckt (display:none auf dem Listitem),
  // ihr Inhalt ist lesbar und muss im Chat erscheinen.
  const threadList = visible[0]?.closest<HTMLElement>('[role="list"]');
  if (!threadList) return visible;

  // Alle div.adn im Thread-Container — Nodes ohne auswertbaren Body überspringen
  // (leere Skeleton-Loader, Draft-Platzhalter etc.).
  return Array.from(threadList.querySelectorAll<HTMLElement>('div.adn')).filter((n) => {
    const a3s = n.querySelector('div.a3s');
    if (a3s?.textContent?.trim()) return true;
    const iiGt = n.querySelector('div.ii.gt');
    return !!(iiGt?.textContent?.trim());
  });
}

function extractFromNode(
  node: HTMLElement,
  ownEmails: string[],
  ownNames: string[],
  settings: ChatSettings,
): MessageObject | null {
  const senderEl = node.querySelector('span.gD');
  // Primär: div.a3s (Standard-Mail-Body). Fallback: div.ii.gt (Google-Notification-
  // Cards / AMP-Mails, bei denen Gmail den Body ggf. anders strukturiert).
  // Nur auf Fallback wechseln wenn div.a3s nicht existiert ODER komplett leer ist.
  const a3s = node.querySelector<HTMLElement>('div.a3s');
  const body = (a3s && a3s.textContent?.trim()) ? a3s
    : node.querySelector<HTMLElement>('div.ii.gt') ?? a3s;
  if (!body) return null;

  const email = senderEl?.getAttribute('email') ?? undefined;
  const name = senderEl?.getAttribute('name') ?? senderEl?.textContent?.trim() ?? email ?? 'Unbekannt';
  const sender: Sender = { name, email };
  const timestamp = node.querySelector('span.g3')?.textContent?.trim() ?? undefined;

  // Body durch den Core-Parser: trennt Zitat-Historie + Signatur ab.
  const parsed = parseThread(body.innerHTML, {
    ownEmails,
    ownName: ownNames[0],
    languages: settings.languages,
    filterSignatures: settings.filterSignatures,
  });
  if (parsed.length === 0) return null;

  // Äußerste Ebene (= neueste) ist der eigentliche Inhalt dieser Mail.
  const own = parsed[parsed.length - 1] as MessageObject;
  // Direkt zitierte Nachricht = Antwort-Ziel dieser Mail (WhatsApp-Kontext).
  // Ob sie redundant ist (= einfach die vorherige Thread-Nachricht), wird
  // spaeter in pruneRedundantReplyTo entschieden.
  const quoted = parsed.length >= 2 ? parsed[parsed.length - 2] : undefined;
  const replyTo =
    quoted && quoted.bodyText.trim().length > 0
      ? {
          name: quoted.sender.name,
          preview: quoted.bodyText.replace(/\s+/g, ' ').trim().slice(0, 90),
          timestamp: quoted.timestamp,
        }
      : undefined;
  const cards = extractAttachmentCards(node);
  // Dedupe: Body-Bilder, die zugleich als Karte auftauchen, nicht doppelt zeigen
  const urlBase = (u?: string): string => (u ?? '').split('&sz=')[0] ?? '';
  const bodyAtts = own.attachments.filter(
    (a) => !cards.some((c) => c.name === a.name || (a.url && urlBase(c.url) === urlBase(a.url))),
  );
  const attachments = [...bodyAtts, ...cards];
  // Anhaenge im Session-Cache sichern: ueberleben das spaetere Einklappen der Mail
  if (attachments.length > 0) {
    const cache = loadAttCache();
    cache[attachmentCacheKey({ sender, bodyText: own.bodyText })] = attachments;
    saveAttCache(cache);
  }
  return {
    ...own,
    sender,
    timestamp,
    isOwn: isOwnSender(sender, ownEmails, ownNames),
    attachments,
    replyTo,
  };
}

/* ---------- Anhang-Cache: Medien ueberleben das Einklappen ----------
 * Gmail-Anhang-Karten existieren NUR an aufgeklappten Mails. Sobald Gmail
 * eine Mail einklappt (z. B. nach neuen Nachrichten), kommt ihr Inhalt aus
 * der Zitat-Historie - ohne Anhaenge. Loesung: Einmal gesehene Anhaenge
 * werden pro Nachricht gemerkt (sessionStorage, ueberlebt SPA-Navigation)
 * und bei jedem Re-Render wieder angeheftet. Jeder Zugriff ist failsafe
 * (try/catch), der Cache ist groessenbegrenzt. */

const ATT_CACHE_KEY = 'chatmail-att-cache-v1';
const ATT_CACHE_MAX = 150;

/** Stabiler Schluessel: Absender + normalisierter Textanfang. */
export function attachmentCacheKey(m: Pick<MessageObject, 'sender' | 'bodyText'>): string {
  const who = (m.sender.email ?? m.sender.name).toLowerCase();
  const text = m.bodyText.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
  return `${who}|${text}`;
}

function loadAttCache(): Record<string, Attachment[]> {
  try {
    return JSON.parse(sessionStorage.getItem(ATT_CACHE_KEY) ?? '{}') as Record<string, Attachment[]>;
  } catch {
    return {};
  }
}

function saveAttCache(cache: Record<string, Attachment[]>): void {
  try {
    const keys = Object.keys(cache);
    if (keys.length > ATT_CACHE_MAX) {
      for (const k of keys.slice(0, keys.length - ATT_CACHE_MAX)) delete cache[k];
    }
    sessionStorage.setItem(ATT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* Quota/Privacy-Mode: Cache ist nice-to-have, nie kritisch */
  }
}

/** Nachrichten ohne Anhaenge aus dem Cache auffuellen (pure, testbar). */
export function applyCachedAttachments(
  messages: MessageObject[],
  cache: Record<string, Attachment[]>,
): MessageObject[] {
  return messages.map((m) => {
    if (m.attachments.length > 0) return m;
    const cached = cache[attachmentCacheKey(m)];
    return cached && cached.length > 0 ? { ...m, attachments: cached } : m;
  });
}

/**
 * Antwort-Kontext nur zeigen, wenn er INFORMATIV ist: Antwortet eine Mail
 * schlicht auf die unmittelbar vorherige Nachricht (Normalfall im linearen
 * Thread), waere der Chip reines Rauschen - er fliegt raus. Er bleibt genau
 * dann, wenn auf eine AELTERE Nachricht geantwortet wurde (WhatsApp-Verhalten).
 */
export function pruneRedundantReplyTo(messages: MessageObject[]): MessageObject[] {
  const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();
  return messages.map((m, i) => {
    if (!m.replyTo) return m;
    const prev = messages[i - 1];
    const previewKey = norm(m.replyTo.preview).slice(0, 60);
    if (!previewKey || (prev && norm(prev.bodyText).startsWith(previewKey))) {
      const { replyTo: _drop, ...rest } = m;
      return rest as MessageObject;
    }
    return m;
  });
}

/**
 * Merge: aufgeklappte DOM-Mails (zuverlässig: Sender/Zeit/Anhänge) + Zitat-
 * Historie der neuesten Mail (vollständig: auch zusammengeklappte Mails).
 * Gmail klappt nach dem Senden ältere Mails zusammen - ohne diesen Merge
 * würde der Chatverlauf "verschwinden".
 * quoteMsgs enthält ALLE Nachrichten chronologisch; domMsgs decken die
 * letzten k (aufgeklappten) ab → Kopf aus quoteMsgs, Schwanz aus domMsgs.
 */
export function mergeThreadMessages(
  domMsgs: MessageObject[],
  quoteMsgs: MessageObject[],
): MessageObject[] {
  if (quoteMsgs.length <= domMsgs.length) return domMsgs.length ? domMsgs : quoteMsgs;
  const head = quoteMsgs.slice(0, quoteMsgs.length - Math.max(domMsgs.length, 1));
  if (!domMsgs.length) return quoteMsgs;
  // Boundary-Dedupe: wenn die Zähl-Annahme nicht exakt stimmt (z. B. Auto-Replies,
  // die die eigene Mail zitieren), kann dieselbe Nachricht an der Naht doppelt
  // auftauchen → identische Inhalte an der Grenze aus dem Kopf entfernen.
  const norm = (m: MessageObject): string => m.bodyText.replace(/\s+/g, ' ').trim().slice(0, 120);
  const domFirst = norm(domMsgs[0] as MessageObject);
  while (head.length > 0 && norm(head[head.length - 1] as MessageObject) === domFirst) {
    head.pop();
  }
  return [...head, ...domMsgs];
}

/**
 * Schneidet markerlose Zitat-Historie ab: Wenn der Body einer Bubble (ab Position >30) den
 * Anfang einer FRÜHEREN Bubble wörtlich enthält, ist das zitierter Verlauf ohne "Am … schrieb"-
 * Marker (manche Clients zitieren ohne Trenner) → ab dort abschneiden. Inhalts-Match gegen die
 * echten vorherigen Nachrichten (Vergleich nur auf Buchstaben/Ziffern, robust gegen Whitespace).
 */
export function stripCrossQuotes(messages: MessageObject[]): MessageObject[] {
  const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const isAlnum = (c: string): boolean => /[a-z0-9äöüß]/i.test(c);
  return messages.map((m, i) => {
    if (!m.bodyText) return m;
    const bn = norm(m.bodyText);
    let cutNorm = -1;
    for (let j = 0; j < i; j++) {
      const prev = messages[j];
      if (!prev) continue;
      const key = norm(prev.bodyText).slice(0, 40);
      if (key.length < 24) continue; // zu kurz → Fehlalarm-Risiko
      const pos = bn.indexOf(key);
      if (pos > 30 && (cutNorm < 0 || pos < cutNorm)) cutNorm = pos;
    }
    if (cutNorm < 0) return m;
    // normalisierte Position zurück auf den Originaltext mappen
    let count = 0;
    let rawCut = m.bodyText.length;
    for (let k = 0; k < m.bodyText.length; k++) {
      if (isAlnum(m.bodyText.charAt(k))) {
        if (count === cutNorm) {
          rawCut = k;
          break;
        }
        count++;
      }
    }
    const newText = m.bodyText.slice(0, rawCut).replace(/\s+$/, '');
    if (!newText.trim()) return m;
    return { ...m, bodyText: newText, bodyHtml: esc(newText).replace(/\n/g, '<br>') };
  });
}

function buildThreadMessages(settings: ChatSettings): MessageObject[] {
  const account = detectAccount();
  const ownEmails = [...settings.ownEmails];
  if (account.email && !ownEmails.includes(account.email)) ownEmails.push(account.email);
  const ownNames = [settings.ownName, account.name].filter((n): n is string => !!n && n.trim().length > 0);

  const nodes = getMessageNodes();
  log(`getMessageNodes: ${nodes.length} Nodes mit Body-Inhalt gefunden (div.adn).`);
  if (nodes.length === 0) return [];

  // BUBBLES = NUR echte Gmail-Mails (eine pro div.adn). Absender/Zeit kommen aus Gmails
  // Metadaten (span.gD / span.g3) → es kann nie "Unbekannt" entstehen. Die Super-Collapse-
  // Expansion holt bereits ALLE Mails in den DOM, daher ist domMsgs vollständig.
  //
  // Die geparste Zitat-Kette wird BEWUSST nicht mehr als Bubble-Quelle gemerged: sie war die
  // Ursache geratener "Unbekannt"-Absender UND teurer Mehrfach-Parserei pro Render (parseThread
  // über jeden Node). Der zitierte Verlauf ist redundant — er steht ja schon als die Bubbles
  // darüber. (Prinzip: Gmail-Grenzen vertrauen, Verlauf wegschneiden.)
  const domMsgs = nodes
    .map((n) => extractFromNode(n, ownEmails, ownNames, settings))
    .filter((m): m is MessageObject => m !== null);
  log(`domMsgs: ${domMsgs.length} Nachrichten aus DOM-Nodes (Bubble-Quelle).`);

  let messages = domMsgs;

  // Notnagel: NUR falls keine einzige DOM-Mail auswertbar war (sehr selten) — beste
  // Zitat-Kette als Fallback, damit der Verlauf nie komplett verschwindet.
  if (messages.length === 0) {
    let quoteMsgs: MessageObject[] = [];
    for (const node of nodes) {
      const body = node.querySelector<HTMLElement>('div.a3s');
      if (!body?.textContent?.trim()) continue;
      const parsed = parseThread(body.innerHTML, {
        ownEmails,
        ownName: ownNames[0],
        languages: settings.languages,
        filterSignatures: settings.filterSignatures,
      });
      for (const m of parsed) {
        if (!m.isOwn) m.isOwn = isOwnSender(m.sender, ownEmails, ownNames);
      }
      if (parsed.length > quoteMsgs.length) quoteMsgs = parsed;
    }
    log(`Fallback Zitat-Kette: ${quoteMsgs.length} Nachrichten.`);
    messages = quoteMsgs;
  }

  // Cache-Anhänge wieder anheften + redundanten Reply-Kontext bereinigen + markerlose
  // Zitat-Historie (Inhalts-Match gegen vorherige Bubbles) aus den Bodies schneiden.
  return stripCrossQuotes(pruneRedundantReplyTo(applyCachedAttachments(messages, loadAttCache())));
}

/** Hat dieser Knoten einen auswertbaren Mail-Body (div.a3s ODER Notification-Fallback div.ii.gt)? */
function nodeHasBody(n: HTMLElement): boolean {
  return (
    !!n.querySelector('div.a3s')?.textContent?.trim() ||
    !!n.querySelector('div.ii.gt')?.textContent?.trim()
  );
}

/**
 * Löst Gmails "Super-Collapse"-Bänder auf — MUSS vor expandCollapsedMessages laufen.
 *
 * In langen Threads faltet Gmail die mittleren Mails in ein Band-Element (div.adv,
 * Text = Anzahl versteckter Mails) zusammen. Diese Mails sind NICHT als div.adn im DOM,
 * sondern als div.kx/div.kv HINTER dem Band versteckt. Erst ein Klick auf das Band
 * materialisiert sie als [role=listitem], die danach einzeln expandiert werden können.
 * Genau das verfehlte die alte Pipeline: sie suchte nur collapsed div.adn (die es für
 * super-collapsed Mails gar nicht gibt) → nur die letzten 1-2 Mails wurden gefunden.
 *
 * KRITISCH (live verifiziert v1.6.4): div.adv trägt zwar ein jsaction-Attribut, ist aber
 * NICHT der funktionale Klick-Handler — ein Klick direkt auf div.adv bewirkt nichts.
 * Der Klick muss auf das oberste Element am Band-Mittelpunkt (document.elementFromPoint)
 * gefeuert werden; von dort bubbelt er zum echten Handler auf div.kv.bg. Synthetische
 * Events genügen (kein isTrusted nötig).
 */
async function expandSuperCollapsed(threadList: HTMLElement): Promise<boolean> {
  const visibleBand = (): HTMLElement | null =>
    Array.from(threadList.querySelectorAll<HTMLElement>('div.adv')).find(
      (a) => a.getClientRects().length > 0 && a.getBoundingClientRect().height > 0,
    ) ?? null;

  let didExpand = false;
  // Harte Obergrenze gegen Endlosschleife (NASA): mehrere/verschachtelte Bänder möglich.
  for (let i = 0; i < 8; i++) {
    const band = visibleBand();
    if (!band) break;
    // In den Viewport holen, damit elementFromPoint einen gültigen Trefferpunkt liefert.
    band.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 60));
    const r = band.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Funktionales Klick-Target ist das oberste Element am Band-Mittelpunkt, NICHT div.adv.
    const target = document.elementFromPoint(cx, cy) ?? band;
    fireSyntheticClick(target, cx, cy);
    didExpand = true;
    // Warten bis genau dieses Band aufgelöst ist (verschwindet / verliert Client-Rects).
    await waitFor(
      () => (band.isConnected && band.getClientRects().length > 0 ? null : true),
      1500,
      120,
    );
  }
  if (didExpand) log('Super-Collapse: Band(er) aufgelöst, versteckte Nachrichten materialisiert.');
  return didExpand;
}

/**
 * Expandiert eingeklappte Gmail-Nachrichten damit ihre div.a3s-Bodies in den DOM geladen werden.
 *
 * Gmail rendert Bodies (div.a3s) nur für aufgeklappte Mails. Eingeklappte Mails liegen als
 * [role=listitem] (div.kv) OHNE Body vor und werden erst durch Header-Klick zu div.adn mit Body.
 *
 * WICHTIG: Es wird über [role=listitem] iteriert, NICHT über div.adn — super-collapsed Mails
 * sind nach expandSuperCollapsed zwar Listitems, aber noch keine div.adn. Geklickt wird mit
 * der vollen synthetischen Pointer+Maus-Sequenz (fireSyntheticClick); ein nacktes .click()
 * reicht für Gmails jsaction-Handler nicht zuverlässig.
 */
async function expandCollapsedMessages(threadList: HTMLElement): Promise<boolean> {
  // Eingeklappte Nachrichten = Listitems ohne Body, die einen Mail-Header tragen
  // (.gE Absenderzeile bzw. span.gD Absender). Der Header-Filter schließt Nicht-Mail-
  // Listitems (z. B. Compose-/Reply-Box) aus. Durch threadList auf den aktiven Thread begrenzt.
  const toExpand = Array.from(threadList.querySelectorAll<HTMLElement>('[role="listitem"]')).filter(
    (li) => !nodeHasBody(li) && !!li.querySelector('.gE, span.gD'),
  );
  if (toExpand.length === 0) return false;

  log(`Expansion: ${toExpand.length} eingeklappte Nachrichten ohne Body — klicke Header...`);

  for (const node of toExpand) {
    // Gmail-Header-Klick-Target: Fallback-Kette spezifische Klassen → Listitem selbst.
    const header =
      node.querySelector<HTMLElement>('.gE.iv.gt') ??
      node.querySelector<HTMLElement>('.gE') ??
      node.querySelector<HTMLElement>('td.gF') ??
      node.querySelector<HTMLElement>('td.gH') ??
      node.querySelector<HTMLElement>('table.h7 td:first-child') ??
      node;
    const r = header.getBoundingClientRect();
    fireSyntheticClick(header, r.left + Math.min(40, r.width / 2), r.top + r.height / 2);
  }

  // Warten bis Gmail die Bodies gerendert hat (max 1.5s, Check alle 150ms)
  await waitFor(() => (toExpand.every(nodeHasBody) ? true : null), 1500, 150);

  const remaining = toExpand.filter((n) => !nodeHasBody(n));
  log(
    remaining.length > 0
      ? `Expansion: ${remaining.length}/${toExpand.length} Mails noch ohne Body (Gmail braucht Nutzer-Expansion).`
      : `Expansion: alle ${toExpand.length} Mails erfolgreich expandiert.`,
  );
  return true;
}

function findListContainer(): HTMLElement | null {
  const nodes = getMessageNodes();
  const last = nodes[nodes.length - 1];
  return (last?.closest('div[role="list"]') as HTMLElement | null) ?? null;
}

/* ---------- Direkt antworten (steuert Gmails eigenen Editor fern) ---------- */

/** Flag: wir senden gerade selbst - Auto-Deactivate darf nicht greifen. */
let sendingViaChat = false;

/**
 * Sofort wirksamer Modus-Override für diese Session: Der Button-Klick gilt
 * SOFORT (kein Storage-Race, funktioniert auch bei totem Extension-Kontext).
 * null = Storage ist die Quelle der Wahrheit.
 */
let sessionMode: boolean | null = null;
// Verhindert Doppel-Aktivierung: check() prueft dieses Flag, bevor es activate() ruft.
// Ohne Guard loest die DOM-Mutation aus activate() via MutationObserver einen
// zweiten activate()-Aufruf aus, waehrend der erste noch laeuft.
let activating = false;
/** Spam-Guard: true während der gesamten toggle()-Operation (inkl. Deaktivierung + Label-Update). */
let toggling = false;

async function waitFor<T>(fn: () => T | null | undefined, timeoutMs = 6000, stepMs = 120): Promise<T | null> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

function findComposeBody(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    'div[role="textbox"][g_editable="true"], div[aria-label="Nachrichtentext"], div[aria-label="Message Body"], div.Am.Al.editable',
  );
}

/**
 * Findet einen Compose-Body NUR wenn er INNERHALB der versteckten Thread-Liste liegt.
 * Verhindert, dass das Schreiben-Popup (neuer Tab, nicht Antwort) den Compose-Mode
 * triggert und die Chat-Ansicht zerstört. Inline-Antworten liegen immer im hiddenList.
 */
function findInlineComposeBody(): HTMLElement | null {
  if (!state.hiddenList) return null;
  const body = findComposeBody();
  return body && state.hiddenList.contains(body) ? body : null;
}

function findReplyTrigger(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('span.ams.bkH') ??
    document.querySelector<HTMLElement>(
      '[data-tooltip="Antworten"], [aria-label="Antworten"], [data-tooltip="Reply"], [aria-label="Reply"]',
    )
  );
}

function findSendButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[data-tooltip^="Senden"], [aria-label^="Senden"], [data-tooltip^="Send"], [aria-label^="Send"]',
  );
}

// ---- Per-Thread-Einstellungen: Hilfs-Funktionen ------------------------------

/**
 * Thread-ID aus der Gmail-URL extrahieren.
 * Gmail-URL-Muster: #inbox/18f8d3a2b5c6e7f8, #sent/..., #label/Name/...
 * Die Thread-ID ist immer das letzte Segment des URL-Hashes (genau 16 Hex-Zeichen).
 * @public Exportiert für Unit-Tests.
 */
export function getThreadId(): string | null {
  const hash = typeof location !== 'undefined' ? location.hash : '';
  const parts = hash.split('/');
  const last = parts[parts.length - 1] ?? '';
  return /^[0-9a-f]{16}$/.test(last) ? last : null;
}

async function loadThreadPrefs(): Promise<ThreadPrefs> {
  try {
    const r = await chrome.storage.sync.get(THREAD_PREFS_KEY);
    return (r[THREAD_PREFS_KEY] as ThreadPrefs | undefined) ?? {};
  } catch {
    return {};
  }
}

async function saveThreadPref(threadId: string, mode: ThreadMode | null): Promise<void> {
  try {
    const prefs = await loadThreadPrefs();
    if (mode === null) {
      delete prefs[threadId];
    } else {
      prefs[threadId] = mode;
    }
    await chrome.storage.sync.set({ [THREAD_PREFS_KEY]: prefs });
  } catch {
    /* Storage nicht verfügbar — kein Abbruch, Pref geht verloren */
  }
}

/**
 * Benutzerdefiniertes Kontextmenü am Toggle-Button (Rechtsklick).
 * Kein chrome.contextMenus nötig — reines HTML/CSS, komplett isoliert von Gmail.
 * Zeigt Thread-spezifische Ansichts-Optionen + (optional) Einstellungen.
 */
function showThreadContextMenu(
  x: number,
  y: number,
  threadId: string | null,
  currentPref: ThreadMode | undefined,
  openSettings?: () => void,
): void {
  document.getElementById('chatmail-ctx-menu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'chatmail-ctx-menu';

  const addItem = (label: string, cls: string, cb: () => void): void => {
    const btn = document.createElement('button');
    if (cls) btn.className = cls;
    btn.textContent = label;
    btn.addEventListener('click', () => { menu.remove(); cb(); });
    menu.appendChild(btn);
  };
  const addSep = (): void => {
    const d = document.createElement('div');
    d.className = 'cm-ctx-sep';
    menu.appendChild(d);
  };
  const addHint = (t: string): void => {
    const d = document.createElement('div');
    d.className = 'cm-ctx-hint';
    d.textContent = t;
    menu.appendChild(d);
  };

  addHint('Mail to Chat');

  if (threadId) {
    const applyPref = (mode: ThreadMode | null): void => {
      void saveThreadPref(threadId, mode).then(() => {
        sessionMode = null; // Session-Override freigeben → Pref greift sofort
        scheduleCheckRef?.();
      });
    };
    if (currentPref === 'classic') {
      addItem('✓ Immer klassisch (gesetzt)', 'cm-ctx-active', () => applyPref(null));
      addItem('Chat-Ansicht für diese Mail', '', () => applyPref('chat'));
    } else if (currentPref === 'chat') {
      addItem('✓ Immer Chat (gesetzt)', 'cm-ctx-active', () => applyPref(null));
      addItem('Klassisch für diese Mail', '', () => applyPref('classic'));
    } else {
      addItem('Diese Mail immer klassisch', '', () => applyPref('classic'));
      addItem('Diese Mail immer als Chat', '', () => applyPref('chat'));
    }
    addSep();
  }

  if (openSettings) {
    addItem('Einstellungen…', '', openSettings);
  }

  document.body.appendChild(menu);
  // Overflow-Guard: Menü darf nicht aus dem Viewport ragen
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;

  // Click außerhalb → Menü schließen
  const dismiss = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener('click', dismiss, true);
    }
  };
  // setTimeout 0: verhindert dass das contextmenu-Event selbst dismiss auslöst
  setTimeout(() => document.addEventListener('click', dismiss, true), 0);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Sendet eine Antwort über Gmails eigenen Reply-Flow:
 * Reply öffnen → Text in den Editor schreiben → Senden klicken.
 * Threading, Signaturen und Zustellung bleiben damit 100% Gmail.
 */
async function sendChatReply(text: string): Promise<boolean> {
  sendingViaChat = true;
  try {
    let body = findComposeBody();
    if (!body) {
      const trigger = findReplyTrigger();
      if (!trigger) return false;
      trigger.click();
      body = await waitFor(findComposeBody);
    }
    if (!body) return false;

    body.focus();
    body.innerHTML = text
      .split('\n')
      .map((l) => `<div>${escapeHtml(l) || '<br>'}</div>`)
      .join('');
    body.dispatchEvent(new InputEvent('input', { bubbles: true }));

    const send = await waitFor(findSendButton, 4000);
    if (!send) return false;
    send.click();

    // Warten, bis Gmail den Editor schließt → gesendet
    const closed = await waitFor(() => (findComposeBody() ? null : true), 10000);
    return closed === true;
  } finally {
    // kurze Karenz, damit der Auto-Deactivate-Check nicht den eigenen Send-Flow erwischt
    setTimeout(() => {
      sendingViaChat = false;
    }, 1500);
  }
}

/**
 * Bereits im Chat-Composer getippten Text in Gmails Editor uebernehmen.
 * Ohne das ginge der Entwurf beim Wechsel (Aa/Anhang/Antworten) verloren.
 */
async function prefillEditor(draft: string): Promise<void> {
  if (!draft.trim()) return;
  const body = await waitFor(findComposeBody);
  if (!body) return;
  const html = draft
    .split('\n')
    .map((l) => `<div>${escapeHtml(l) || '<br>'}</div>`)
    .join('');
  if ((body.textContent ?? '').trim().length === 0) {
    body.innerHTML = html;
  } else {
    // Editor enthaelt schon Inhalt (z. B. Forward-Zitat): Draft oben einsetzen
    body.insertAdjacentHTML('afterbegin', `${html}<div><br></div>`);
  }
  body.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

/**
 * Öffnet Gmails vollen Editor UNTER der Chat-Ansicht (Compose-Mode).
 * Die Chat-Ansicht bleibt oben sichtbar; der MutationObserver blendet den
 * Editor automatisch ein, sobald er im DOM erscheint.
 */
function openFullEditor(draft = ''): void {
  findReplyTrigger()?.click();
  void prefillEditor(draft);
}

function deactivate(): void {
  state.host?.remove();
  state.host = null;
  if (state.hiddenList) {
    // Compose-Mode-Reste aufräumen: versteckte Mail-Zeilen wieder freigeben
    state.hiddenList
      .querySelectorAll<HTMLElement>('[role="listitem"]')
      .forEach((li) => li.style.removeProperty('display'));
    state.hiddenList.style.removeProperty('display');
    state.hiddenList = null;
  }
  state.composeMode = false;
  if (state.hiddenReplyRow) {
    state.hiddenReplyRow.style.removeProperty('display');
    state.hiddenReplyRow = null;
  }
  state.active = false;
}

/** Antwort-/Weiterleiten-Steuerelement einer bestimmten Mail (oder Thread-Fallback). */
function findMessageAction(node: HTMLElement | null, kind: 'reply' | 'forward'): HTMLElement | null {
  const sel =
    kind === 'reply'
      ? '[data-tooltip="Antworten"], [aria-label="Antworten"], [data-tooltip="Reply"], [aria-label="Reply"]'
      : '[data-tooltip="Weiterleiten"], [aria-label="Weiterleiten"], [data-tooltip="Forward"], [aria-label="Forward"]';
  const byAttr =
    node?.querySelector<HTMLElement>(sel) ??
    document.querySelector<HTMLElement>(sel) ??
    document.querySelector<HTMLElement>(kind === 'reply' ? 'span.ams.bkH' : 'span.ams.bkI');
  if (byAttr) return byAttr;
  // Text-Fallback: Gmail ändert Klassen, aber die Beschriftung bleibt
  const re = kind === 'reply' ? /^(antworten|reply)$/i : /^(weiterleiten|forward)$/i;
  return (
    Array.from(document.querySelectorAll<HTMLElement>('span.ams, [role="link"], [role="button"]')).find((el) =>
      re.test(el.textContent?.trim() ?? ''),
    ) ?? null
  );
}

/** Editor öffnen (falls zu) und Gmails Datei-Anhang-Dialog auslösen. */
async function openAttachDialog(draft = ''): Promise<void> {
  if (!findComposeBody()) {
    findReplyTrigger()?.click();
    await waitFor(findComposeBody);
  }
  await prefillEditor(draft);
  const attach = await waitFor(
    () =>
      document.querySelector<HTMLElement>(
        '[data-tooltip="Dateien anhängen"], [aria-label="Dateien anhängen"], [data-tooltip="Attach files"], [aria-label="Attach files"], div[command="Files"]',
      ),
    4000,
  );
  attach?.click();
}

/** Chat-Index → Gmail-Node (DOM-Nodes decken die LETZTEN k Nachrichten ab). */
function nodeForIndex(idx: number): HTMLElement | null {
  const offset = state.lastCount - state.lastNodes.length;
  return state.lastNodes[idx - offset] ?? null;
}

/** Steht im Thread noch (eingeklappte / super-collapsed) Expansion an? */
function hasPendingExpansion(threadList: HTMLElement): boolean {
  const superCollapsed = Array.from(threadList.querySelectorAll<HTMLElement>('div.adv')).some(
    (a) => a.getClientRects().length > 0,
  );
  if (superCollapsed) return true;
  return Array.from(threadList.querySelectorAll<HTMLElement>('[role="listitem"]')).some(
    (li) => !nodeHasBody(li) && !!li.querySelector('.gE, span.gD'),
  );
}

async function activate(deps: AdapterDeps): Promise<boolean> {
  // Thread-Snapshot VOR dem ersten await: wenn der Nutzer zwischendurch
  // eine andere Mail oeffnet, waere unsere Aktivierung fuer den falschen Thread.
  const threadKeyBefore = findThreadHeader()?.textContent ?? '';
  const settings = await deps.getSettings();
  // Thread hat sich waehrend des await geaendert? Sofort abbrechen.
  if ((findThreadHeader()?.textContent ?? '') !== threadKeyBefore) {
    log('Aktivierung abgebrochen: Thread-Wechsel waehrend Laden.');
    return false;
  }
  // WICHTIG: Erst deaktivieren (Liste wieder sichtbar machen) - der
  // Sichtbarkeits-Filter in getMessageNodes() würde sonst beim Re-Render
  // (z. B. nach dem Senden) die versteckten Nachrichten nicht finden.
  deactivate();

  // Eingeklappte Gmail-Nachrichten aufklappen damit ihre Bodies (div.a3s) in den DOM geladen werden.
  // Gmail rendert Bodies nur für aufgeklappte Mails; in langen Threads sind ältere Mails
  // "smart-collapsed" und haben kein Body-HTML bis sie expandiert werden.
  // Aktiven Thread-Container bestimmen + prüfen, ob noch Nachrichten nachzuladen sind.
  const adnForExpand = Array.from(document.querySelectorAll<HTMLElement>('div.adn')).filter(isVisible);
  const tl = adnForExpand[0]?.closest<HTMLElement>('[role="list"]') ?? null;
  const pending = tl ? hasPendingExpansion(tl) : false;

  // SOFORT verfügbare Nachrichten holen — ohne auf die (langsame) Expansion zu warten.
  // Die Chat-Ansicht erscheint dadurch instant (wie im echten Gmail); fehlende ältere
  // Nachrichten werden danach UNSICHTBAR im Hintergrund nachgeladen (backgroundExpand).
  let messages = buildThreadMessages(settings);
  // Sonderfall: gar nichts geladen (reiner Super-Collapse-Thread) → erst expandieren, sonst
  // gäbe es nichts zu zeigen. Normalerweise ist die neueste Mail bereits geladen.
  if (messages.length === 0 && tl) {
    await expandSuperCollapsed(tl);
    await expandCollapsedMessages(tl);
    messages = buildThreadMessages(settings);
  }
  if (messages.length === 0) {
    log('Aktivierung abgebrochen: 0 sichtbare Nachrichten gefunden (div.adn).');
    return false;
  }
  const list = findListContainer();
  if (!list || !list.parentElement) {
    log('Aktivierung abgebrochen: Nachrichten-Container (div[role=list]) nicht gefunden.');
    return false;
  }
  log('Aktiviere Chat-Ansicht (sofort):', messages.length, 'Nachrichten.');
  renderChat(deps, settings, messages, list);

  // Restliche (eingeklappte / super-collapsed) Nachrichten unsichtbar im Hintergrund nachladen
  // und die Chat-Ansicht danach still aktualisieren — die Seite wird nie blockiert.
  if (tl && pending) void backgroundExpand(deps, settings, tl, threadKeyBefore);
  return true;
}

/**
 * Baut die Chat-Ansicht aus `messages`, hängt sie anstelle der Gmail-Liste ein und blendet sie
 * ein. Wiederverwendet für den Sofort-Render UND das Hintergrund-Update nach der Expansion.
 */
function renderChat(
  deps: AdapterDeps,
  settings: ChatSettings,
  messages: MessageObject[],
  list: HTMLElement,
): void {
  if (!list.parentElement) return;
  state.lastNodes = getMessageNodes();
  state.lastCount = messages.length;

  /** Gmail-Steuerelement der gewählten Mail klicken - Editor erscheint
   *  unter der Chat-Ansicht (Compose-Mode), Chat bleibt oben. */
  const labels = LABELS[settings.uiLanguage] ?? LABELS.de;
  const jumpToAction = (idx: number, kind: 'reply' | 'forward', draft: string): void => {
    const m = messages[idx];
    if (m) {
      pendingCtx = {
        label: kind === 'reply' ? labels.replyCtx : labels.forwardCtx,
        preview: m.bodyText.replace(/\s+/g, ' ').trim().slice(0, 90),
        time: m.timestamp,
      };
    }
    findMessageAction(nodeForIndex(idx), kind)?.click();
    void prefillEditor(draft);
  };

  const host = createChatView(messages, settings, {
    onSend: async (text) => {
      const ok = await sendChatReply(text);
      if (ok) {
        // Gmail braucht einen Moment, um die gesendete Mail in den Thread zu hängen
        await new Promise((r) => setTimeout(r, 900));
        await activate(deps);
      }
      return ok;
    },
    onOpenFullEditor: (draft) => openFullEditor(draft),
    onOpenAttach: (draft) => void openAttachDialog(draft),
    onReplyTo: (idx, draft) => jumpToAction(idx, 'reply', draft),
    onForward: (idx, draft) => jumpToAction(idx, 'forward', draft),
  });
  // Fade-in: opacity 0→1 in 150ms (doppeltes rAF = garantierter Paint-Zyklus vor Transition)
  host.style.opacity = '0';
  list.parentElement.insertBefore(host, list);
  list.style.display = 'none';
  requestAnimationFrame(() => {
    // Messenger-Verhalten: unten (neueste Nachricht) starten, nicht oben
    host.scrollIntoView({ block: 'end' });
    requestAnimationFrame(() => {
      host.style.transition = 'opacity 150ms ease-out';
      host.style.opacity = '1';
      setTimeout(() => { if (host.isConnected) host.style.transition = ''; }, 200);
    });
  });
  // Gmails eigene Antworten/Weiterleiten-Reihe ausblenden - der Composer ersetzt sie
  const replyRow = document.querySelector<HTMLElement>('span.ams.bkH')?.closest<HTMLElement>('.amn');
  if (replyRow) {
    replyRow.style.display = 'none';
    state.hiddenReplyRow = replyRow;
  }
  state.host = host;
  state.hiddenList = list;
  state.active = true;
}

/**
 * Lädt im Hintergrund die noch eingeklappten / super-collapsed Nachrichten nach und aktualisiert
 * danach die Chat-Ansicht — OHNE die Seite je zu blockieren.
 *
 * Trick: Der bereits sichtbare Chat-Host wird kurz als fixierter Overlay (pointer-events:none)
 * über die wieder eingeblendete native Liste gelegt. So bleibt der Chat sichtbar, während
 * document.elementFromPoint() die Super-Collapse-Bänder DAHINTER erreicht (Expansion funktioniert
 * weiter). Danach wird mit allen Nachrichten neu gerendert. Defensiv (NASA): bei jedem Fehler
 * bleibt der Sofort-Chat erhalten — kein kaputter Zustand.
 */
async function backgroundExpand(
  deps: AdapterDeps,
  settings: ChatSettings,
  tl: HTMLElement,
  threadKey: string,
): Promise<void> {
  const host = state.host;
  const list = state.hiddenList;
  if (!host || !list) return;
  const restore = (): void => {
    host.style.position = '';
    host.style.top = '';
    host.style.left = '';
    host.style.width = '';
    host.style.height = '';
    host.style.zIndex = '';
    host.style.pointerEvents = '';
    list.style.display = 'none';
  };
  try {
    // Host über den GANZEN Lesebereich fixieren (Eltern-Rect, nicht nur die kurze Sofort-Höhe),
    // damit die dahinter eingeblendete native Liste vollständig verdeckt bleibt.
    const r = (host.parentElement ?? host).getBoundingClientRect();
    host.style.position = 'fixed';
    host.style.top = `${r.top}px`;
    host.style.left = `${r.left}px`;
    host.style.width = `${r.width}px`;
    host.style.height = `${r.height}px`;
    host.style.zIndex = '2147483000';
    host.style.pointerEvents = 'none';
    list.style.display = '';

    await expandSuperCollapsed(tl);
    await expandCollapsedMessages(tl);

    // Abbruch, wenn inzwischen Thread gewechselt wurde oder ein neuer Lauf den Host ersetzt hat.
    if (state.host !== host || (findThreadHeader()?.textContent ?? '') !== threadKey) return;

    const full = buildThreadMessages(settings);
    if (full.length > state.lastCount) {
      const list2 = findListContainer() ?? list;
      if (list2.parentElement) {
        // Neuen Host (alle Nachrichten) im Normalfluss rendern; der alte fixierte Overlay
        // deckt den Fade-in ab und wird danach entfernt → kein Flackern.
        renderChat(deps, settings, full, list2);
        const oldHost = host;
        setTimeout(() => oldHost.remove(), 220);
      } else {
        restore();
      }
    } else {
      // Nichts Neues dazugekommen → Host zurück in Normalfluss, Liste verstecken.
      restore();
    }
  } catch (err) {
    log('Hintergrund-Expansion fehlgeschlagen, Sofort-Chat bleibt aktiv:', String(err));
    restore();
  }
}

/**
 * Button = HARTER globaler Schalter: einmal Chat-Ansicht an → gilt persistent
 * für alle Mails (bis wieder ausgeschaltet). "Antworten"/Aa wechseln nur
 * temporär zum Editor; danach kehrt die Chat-Ansicht automatisch zurück.
 */
async function toggle(deps: AdapterDeps): Promise<void> {
  // Spam-Guard: toggling deckt BEIDE Pfade ab (Aktivierung + Deaktivierung).
  // activating als zweite Schranke gegen Race mit check().
  if (toggling || activating) {
    log('Toggle ignoriert: Operation läuft noch.');
    return;
  }
  toggling = true;
  // Sofortiges visuelles Feedback — verhindert Spam-Klicks ab dem ersten Frame.
  setButtonLoading(true);
  try {
    log('Toggle geklickt. Aktiv bisher:', state.active);
    if (state.active) {
      // Deaktivierung: sync + schnell, aber updateButtonLabel() danach ist async.
      // Ohne toggling/setButtonLoading hätte der Button bis dahin keinen Schutz.
      deactivate();
      sessionMode = false;
      deps.setAutoActivate?.(false);
    } else {
      activating = true;
      try {
        const ok = await activate(deps);
        // KEIN waitFor-Blocking: sessionMode=true → MutationObserver/check() übernimmt Retry
        sessionMode = true;
        deps.setAutoActivate?.(true);
        if (!ok) {
          log('Aktivierung fehlgeschlagen (noch keine Nachrichten) – check() übernimmt Retry.');
        }
      } finally {
        activating = false;
      }
    }
    await updateButtonLabel(deps);
  } catch (err) {
    console.error('[Mail to Chat] Toggle fehlgeschlagen:', err);
    activating = false;
  } finally {
    // Immer aufräumen — auch bei unerwarteten Fehlern.
    toggling = false;
    setButtonLoading(false);
  }
}

async function updateButtonLabel(deps: AdapterDeps): Promise<void> {
  const settings = await deps.getSettings();
  const labels = LABELS[settings.uiLanguage] ?? LABELS.de;
  const tb = document.getElementById(TB_ID);
  if (!tb) return;
  const track = tb.querySelector<HTMLElement>('.cm-sw-track');
  const thumb = tb.querySelector<HTMLElement>('.cm-sw-thumb');
  const lbl   = tb.querySelector<HTMLElement>('.cm-sw-label');
  if (state.active) {
    if (track) track.style.background = '#f2c200';
    if (thumb) thumb.style.transform  = 'translateX(16px)';
    if (lbl)   lbl.textContent = labels.active;
    tb.dataset['cmtt'] = labels.tooltipOn;
  } else {
    if (track) track.style.background = 'rgba(128,128,128,0.35)';
    if (thumb) thumb.style.transform  = 'translateX(0)';
    if (lbl)   lbl.textContent = labels.inactive;
    tb.dataset['cmtt'] = labels.tooltipOff;
  }
}

/**
 * Visueller Lade-Zustand des Toggle-Switch.
 * NASA-Prinzip: sofortiges, klares Feedback — unclickbar + Switch pulsiert.
 */
function setButtonLoading(loading: boolean): void {
  const tb = document.getElementById(TB_ID);
  if (!tb) return;
  const track = tb.querySelector<HTMLElement>('.cm-sw-track');
  if (loading) {
    tb.style.opacity = '0.5';
    tb.style.pointerEvents = 'none';
    tb.setAttribute('aria-busy', 'true');
    if (track) track.style.animation = 'chatmail-pulse 0.9s ease-in-out infinite';
  } else {
    tb.style.opacity = '';
    tb.style.pointerEvents = '';
    tb.removeAttribute('aria-busy');
    if (track) track.style.animation = '';
  }
}

const GEAR_ID = 'chatmail-settings-btn';
const TB_ID = 'chatmail-toggle-tb';
// Wrapper-Div, das Toggle + Gear buendelt - nur dieser wird absolut in der Leiste verankert
const GROUP_ID = 'chatmail-tb-group';

/**
 * Berechnet die linke Position der Gruppe: rechts neben Gmails Icon-Gruppe.
 * WARUM absolut: Ein Fluss-Element bricht im Lesebereich in eine neue Zeile
 * und landet ueber der Mail-Liste, wo Gmails Overlay alle Klicks abfaengt.
 */
function positionGroup(group: HTMLElement, toolbar: HTMLElement): void {
  const firstChild = toolbar.firstElementChild as HTMLElement | null;
  const base = toolbar.getBoundingClientRect();
  const anchor = firstChild?.getBoundingClientRect();
  const left = anchor && anchor.width > 0 ? anchor.right - base.left + 12 : 8;
  group.style.left = `${Math.max(8, Math.round(left))}px`;
}

/**
 * Einziger Toggle: in Gmails oberer Aktionsleiste (div[gh="mtb"]).
 * Toggle-Pill + Einstellungs-Zahnrad sind in einem absolut verankerten
 * Wrapper-Div zusammengefasst, damit sie nie in eine neue Zeile brechen.
 */
function injectToolbarButton(deps: AdapterDeps): void {
  // Strenger Check: nur h2.hP (Gmails Thread-Betreff-Klasse), kein generischer h2-Fallback.
  // findThreadHeader() hat einen Inbox-Heading-Fallback der zu false positives führt —
  // der Switch soll ausschließlich sichtbar sein wenn wirklich ein Thread offen ist.
  const hasMail = Array.from(document.querySelectorAll<HTMLElement>('h2.hP')).some(isVisible);
  const toolbar = Array.from(document.querySelectorAll<HTMLElement>('div[gh="mtb"]')).find(isVisible);
  let grp = document.getElementById(GROUP_ID);
  if (!toolbar) {
    if (grp) grp.style.display = 'none';
    return;
  }
  if (getComputedStyle(toolbar).position === 'static') toolbar.style.position = 'relative';
  if (!grp) {
    // Wrapper
    grp = document.createElement('div');
    grp.id = GROUP_ID;
    grp.style.cssText = [
      'position:absolute', 'top:50%', 'transform:translateY(-50%)', 'z-index:9',
      'display:inline-flex', 'align-items:center', 'gap:6px', 'display:none',
    ].join(';');
    // Toggle-Switch (iOS/Settings-Style)
    const btn = document.createElement('button');
    btn.id = TB_ID;
    btn.type = 'button';
    // Kein aria-label: auf macOS/Chrome löst aria-label einen nativen Tooltip-Delay aus.
    // Kein data-tooltip: Gmail liest dieses Attribut selbst aus → würde Gmails eigenen
    // Tooltip zusätzlich zu unserem CSS-Tooltip auslösen (Doppel-Tooltip-Problem).
    // data-cmtt = Mail-to-Chat-eigenes Attribut, das Gmail nicht kennt.
    btn.dataset['cmtt'] = LABELS.de.tooltipOff;
    btn.style.cssText = [
      'margin:0', 'padding:4px 10px 4px 8px', 'border:none',
      'background:transparent', 'cursor:pointer',
      'display:inline-flex', 'align-items:center', 'gap:7px',
      'font-family:inherit', 'font-size:12.5px', 'font-weight:600',
      'color:inherit', 'border-radius:6px', 'white-space:nowrap',
      'transition:background 0.15s', 'position:relative',
    ].join(';');
    btn.addEventListener('mouseenter', () => {
      if (btn.style.pointerEvents !== 'none') btn.style.background = 'rgba(128,128,128,0.12)';
    });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
    btn.addEventListener('click', () => void toggle(deps));
    // Rechtsklick → Thread-spezifische Ansichts-Pref (immer klassisch / immer Chat)
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const tid = getThreadId();
      void (tid ? loadThreadPrefs() : Promise.resolve({} as ThreadPrefs)).then((prefs) => {
        showThreadContextMenu(e.clientX, e.clientY, tid, tid ? prefs[tid] : undefined, deps.openSettings);
      });
    });

    // Switch-Track: Rundrechteck, Farbe zeigt Zustand
    const track = document.createElement('div');
    track.className = 'cm-sw-track';
    track.style.cssText = [
      'position:relative', 'width:36px', 'height:20px',
      'border-radius:10px', 'background:rgba(128,128,128,0.35)',
      'transition:background 0.2s ease', 'flex-shrink:0',
      'pointer-events:none',
    ].join(';');

    // Switch-Thumb: weißer Kreis, gleitet links↔rechts
    const thumb = document.createElement('div');
    thumb.className = 'cm-sw-thumb';
    thumb.style.cssText = [
      'position:absolute', 'top:3px', 'left:3px',
      'width:14px', 'height:14px', 'border-radius:50%',
      'background:#fff', 'box-shadow:0 1px 3px rgba(0,0,0,0.35)',
      'transition:transform 0.2s ease',
    ].join(';');
    track.appendChild(thumb);

    // P0.2: Sofort sichtbarer Label (DE-Fallback) — verhindert leeren Flash.
    const lbl = document.createElement('span');
    lbl.className = 'cm-sw-label';
    lbl.textContent = LABELS.de.inactive;

    btn.appendChild(track);
    btn.appendChild(lbl);
    grp.appendChild(btn);
    // Einstellungs-Zahnrad (nur wenn openSettings vorhanden)
    if (deps.openSettings) {
      const gear = document.createElement('button');
      gear.id = GEAR_ID;
      gear.type = 'button';
      // Kein title, kein aria-label: beide lösen nativen Browser-Tooltip aus.
      // Kein data-tooltip: Gmail liest dieses Attribut → Doppel-Tooltip.
      // data-cmtt = eigenes Attribut, das Gmail nicht kennt.
      // SR-Fallback: visuell versteckter <span> liefert zugänglichen Namen für Screen Reader.
      gear.dataset['cmtt'] = 'Mail to Chat — Einstellungen';
      gear.innerHTML = ICONS.gear;
      const gearSrLabel = document.createElement('span');
      gearSrLabel.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
      gearSrLabel.textContent = 'Mail to Chat Einstellungen';
      gear.appendChild(gearSrLabel);
      gear.style.cssText = [
        'width:28px', 'height:28px', 'border-radius:50%', 'border:none',
        'background:rgba(128,128,128,0.16)', 'color:inherit', 'font-size:14px',
        'cursor:pointer', 'display:inline-flex', 'align-items:center',
        'justify-content:center', 'flex-shrink:0', 'transition:background 0.15s',
      ].join(';');
      gear.addEventListener('mouseenter', () => (gear.style.background = 'rgba(128,128,128,0.28)'));
      gear.addEventListener('mouseleave', () => (gear.style.background = 'rgba(128,128,128,0.16)'));
      gear.addEventListener('click', () => deps.openSettings?.());
      grp.appendChild(gear);
    }
    void updateButtonLabel(deps);
  }
  // Gmail tauscht die Leiste je nach Ansicht aus -> Gruppe umziehen wenn noetig
  if (grp.parentElement !== toolbar) toolbar.appendChild(grp);
  grp.style.display = hasMail ? 'inline-flex' : 'none';
  if (hasMail) positionGroup(grp, toolbar);
}


/**
 * Injiziert/aktualisiert globale CSS-Regeln in <head>.
 * UPSERT-Pattern (kein Early-Return): Aktualisiert auch nach Extension-Reload
 * ohne Tab-Refresh — verhindert Stale-CSS von alten Instanzen.
 *
 * KRITISCH: Kein Template-Variable-Komma-Bug bei ::after-Selektoren!
 * "a,b[data-tooltip]::after" wird von CSS als ZWEI Selektoren geparst:
 *   1. "a"                     → würde pointer-events:none auf den Button SELBST setzen → unklickbar!
 *   2. "b[data-tooltip]::after" → korrekt
 * Fix: jeden Selektor explizit mit ::after ausschreiben — kein geteilter Selektor via Variable.
 */
function injectGlobalCss(): void {
  let s = document.getElementById('chatmail-global-css') as HTMLStyleElement | null;
  if (!s) {
    s = document.createElement('style');
    s.id = 'chatmail-global-css';
    document.head.appendChild(s);
  }
  s.textContent = [
    // Puls-Animation für Loading-State des Switch-Tracks
    '@keyframes chatmail-pulse{0%,100%{opacity:0.5}50%{opacity:0.22}}',
    // position:relative auf beiden Buttons (Basis für absolut-positioniertes ::after)
    '#chatmail-toggle-tb,#chatmail-settings-btn{position:relative;}',
    // Custom-Tooltip via data-cmtt (NICHT data-tooltip: Gmail liest data-tooltip selbst →
    // Doppel-Tooltip). Jeder Selektor hat sein eigenes ::after — kein Komma-Selektor-Bug.
    '#chatmail-toggle-tb[data-cmtt]::after,#chatmail-settings-btn[data-cmtt]::after{',
    'content:attr(data-cmtt);position:absolute;top:calc(100% + 8px);left:50%;',
    'transform:translateX(-50%);white-space:nowrap;',
    'background:rgba(15,15,15,0.92);color:#fff;padding:5px 10px;border-radius:6px;',
    'font-size:11.5px;font-weight:500;pointer-events:none;',
    'opacity:0;transition:opacity 0.08s ease;z-index:99999;',
    'box-shadow:0 2px 8px rgba(0,0,0,0.30);}',
    '#chatmail-toggle-tb:hover[data-cmtt]::after,#chatmail-settings-btn:hover[data-cmtt]::after{opacity:1;}',
    // Context-Menu (Rechtsklick am Toggle-Button)
    '#chatmail-ctx-menu{position:fixed;z-index:2147483647;background:#222;',
    'border:1px solid rgba(255,255,255,0.13);border-radius:10px;padding:5px 0;',
    'min-width:230px;box-shadow:0 6px 24px rgba(0,0,0,0.45);',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;}',
    '#chatmail-ctx-menu button{display:block;width:100%;text-align:left;background:none;',
    'border:none;padding:9px 16px;color:#e8eaed;cursor:pointer;border-radius:6px;transition:background 0.1s;}',
    '#chatmail-ctx-menu button:hover{background:rgba(255,255,255,0.10);}',
    '#chatmail-ctx-menu .cm-ctx-sep{height:1px;background:rgba(255,255,255,0.10);margin:4px 0;}',
    '#chatmail-ctx-menu .cm-ctx-active{color:#f2c200;}',
    '#chatmail-ctx-menu .cm-ctx-hint{font-size:11.5px;padding:5px 16px 8px;color:rgba(255,255,255,0.45);}',
  ].join('');
}

/** Einstieg: beobachtet Gmail (SPA) und verdrahtet Button + Shortcut. */
export function initGmailAdapter(deps: AdapterDeps): void {
  let lastThreadKey = '';

  // NASA: Bounded retry counter für autoActivate Race-Condition
  // (Gmail rendert div.adn manchmal später als check() läuft)
  let retryActivationCount = 0;
  const MAX_ACTIVATION_RETRIES = 8; // 8 × 400ms = max 3.2s Wartezeit

  // ---- Scheduler: Single-Flight + Debounce + Re-Trigger --------------------
  //
  // Problemstellung: check() ist async. Gmail feuert MutationObserver-Callbacks
  // im Dutzend pro Sekunde. Ohne Guard koennen mehrere check()-Instanzen
  // gleichzeitig laufen und sich gegenseitig in die Quere kommen (doppeltes
  // activate(), Race-Conditions auf state.active).
  //
  // Loesung: Exakt eine check()-Instanz laeuft zu jedem Zeitpunkt.
  //   - scheduled:     verhindert doppeltes setTimeout (entprellen)
  //   - checking:      verhindert gleichzeitige check()-Ausfuehrung
  //   - needsRecheck:  merkt sich "Mutation waehrend check lief" -> Re-Trigger
  //
  // Dieses Muster ist aequivalent zu Reacts Scheduler (single-flight + dirty flag).
  // -------------------------------------------------------------------------
  let scheduled = false;
  let checking = false;
  let needsRecheck = false;
  /** NASA: Aufgabe-Flag — verhindert Endlosschleife wenn Retries erschöpft.
   *  Wird NUR bei Thread-Wechsel zurückgesetzt, NICHT durch den Heartbeat. */
  let activationGaveUp = false;

  const scheduleCheck = (): void => {
    // Neuere Instanz hat uebernommen? Nicht mehr einreihen.
    if (!isStillOwner()) return;
    if (checking) {
      needsRecheck = true;
      return;
    }
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      void runCheck();
    }, 50);
  };
  // Modul-Level-Referenz für Context-Menu-Actions (showThreadContextMenu)
  scheduleCheckRef = scheduleCheck;

  const runCheck = async (): Promise<void> => {
    // Vor jedem Lauf pruefen - ein neuerer Start koennte zwischenzeitlich
    // den Generation-Counter erhoeht haben.
    if (!isStillOwner()) {
      observer.disconnect();
      log('Veraltete Instanz erkannt - Graceful shutdown.');
      return;
    }
    if (checking) {
      needsRecheck = true;
      return;
    }
    checking = true;
    try {
      await check();
    } catch (err) {
      console.error('[Mail to Chat] check() fehlgeschlagen:', err);
    } finally {
      checking = false;
      if (needsRecheck && isStillOwner()) {
        needsRecheck = false;
        scheduleCheck();
      }
    }
  };

  const check = async (): Promise<void> => {
    const header = findThreadHeader();
    const key = header?.textContent ?? '';
    if (key !== lastThreadKey) {
      // Threadwechsel: alten Zustand verwerfen (Toolbar-Gruppe bleibt, Chat-View weg)
      lastThreadKey = key;
      retryActivationCount = 0;  // NASA: Reset Retry-Counter bei Thread-Wechsel
      activationGaveUp = false;  // NASA: Retry-Sperre aufheben bei Thread-Wechsel
      sessionMode = null;         // Session-Override nicht in nächsten Thread übertragen —
      //   Thread-Prefs (storage) und autoActivate (settings) bestimmen den neuen Modus
      deactivate();
    }
    injectToolbarButton(deps); // Leisten-Toggle in allen Ansichten (Inbox, Suche, Spam, ...)
    if (header) {
      // Self-Healing: Gmail (v. a. im Lesebereich-Modus) tauscht den Thread-DOM aus -
      // haengen Host oder Liste nicht mehr im Dokument, ist der Zustand kaputt -> reset.
      if (state.active && (!state.host?.isConnected || !state.hiddenList?.isConnected)) {
        deactivate();
      }
      // Compose-Mode: INLINE-Editor (Antworten) offen -> unter der Chat-Ansicht einblenden.
      // findInlineComposeBody() stellt sicher, dass das Schreiben-Popup (neue Mail)
      // den Compose-Mode NICHT triggert — es liegt nicht im hiddenList.
      if (state.active && !sendingViaChat) {
        const hasCompose = !!findInlineComposeBody();
        if (hasCompose) {
          setComposeMode(true); // bei jedem Zyklus re-anwenden (Gmail mutiert den DOM)
        } else if (state.composeMode) {
          setComposeMode(false);
          await activate(deps);
          return;
        }
      }
      if (!state.active) {
        const [settings, threadPrefs] = await Promise.all([deps.getSettings(), loadThreadPrefs()]);
        const currThreadId = getThreadId();
        const threadPref = currThreadId ? threadPrefs[currThreadId] : undefined;
        // Priorität: sessionMode (Klick) > Thread-Pref (Storage, pro Mail) > autoActivate (global)
        // Thread-Pref: "immer klassisch" = false, "immer Chat" = true, kein Pref = autoActivate
        const effectiveAuto = threadPref === 'classic' ? false : threadPref === 'chat' ? true : settings.autoActivate;
        const mode = sessionMode ?? effectiveAuto;
        // Doppelte Absicherung nach dem await:
        //   (a) !state.active  - toggle() koennte inzwischen aktiviert haben
        //   (b) !activating    - toggle().activate() laeuft noch
        // Ohne beides: doppelte Aktivierung (Race mit dem MutationObserver-Zyklus).
        if (!state.active && !activating && mode && !findComposeBody() && !activationGaveUp) {
          // activating-Flag auch hier setzen: verhindert Race mit toggle(),
          // falls der Nutzer genau waehrend check()'s activate() klickt.
          activating = true;
          setButtonLoading(true);
          try {
            const ok = await activate(deps);
            if (ok) {
              retryActivationCount = 0; // NASA: Reset nach Erfolg
            } else if (retryActivationCount < MAX_ACTIVATION_RETRIES) {
              // NASA: Redundanter Aktivierungs-Pfad — bounded retry
              // Gmail rendert div.adn manchmal nach check(). Primärer Pfad:
              // gezielter MutationObserver der SOFORT reagiert sobald div.adn erscheint.
              // Sekundärer Pfad: 400ms Safety-Timer als Fallback (falls Observer es verpasst).
              retryActivationCount++;
              log(`autoActivate Retry ${retryActivationCount}/${MAX_ACTIVATION_RETRIES} — warte auf div.adn...`);
              const retryOnce = (): void => {
                retryObs.disconnect();
                if (!state.active && isStillOwner()) scheduleCheck();
              };
              const retryObs = new MutationObserver(() => {
                if (!isStillOwner()) { retryObs.disconnect(); return; }
                if (getMessageNodes().length > 0) retryOnce();
              });
              retryObs.observe(document.body, { childList: true, subtree: true });
              // Safety-Timer: nach 400ms auf jeden Fall versuchen (Observer als Backup)
              setTimeout(retryOnce, 400);
            } else {
              // NASA: Aufgeben statt Reset — verhindert Heartbeat-getriggerte Endlosschleife.
              // Nächster Versuch erst bei Thread-Wechsel (setzt activationGaveUp = false).
              activationGaveUp = true;
              log('autoActivate: maximale Retries erschöpft — warte auf Thread-Wechsel.');
            }
          } finally {
            activating = false;
            setButtonLoading(false);
          }
        }
        await updateButtonLabel(deps);
      }
    }
  };

  // MutationObserver -> scheduleCheck (Single-Flight + 50ms-Debounce)
  const observer = new MutationObserver(scheduleCheck);
  observer.observe(document.body, { childList: true, subtree: true });

  // Keyboard-Shortcut Alt+C
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyC') {
      e.preventDefault();
      void toggle(deps);
    }
  });

  // Bei Settings-Änderung aktive Ansicht neu rendern + Skin aktualisieren.
  // Storage-Event = ein Write ist gelandet → Storage ist wieder Quelle der Wahrheit.
  deps.onSettingsChanged(() => {
    sessionMode = null;
    void deps.getSettings().then((s) => applySkin(s));
    // Nur re-aktivieren wenn wir nicht gerade mitten in toggle()/activate() sind
    if (state.active && !activating) {
      void activate(deps).then(() => updateButtonLabel(deps));
    }
  });

  // Boot-Diagnose: bestaetigt, dass DIESES Bundle wirklich laeuft
  let version = 'dev';
  try {
    version = chrome?.runtime?.getManifest?.().version ?? 'dev';
  } catch {
    /* Kontext ohne chrome-API */
  }

  // ---- Generation-Counter: Distributed Lock gegen mehrere Instanzen --------
  //
  // Problem: Schnelles Klicken / Gmail-interne Neu-Injection koennen dazu
  // fuehren, dass mehrere Content-Script-Instanzen gleichzeitig laufen.
  // Jede hat eigenen state/checking/activating => alle Guards versagen.
  //
  // Loesung: Jede Instanz schreibt eine aufsteigende Nummer ins DOM.
  // Aeltere Instanzen erkennen am naechsten MutationObserver-Tick, dass sie
  // ueberholt wurden, und disconnecten sich graceful.
  // -------------------------------------------------------------------------
  const GEN_KEY = 'chatmailGen';
  const myGen = (parseInt(document.documentElement.dataset[GEN_KEY] ?? '0', 10) || 0) + 1;
  document.documentElement.dataset[GEN_KEY] = String(myGen);

  const isStillOwner = (): boolean =>
    parseInt(document.documentElement.dataset[GEN_KEY] ?? '0', 10) === myGen;

  log(`v${version} Instanz #${myGen} gestartet auf`, location.host);
  // DOM-Marker: per Konsole abfragbar mit
  //   document.documentElement.dataset.mailToChat
  // (funktioniert browserunabhaengig, auch ohne Log-Sichtbarkeit)
  document.documentElement.dataset['mailToChat'] = version;

  // Selbstreinigung: Beim Add-on-Reload bleiben Buttons der ALTEN (toten)
  // Script-Instanz im DOM - deren Klick-Listener sind verwaist. Ohne Aufraeumen
  // wuerde diese Instanz die Injektion ueberspringen (ID existiert ja schon)
  // und der Nutzer klickt ins Leere. Also: alle Reste entfernen, frisch setzen.
  for (const id of [BTN_ID, GROUP_ID, TB_ID, GEAR_ID, 'chatmail-reply-ctx', 'chatmail-ctx-menu']) {
    const orphan = document.getElementById(id);
    if (orphan) {
      orphan.remove();
      log('Verwaisten Button der Vorgaenger-Instanz entfernt:', id);
    }
  }
  document.querySelectorAll(`.${HOST_CLASS}`).forEach((h) => h.remove());

  // NASA: Globale CSS-Keyframes (Puls-Animation für Loading-State) einmalig injizieren
  injectGlobalCss();

  // Gmail-Skin beim Start anwenden
  void deps.getSettings().then((s) => applySkin(s));

  // Settings-Seiten-Klasse bei Gmail-Navigation (Hash-Wechsel) aktualisieren.
  // Gmail nutzt #settings/... Hashes → hashchange feuert zuverlässig bei Settings-Navigation.
  window.addEventListener('hashchange', updateSkinPageClass);

  // NASA: Heartbeat — Dead-man's-switch als letzte Verteidigungslinie.
  // Falls MutationObserver keine Callbacks mehr empfängt (statischer DOM nach dem Rendern),
  // garantiert dieser Timer mindestens alle 3s einen State-Check.
  // BOUNDED: Stoppt automatisch sobald isStillOwner() false wird (ältere Instanz).
  const heartbeat = setInterval(() => {
    if (!isStillOwner()) { clearInterval(heartbeat); return; }
    scheduleCheck();
  }, 3_000);

  // Debug-Handle: in der Browser-Konsole (F12) verfügbar als window.__chatmailDebug
  // Gibt vollen internen Zustand + Log-Ringpuffer aus. Nie in Prod-Logs exponieren.
  type DbgHandle = {
    readonly state: object;
    readonly log: string[];
    dump(): void;
    nodeInfo(): void;
    forceCheck(): void;
    readonly version: string;
  };
  (window as Window & { __chatmailDebug?: DbgHandle }).__chatmailDebug = {
    get state() {
      const tid = getThreadId();
      return {
        active: state.active,
        activating,
        toggling,
        sessionMode,
        threadId: tid,
        lastThreadKey,
        retryActivationCount,
        composeMode: state.composeMode,
        hostConnected: state.host?.isConnected ?? false,
        listConnected: state.hiddenList?.isConnected ?? false,
        generation: myGen,
      };
    },
    get log() {
      const now = Date.now();
      return DEBUG_LOG.map((e, i) => `[${i.toString().padStart(2)}] -${((now - e.t) / 1000).toFixed(1)}s  ${e.msg}`);
    },
    dump() {
      console.group('[Mail to Chat] Debug Dump');
      console.log('Version:', version, '· Instanz #' + String(myGen));
      console.table(DEBUG_LOG.map((e) => ({ ago: `-${((Date.now() - e.t) / 1000).toFixed(1)}s`, msg: e.msg })));
      console.log('State:', { ...this.state });
      console.groupEnd();
    },
    nodeInfo() {
      // Zeigt exakt welche div.adn im DOM vorhanden sind und ob Gmail ihre Bodies geladen hat.
      // Aufruf: F12 → Console → Kontext-Dropdown → Extension-Context → __chatmailDebug.nodeInfo()
      const all = Array.from(document.querySelectorAll<HTMLElement>('div.adn'));
      const vis = all.filter(isVisible);
      const tl = vis[0]?.closest<HTMLElement>('[role="list"]');
      const inTl = tl ? Array.from(tl.querySelectorAll<HTMLElement>('div.adn')) : vis;
      console.group('[Mail to Chat] nodeInfo()');
      console.log(
        `div.adn gesamt im DOM: ${all.length}`,
        `| sichtbar: ${vis.length}`,
        `| im Thread-Container: ${inTl.length}`,
      );
      console.table(
        inTl.map((n, i) => {
          const a3s = n.querySelector('div.a3s');
          const iiGt = n.querySelector('div.ii.gt');
          const sd = n.querySelector('span.gD');
          return {
            '#': i,
            sender: sd?.getAttribute('name') ?? sd?.textContent?.trim() ?? '?',
            visible: isVisible(n),
            a3s_vorhanden: !!a3s,
            a3s_zeichen: a3s?.textContent?.trim().length ?? 0,
            iiGt_zeichen: iiGt?.textContent?.trim().length ?? 0,
          };
        }),
      );
      console.groupEnd();
    },
    forceCheck() { log('forceCheck() via Debug-Handle'); scheduleCheck(); },
    version,
  };
  // Debug-Handle: nur in der Isolated World zugänglich.
  // DevTools-Zugriff: F12 → Console → Kontext-Dropdown (oben, zeigt "top") →
  // Extension-Context auswählen → window.__chatmailDebug.dump()
  // KEIN inline-Script-Bridge: Gmail's CSP (script-src 'self', kein unsafe-inline)
  // blockiert das Injizieren von <script textContent="..."> in den Page-DOM.
  log('Debug-Handle: F12 → Kontext → Extension → window.__chatmailDebug.dump()');

  // Erster Lauf ueber runCheck (nicht direkt check()) damit der Single-Flight-
  // Guard von Anfang an gilt.
  void runCheck();
}
