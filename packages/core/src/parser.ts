import { isMetaLine, parseMetaLine } from './metalines';
import { splitSignature } from './signature';
import type { Attachment, MessageObject, ParseOptions, Sender } from './types';

/**
 * chatmail-core Parser.
 * Input:  roher HTML/Text-String eines Mail-Threads
 * Output: MessageObject[] in chronologischer Reihenfolge (älteste zuerst)
 */

const ATTACHMENT_EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|csv|txt|ics|eml)(\?|#|$)/i;

function getDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function sanitize(root: Element): void {
  root.querySelectorAll('script, style, link, meta, iframe, object, embed').forEach((n) => n.remove());
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      if (attr.name === 'href' && /^javascript:/i.test(attr.value)) el.removeAttribute('href');
    }
  });
}

function extractAttachments(root: Element): Attachment[] {
  const out: Attachment[] = [];
  // WICHTIG: Inline-Bilder werden NICHT als Anhänge extrahiert - sie sind
  // bereits in der Bubble sichtbar (und Lightbox-klickbar). Newsletter mit
  // vielen Layout-Bildern erzeugten sonst eine Duplikat-Galerie unter der Mail.
  // Echte Anhänge liefern die Anhang-Karten des Mail-Clients (Adapter).
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (ATTACHMENT_EXT_RE.test(href)) {
      out.push({ kind: 'file', name: a.textContent?.trim() || href.split('/').pop() || 'Datei', url: href });
    }
  });
  return out;
}

/**
 * Findet die äußerste Zitat-Grenze in einem Container.
 * Einzelne Top-Down-Traversierung, steigt nicht in blockquotes hinab - O(Ebenengröße).
 */
function findQuoteBoundary(container: Element): { quote: Element; meta?: Element } | null {
  const walk = (el: Element): Element | null => {
    for (const child of Array.from(el.children)) {
      // Gmail: <div class="gmail_quote"><div class="gmail_attr">Metazeile</div><blockquote>…</blockquote></div>
      if (child.tagName === 'DIV' && child.classList.contains('gmail_quote')) {
        if (child.querySelector('blockquote')) return child;
      }
      if (child.tagName === 'BLOCKQUOTE') return child;
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };

  const boundary = walk(container);
  if (!boundary) return null;

  if (boundary.tagName !== 'BLOCKQUOTE') {
    // Gmail-Variante: Metazeile steckt als .gmail_attr im Quote-Container
    return { quote: boundary, meta: boundary.querySelector('.gmail_attr') ?? undefined };
  }

  // Generisches blockquote: Metazeile in vorhergehenden Geschwister-Elementen suchen
  let meta: Element | undefined;
  let prev: Element | null = boundary.previousElementSibling;
  let hops = 0;
  while (prev && hops < 4) {
    const text = prev.textContent?.trim() ?? '';
    if (text && isMetaLine(text)) {
      meta = prev;
      break;
    }
    if (text.length > 0) break; // anderer Inhalt dazwischen → keine Metazeile
    prev = prev.previousElementSibling;
    hops++;
  }
  return { quote: boundary, meta };
}

/** Alle Text-Nodes vor einem Stop-Element einsammeln (Dokumentreihenfolge). */
function textNodesBefore(root: Node, stopEl: Node): Text[] {
  const out: Text[] = [];
  let stopped = false;
  const walk = (n: Node): void => {
    if (stopped || n === stopEl) {
      stopped = true;
      return;
    }
    if (n.nodeType === 3) out.push(n as Text);
    n.childNodes.forEach((c) => {
      if (!stopped) walk(c);
    });
  };
  walk(root);
  return out;
}

/**
 * Gmail packt die Metazeile ("Am … schrieb …:") manchmal in DENSELBEN Textblock
 * wie den Nachrichtentext statt in ein eigenes Element. Dann: letzte Metazeilen-
 * Textnode vor dem Zitat finden, parsen und aus dem Body entfernen - sonst
 * leakt sie in die Bubble und der zitierte Absender wird "Unbekannt".
 */
function extractInlineMeta(container: Element, quote: Element): ReturnType<typeof parseMetaLine> | null {
  const nodes = textNodesBefore(container, quote);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i] as Text;
    const text = node.textContent?.trim() ?? '';
    if (!text) continue;
    if (isMetaLine(text)) {
      node.textContent = '';
      return parseMetaLine(text);
    }
    return null; // letzte nicht-leere Textzeile ist keine Metazeile → nichts zu tun
  }
  return null;
}

