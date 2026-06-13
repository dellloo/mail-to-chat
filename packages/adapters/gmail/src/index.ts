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
  /** Öffnet die Options Page der Extension (via Background Worker). Nicht mehr in Gmail injiziert, aber für externe Aufrufer verfügbar. */
  openSettings?: () => void;
  /** @deprecated Wird seit v1.0.9 nicht mehr intern genutzt – Chat-Mode nur noch über Storage (autoActivate). */
  setAutoActivate?: (on: boolean) => void;
}

/** Diagnose-Log: macht in der Browser-Konsole sichtbar, welche Station laeuft. */
function log(...args: unknown[]): void {
  // console.log statt .info: die Info-Stufe ist in manchen Konsolen ausgeblendet
  console.log('[Mail to Chat]', ...args);
}

const HOST_CLASS = 'chatmail-host';

const LABELS = {
  de: { toChat: 'Chat-Ansicht', toClassic: 'Klassisch', replyCtx: 'Antwort auf', forwardCtx: 'Weiterleiten' },
  en: { toChat: 'Chat view', toClassic: 'Classic', replyCtx: 'Replying to', forwardCtx: 'Forwarding' },
};

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
      const hasEditor = li.querySelector('[g_editable="true"], [contenteditable="true"]');
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
  // Nur SICHTBARE Nachrichten: im Lesebereich-Modus (geteilte Ansicht) behält
  // Gmail alte Thread-DOMs unsichtbar im Hintergrund - die dürfen nicht reinrutschen.
  return Array.from(document.querySelectorAll<HTMLElement>('div.adn')).filter(isVisible);
}

