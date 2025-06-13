/**
 * Robustes Parsen der Mail-Zeitstempel (locale-Strings aus Gmail & Metazeilen).
 * Gibt null zurück, wenn kein Datum erkennbar - Anzeige degradiert dann sanft
 * (kein Trenner statt falscher Trenner).
 */

const MONTHS_DE: Record<string, number> = {
  januar: 0, februar: 1, märz: 2, april: 3, mai: 4, juni: 5,
  juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11,
};
const MONTHS_EN: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function valid(y: number, mo: number, d: number): Date | null {
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const date = new Date(y, mo, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DE_MONTH_RE = '(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)';
const EN_MONTH_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)';

export function parseMailDate(ts?: string, now: Date = new Date()): Date | null {
  if (!ts) return null;
  const s = ts.trim();
  const lower = s.toLowerCase();

  // 10.06.2026 / 10.06.26
  let m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return valid(y, Number(m[2]) - 1, Number(m[1]));
  }

  // "10. Juni 2026"
  m = lower.match(new RegExp(`(\\d{1,2})\\.?\\s+${DE_MONTH_RE}\\s+(\\d{4})`));
  if (m) return valid(Number(m[3]), MONTHS_DE[m[2] as string] ?? -1, Number(m[1]));

  // "Jun 1, 2026"
  m = lower.match(new RegExp(`\\b${EN_MONTH_RE}[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})`));
  if (m) return valid(Number(m[3]), MONTHS_EN[m[1] as string] ?? -1, Number(m[2]));

  // "1 Jun 2026"
  m = lower.match(new RegExp(`\\b(\\d{1,2})\\.?\\s+${EN_MONTH_RE}[a-z]*\\.?\\s+(\\d{4})`));
  if (m) return valid(Number(m[3]), MONTHS_EN[m[2] as string] ?? -1, Number(m[1]));

  // Gmail lässt das Jahr im AKTUELLEN Jahr weg: "Mi., 10. Juni, 01:23" / "Jun 10"
  m = lower.match(new RegExp(`(\\d{1,2})\\.?\\s+${DE_MONTH_RE}`));
  if (m) return valid(now.getFullYear(), MONTHS_DE[m[2] as string] ?? -1, Number(m[1]));
  m = lower.match(new RegExp(`\\b${EN_MONTH_RE}[a-z]*\\.?\\s+(\\d{1,2})\\b`));
  if (m) return valid(now.getFullYear(), MONTHS_EN[m[1] as string] ?? -1, Number(m[2]));
  m = lower.match(new RegExp(`\\b(\\d{1,2})\\.?\\s+${EN_MONTH_RE}[a-z]*\\b`));
  if (m) return valid(now.getFullYear(), MONTHS_EN[m[2] as string] ?? -1, Number(m[1]));

  // Fallback: nativer Parser (ohne deutsche Füllwörter)
  const t = Date.parse(s.replace(/\b(um|Uhr)\b/gi, '').trim());
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  // V8-Quirk: fehlt das Jahr im String, setzt Date.parse stillschweigend 2001.
  // Dann (und nur dann, wenn der String wirklich kein Jahr enthält): aktuelles Jahr.
  if (d.getFullYear() < 2005 && !/\b(19|20)\d{2}\b/.test(s)) {
    d.setFullYear(now.getFullYear());
  }
  return d.getFullYear() >= 1995 && d.getFullYear() <= 2100 ? d : null;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(d: Date, lang: 'de' | 'en', now: Date = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diff === 0) return lang === 'de' ? 'Heute' : 'Today';
  if (diff === 1) return lang === 'de' ? 'Gestern' : 'Yesterday';
  return that.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