interface RawMessage {
  sender: Sender;
  timestamp?: string;
  contentEl: Element;
}

/**
 * Zerlegt den HTML-Baum rekursiv in Nachrichten-Ebenen (neueste zuerst).
 * Destruktiv (arbeitet auf dem eigenen, frisch geparsten Document) - O(n).
 */
function splitLevels(container: Element, fallbackSender: Sender): RawMessage[] {
  const boundary = findQuoteBoundary(container);
  if (!boundary) {
    return [{ sender: fallbackSender, contentEl: container }];
  }

  const { quote, meta } = boundary;
  const metaText = meta?.textContent?.trim() ?? '';
  let parsedMeta = metaText && isMetaLine(metaText) ? parseMetaLine(metaText) : null;
  // Fallback: Metazeile steckt im selben Textblock wie der Nachrichtentext
  if (!parsedMeta) parsedMeta = extractInlineMeta(container, quote);

  // Zitierter Inhalt: das innere blockquote der Grenze
  const innerQuote = quote.tagName === 'BLOCKQUOTE' ? quote : quote.querySelector('blockquote');

  // Zitat-Block + Metazeile aus dieser Ebene herauslösen
  quote.remove();
  meta?.remove();

  // Cleanup: verbleibende Meta-Zeilen-Elemente im Container entfernen.
  // Tritt auf wenn die Meta-Zeile SOWOHL in .gmail_attr (innerhalb .gmail_quote,
  // bereits via quote.remove() entfernt) als AUCH als eigenständiges Element
  // AUSSERHALB des Quote-Wrappers vorkommt — verursacht durch unterschiedliche
  // E-Mail-Clients oder verschachtelte Weiterleitungs-Strukturen. Ohne diesen
  // Cleanup erscheint "Am ... schrieb ...:" als eigenständige Bubble.
  for (const child of Array.from(container.children)) {
    const t = ((child as Element).textContent ?? '').trim().replace(/\s+/g, ' ');
    if (t && t.length <= 300 && isMetaLine(t)) (child as Element).remove();
  }

  const quotedSender: Sender = parsedMeta?.sender ?? { name: 'Unbekannt' };
  const deeper = innerQuote ? splitLevels(innerQuote, quotedSender) : [];
  if (deeper[0] && parsedMeta) {
    deeper[0] = { ...deeper[0], timestamp: deeper[0].timestamp ?? parsedMeta.timestamp };
  }

  return [{ sender: fallbackSender, contentEl: container }, ...deeper];
}

function htmlToText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  clone.querySelectorAll('p, div, li, tr').forEach((b) => b.append('\n'));
  return (clone.textContent ?? '').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function isOwnMessage(sender: Sender, opts: ParseOptions): boolean {
  const emails = (opts.ownEmails ?? []).map((e) => e.toLowerCase().trim());
  if (sender.email && emails.includes(sender.email.toLowerCase())) return true;
  if (opts.ownName && sender.name && sender.name.toLowerCase() === opts.ownName.toLowerCase()) return true;
  return false;
}