function extractFromNode(
  node: HTMLElement,
  ownEmails: string[],
  ownNames: string[],
  settings: ChatSettings,
): MessageObject | null {
  const senderEl = node.querySelector('span.gD');
  const body = node.querySelector<HTMLElement>('div.a3s');
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

function buildThreadMessages(settings: ChatSettings): MessageObject[] {
  const account = detectAccount();
  const ownEmails = [...settings.ownEmails];
  if (account.email && !ownEmails.includes(account.email)) ownEmails.push(account.email);
  const ownNames = [settings.ownName, account.name].filter((n): n is string => !!n && n.trim().length > 0);

  const nodes = getMessageNodes();
  if (nodes.length === 0) return [];

  // Quelle 1: alle aufgeklappten Mails aus dem DOM
  const domMsgs = nodes
    .map((n) => extractFromNode(n, ownEmails, ownNames, settings))
    .filter((m): m is MessageObject => m !== null);

  // Quelle 2: komplette Zitat-Historie aus der NEUESTEN Mail
  const newest = nodes[nodes.length - 1] as HTMLElement;
  const body = newest.querySelector<HTMLElement>('div.a3s');
  let quoteMsgs: MessageObject[] = [];
  if (body) {
    quoteMsgs = parseThread(body.innerHTML, {
      ownEmails,
      ownName: ownNames[0],
      languages: settings.languages,
      filterSignatures: settings.filterSignatures,
    });
    for (const m of quoteMsgs) {
      if (!m.isOwn) m.isOwn = isOwnSender(m.sender, ownEmails, ownNames);
    }
  }

  // Cache-Anhaenge wieder anheften (eingeklappte Mails) + Reply-Kontext bereinigen
  return pruneRedundantReplyTo(
    applyCachedAttachments(mergeThreadMessages(domMsgs, quoteMsgs), loadAttCache()),
  );
}

function findListContainer(): HTMLElement | null {
  const nodes = getMessageNodes();
  const last = nodes[nodes.length - 1];
  return (last?.closest('div[role="list"]') as HTMLElement | null) ?? null;
}

/* ---------- Direkt antworten (steuert Gmails eigenen Editor fern) ---------- */

/** Flag: wir senden gerade selbst - Auto-Deactivate darf nicht greifen. */
let sendingViaChat = false;

// Verhindert Doppel-Aktivierung: check() prueft dieses Flag, bevor es activate() ruft.
// Ohne Guard loest die DOM-Mutation aus activate() via MutationObserver einen
// zweiten activate()-Aufruf aus, waehrend der erste noch laeuft.
let activating = false;

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
  const messages = buildThreadMessages(settings);
  if (messages.length === 0) {
    log('Aktivierung abgebrochen: 0 sichtbare Nachrichten gefunden (div.adn).');
    return false;
  }
  const list = findListContainer();
  if (!list || !list.parentElement) {
    log('Aktivierung abgebrochen: Nachrichten-Container (div[role=list]) nicht gefunden.');
    return false;
  }
  log('Aktiviere Chat-Ansicht:', messages.length, 'Nachrichten.');

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
  list.parentElement.insertBefore(host, list);
  list.style.display = 'none';
  // Messenger-Verhalten: unten (neueste Nachricht) starten, nicht oben
  requestAnimationFrame(() => {
    state.host?.scrollIntoView({ block: 'end' });
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
  return true;
}

const GEAR_ID = 'chatmail-settings-btn';

/**
 * Kleiner Einstellungs-Button in Gmails Toolbar.
 * Kein Toggle mehr — nur schneller Zugriff auf die Settings-Seite.
 * Wird nur angezeigt wenn ein Mail-Thread offen ist.
 */
function injectSettingsButton(deps: AdapterDeps): void {
  if (!deps.openSettings) return;
  const toolbar = Array.from(document.querySelectorAll<HTMLElement>('div[gh="mtb"]')).find(isVisible);
  let gear = document.getElementById(GEAR_ID) as HTMLButtonElement | null;
  if (!toolbar) {
    if (gear) gear.style.display = 'none';
    return;
  }
  const hasMail = !!findThreadHeader();
  if (!gear) {
    if (getComputedStyle(toolbar).position === 'static') toolbar.style.position = 'relative';
    gear = document.createElement('button');
    gear.id = GEAR_ID;
    gear.type = 'button';
    gear.title = 'Mail to Chat – Einstellungen';
    gear.innerHTML = ICONS.gear;
    gear.style.cssText = [
      'position:absolute', 'top:50%', 'transform:translateY(-50%)',
      'right:12px', 'z-index:9',
      'width:28px', 'height:28px', 'border-radius:50%', 'border:none',
      'background:rgba(128,128,128,0.14)', 'color:inherit', 'font-size:14px',
      'cursor:pointer', 'display:inline-flex', 'align-items:center',
      'justify-content:center', 'flex-shrink:0',
      'transition:background 0.15s,transform 0.15s',
      'opacity:0.7',
    ].join(';');
    gear.addEventListener('mouseenter', () => {
      gear!.style.background = 'rgba(128,128,128,0.28)';
      gear!.style.opacity = '1';
    });
    gear.addEventListener('mouseleave', () => {
      gear!.style.background = 'rgba(128,128,128,0.14)';
      gear!.style.opacity = '0.7';
    });
    gear.addEventListener('click', () => deps.openSettings?.());
    toolbar.appendChild(gear);
  }
  if (gear.parentElement !== toolbar) toolbar.appendChild(gear);
  gear.style.display = hasMail ? 'inline-flex' : 'none';
}


/** Einstieg: beobachtet Gmail (SPA) und verdrahtet Button + Shortcut. */
export function initGmailAdapter(deps: AdapterDeps): void {
  let lastThreadKey = '';

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
      // Threadwechsel: Chat-View des alten Threads verwerfen
      lastThreadKey = key;
      deactivate();
    }
    injectSettingsButton(deps); // Zahnrad in Toolbar (nur bei offenem Thread sichtbar)
    if (!header) return;

    // Self-Healing: Gmail (v. a. im Lesebereich-Modus) tauscht den Thread-DOM aus -
    // haengen Host oder Liste nicht mehr im Dokument, ist der Zustand kaputt -> reset.
    if (state.active && (!state.host?.isConnected || !state.hiddenList?.isConnected)) {
      deactivate();
    }

    // Compose-Mode: Editor offen -> unter der Chat-Ansicht einblenden
    // (Chat bleibt oben). Editor zu -> Liste wieder verstecken + Chat
    // aktualisieren (gesendete Antwort einlesen).
    if (state.active && !sendingViaChat) {
      const hasCompose = !!findComposeBody();
      if (hasCompose) {
        setComposeMode(true); // bei jedem Zyklus re-anwenden (Gmail mutiert den DOM)
      } else if (state.composeMode) {
        setComposeMode(false);
        await activate(deps);
        return;
      }
    }

    // Auto-Aktivierung: immer Chat-View wenn autoActivate aktiv.
    // Kein sessionMode-Override mehr - Storage ist die einzige Quelle der Wahrheit.
    if (!state.active && !activating) {
      const settings = await deps.getSettings();
      // Doppelte Absicherung nach dem await (state/activating koennten sich geaendert haben)
      if (!state.active && !activating && settings.autoActivate && !findComposeBody()) {
        activating = true;
        try {
          await activate(deps);
        } finally {
          activating = false;
        }
      }
    }
  };

  // MutationObserver -> scheduleCheck (Single-Flight + 50ms-Debounce)
  const observer = new MutationObserver(scheduleCheck);
  observer.observe(document.body, { childList: true, subtree: true });

  // Bei Settings-Änderung: Skin aktualisieren + Chat-View reagieren.
  // autoActivate=false → sofort deaktivieren.
  // autoActivate=true  → check() übernimmt Aktivierung beim nächsten Tick.
  deps.onSettingsChanged(() => {
    void deps.getSettings().then((s) => {
      applySkin(s);
      if (!s.autoActivate && state.active) {
        // Nutzer hat Chat-Mode in den Einstellungen deaktiviert
        deactivate();
      } else if (s.autoActivate && state.active && !activating) {
        // Einstellungen geändert (Theme/Farben) → neu rendern
        void activate(deps);
      }
      // autoActivate=true && !state.active → check() aktiviert automatisch
    });
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

  // Selbstreinigung: DOM-Reste älterer Instanzen / Versionen entfernen
  // (v1.0.0-v1.0.8 hatte noch Toolbar-Buttons; die IDs hier als Strings damit
  //  keine Compile-Abhängigkeit auf entfernte Konstanten entsteht)
  for (const id of [
    'chatmail-tb-group', 'chatmail-toggle-tb',
    'chatmail-toggle-btn', 'chatmail-reply-ctx',
    GEAR_ID, // Zahnrad aus alten Instanzen entfernen, frisch setzen
  ]) {
    const orphan = document.getElementById(id);
    if (orphan) {
      orphan.remove();
      log('Verwaistes Element der Vorgaenger-Instanz entfernt:', id);
    }
  }
  document.querySelectorAll(`.${HOST_CLASS}`).forEach((h) => h.remove());

  // Gmail-Skin beim Start anwenden
  void deps.getSettings().then((s) => applySkin(s));

  // Settings-Seiten-Klasse bei Gmail-Navigation (Hash-Wechsel) aktualisieren.
  // Gmail nutzt #settings/... Hashes → hashchange feuert zuverlässig bei Settings-Navigation.
  window.addEventListener('hashchange', updateSkinPageClass);
  // Erster Lauf ueber runCheck (nicht direkt check()) damit der Single-Flight-
  // Guard von Anfang an gilt.
  void runCheck();
}
