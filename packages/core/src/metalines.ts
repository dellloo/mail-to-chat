import type { ParserLanguage, Sender } from './types';

/**
 * Metazeilen-Erkennung: "On ... wrote:", "Am ... schrieb ...:" usw.
 * Mehrsprachig, konfigurierbar.
 */

const PATTERNS: Record<ParserLanguage, RegExp> = {
  en: /^On\s.{1,120}?\bwrote:?\s*$/i,
  de: /^Am\s.{1,120}?\bschrieb\s.{1,160}?:\s*$/i,
  fr: /^Le\s.{1,160}?\ba\s+écrit\s*:\s*$/i,
  es: /^El\s.{1,160}?\bescribió\s*:\s*$/i,
  it: /^Il\s.{1,160}?\bha\s+scritto\s*:\s*$/i,
};

const ALL_LANGS: ParserLanguage[] = ['de', 'en', 'fr', 'es', 'it'];

const EMAIL_RE = /<\s*([^<>\s]+@[^<>\s]+\.[^<>\s]+)\s*>|\b([^\s<>]+@[^\s<>]+\.[a-z]{2,})\b/i;

export function isMetaLine(line: string, languages?: ParserLanguage[]): boolean {
  const langs = languages?.length ? languages : ALL_LANGS;
  const trimmed = line.trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed.length > 300) return false;
  return langs.some((l) => PATTERNS[l].test(trimmed));
}

/**
 * Extrahiert Sender (Name + E-Mail) und Zeitstempel aus einer Metazeile.
 * Beispiele:
 *  "On Mon, Jun 1, 2026 at 9:14 AM Jane Doe <jane@x.com> wrote:"
 *  "Am 01.06.2026 um 09:14 schrieb Max Mustermann <max@y.de>:"
 */
export function parseMetaLine(line: string): { sender: Sender; timestamp?: string } {
  const trimmed = line.trim().replace(/\s+/g, ' ');
  const emailMatch = trimmed.match(EMAIL_RE);
  const email = emailMatch ? (emailMatch[1] ?? emailMatch[2]) : undefined;

  let name = '';
  let timestamp: string | undefined;

  // Deutsch: alles nach "schrieb" ist der Name, alles davor (nach "Am") der Zeitpunkt.
  const de = trimmed.match(/^Am\s+(.+?)\s+schrieb\s+(.+?):\s*$/i);
  // Englisch: "On <datum> <name> wrote:" - Name ist der Teil vor "wrote".
  const en = trimmed.match(/^On\s+(.+?)\s+wrote:?\s*$/i);
  // FR/ES/IT: "Le <datum>, <name> a écrit :" etc.
  const fr = trimmed.match(/^Le\s+(.+?)\s+a\s+écrit\s*:\s*$/i);
  const es = trimmed.match(/^El\s+(.+?)\s+escribió\s*:\s*$/i);
  const it = trimmed.match(/^Il\s+(.+?)\s+ha\s+scritto\s*:\s*$/i);

  if (de) {
    timestamp = de[1];
    name = de[2] ?? '';
  } else {
    const m = en ?? fr ?? es ?? it;
    if (m && m[1]) {
      // Heuristik: E-Mail/Name stehen am Ende, Datum am Anfang.
      let rest = m[1];
      if (email) rest = rest.replace(EMAIL_RE, '').trim();
      // Letztes Komma trennt häufig Datum von Name ("Mon, Jun 1, 2026 at 9:14 AM Jane Doe")
      const atSplit = rest.split(/\s+at\s+|\sà\s|\sum\s/i);
      if (atSplit.length > 1) {
        // Teil nach der Uhrzeit: " 9:14 AM Jane Doe" → Name = Nicht-Datums-Rest
        const tail = atSplit[atSplit.length - 1] ?? '';
        const nameMatch = tail.match(/(?:\d{1,2}[:.]\d{2}(?:\s*[AP]M)?\s+)(.+)$/i);
        name = nameMatch?.[1]?.trim() ?? '';
        timestamp = rest.slice(0, rest.length - name.length).trim().replace(/[,\s]+$/, '');
      } else {
        timestamp = rest;
      }
    }
  }

  // E-Mail aus dem Anzeigenamen entfernen ("Max <max@y.de>" → "Max")
  name = name
    .replace(EMAIL_RE, '')
    .replace(/[<>"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name && email) name = email.split('@')[0] ?? email;

  return { sender: { name: name || 'Unbekannt', email }, timestamp };
}