function buildMessage(raw: RawMessage, opts: ParseOptions): MessageObject {
  sanitize(raw.contentEl);
  const attachments = extractAttachments(raw.contentEl);
  const fullText = htmlToText(raw.contentEl);

  let bodyText = fullText;
  let signatureHtml: string | undefined;
  if (opts.filterSignatures !== false) {
    const { body, signature } = splitSignature(fullText);
    // Signature-Split nur übernehmen wenn noch ein sinnvoller Body übrig bleibt.
    // Wenn der gesamte Text als Signatur erkannt wird (z. B. Google-Notifications
    // mit Footer-artiger Struktur), den Split verwerfen — besser alles zeigen als
    // eine leere Bubble mit kollabierter "Signatur anzeigen".
    if (body.trim()) {
      bodyText = body;
      if (signature) signatureHtml = escapeHtml(signature).replace(/\n/g, '<br>');
    }
  }

  const rawBodyHtml = raw.contentEl.innerHTML.trim();
  const textBodyHtml = bodyText ? escapeHtml(bodyText).replace(/\n/g, '<br>') : '';

  return {
    sender: raw.sender,
    timestamp: raw.timestamp,
    // bodyHtml: wenn Signatur vorhanden → Text-Modus (ohne Sig); wenn rawHtml leer →
    // Text-Fallback; wenn beides leer → leerer String (filter entfernt die Message).
    bodyHtml: signatureHtml
      ? (textBodyHtml || rawBodyHtml)
      : (rawBodyHtml || textBodyHtml),
    bodyText,
    signatureHtml,
    attachments,
    isOwn: isOwnMessage(raw.sender, opts),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain-Text-Threads: Zerlegung anhand von ">"-Ebenen und Metazeilen. */
export function parseTextThread(text: string, opts: ParseOptions = {}): MessageObject[] {
  const lines = text.split(/\r?\n/);
  const levels: { meta?: string; lines: string[] }[] = [{ lines: [] }];

  for (const line of lines) {
    const depthMatch = line.match(/^((?:>\s?)+)/);
    const depth = depthMatch ? (depthMatch[1] ?? '').replace(/\s/g, '').length : 0;
    const content = line.replace(/^(?:>\s?)+/, '');
    while (levels.length <= depth) levels.push({ lines: [] });
    const lvl = levels[depth];
    if (!lvl) continue;
    if (isMetaLine(content, opts.languages) && lvl.lines.every((l) => !l.trim())) {
      // Metazeile am Anfang einer Ebene gehört zur nächsttieferen Nachricht
      while (levels.length <= depth + 1) levels.push({ lines: [] });
      const next = levels[depth + 1];
      if (next) next.meta = content;
      continue;
    }
    if (isMetaLine(content, opts.languages)) {
      while (levels.length <= depth + 1) levels.push({ lines: [] });
      const next = levels[depth + 1];
      if (next && !next.meta) next.meta = content;
      continue;
    }
    lvl.lines.push(content);
  }

  const messages: MessageObject[] = [];
  for (let depth = levels.length - 1; depth >= 0; depth--) {
    const lvl = levels[depth];
    if (!lvl) continue;
    const text2 = lvl.lines.join('\n').trim();
    if (!text2 && !lvl.meta) continue;
    const metaParsed = lvl.meta ? parseMetaLine(lvl.meta) : null;
    const sender: Sender = metaParsed?.sender ?? (depth === 0 ? { name: opts.ownName ?? 'Ich' } : { name: 'Unbekannt' });

    let bodyText = text2;
    let signatureHtml: string | undefined;
    if (opts.filterSignatures !== false) {
      const { body, signature } = splitSignature(text2);
      bodyText = body;
      if (signature) signatureHtml = escapeHtml(signature).replace(/\n/g, '<br>');
    }
    if (!bodyText.trim() && !signatureHtml) continue;

    messages.push({
      sender,
      timestamp: metaParsed?.timestamp,
      bodyHtml: escapeHtml(bodyText).replace(/\n/g, '<br>'),
      bodyText,
      signatureHtml,
      attachments: [],
      isOwn: depth === 0 ? true : isOwnMessage(sender, opts),
    });
  }
  return messages;
}

/**
 * Haupteinstieg: zerlegt einen Mail-Thread (HTML oder Plain Text) in Nachrichten.
 * Reihenfolge: chronologisch, älteste zuerst.
 */
export function parseThread(html: string, opts: ParseOptions = {}): MessageObject[] {
  // Echte HTML-Tags erkennen - "<max@y.de>" in Plain Text darf nicht als HTML zählen
  const looksLikeHtml =
    /<\/?(div|p|br|blockquote|span|a|table|tr|td|img|html|body|b|i|u|strong|em|ul|ol|li|h[1-6]|pre|font)[\s/>]/i.test(
      html,
    );
  if (!looksLikeHtml) {
    return parseTextThread(html, opts);
  }
  const doc = getDoc(html);
  const root = doc.body;
  const newestSender: Sender = { name: opts.ownName ?? 'Ich', email: opts.ownEmails?.[0] };
  const raws = splitLevels(root, newestSender); // neueste zuerst
  const messages = raws
    .map((r) => buildMessage(r, opts))
    .filter((m) => m.bodyText.trim().length > 0 || m.attachments.length > 0 || m.signatureHtml);
  messages.reverse(); // chronologisch: älteste zuerst
  // Die neueste (zuletzt) ist die äußere Nachricht - isOwn nur, wenn Sender passt oder kein Meta vorhanden war
  return messages;
}
