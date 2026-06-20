/**
 * Signatur-Erkennung: Trennzeichen, Kontaktdaten-Heuristik, Disclaimer-Phrasen.
 * Arbeitet auf der Textfassung; gibt den Index der Zeile zurück, ab der die
 * Signatur beginnt (oder -1).
 */

// Hinweis: Das Em-Dash hier ist FUNKTIONAL (gaengiger Signatur-Trenner in
// Mails), kein Stilmittel - es muss im Pattern bleiben.
const DELIMITER_RE = /^\s*(--+|—|__+|\*\*\*+)\s*$/;

const PHONE_FAX_RE = /\b(tel|phone|fon|fax|mobil|mobile|cell)\b\s*[.:]/i;

const DISCLAIMER_PHRASES = [
  'this e-mail and any attachments',
  'this email and any attachments',
  'diese e-mail enthält vertrauliche',
  'der inhalt dieser e-mail ist vertraulich',
  'if you are not the intended recipient',
  'sollten sie nicht der richtige adressat sein',
  'confidentiality notice',
  'sent from my iphone',
  'von meinem iphone gesendet',
  'gesendet mit',
];

const CLOSING_RE =
  /^\s*(mit freundlichen grüßen|viele grüße|beste grüße|liebe grüße|freundliche grüße|best regards|kind regards|regards|cheers|cordialement|saludos|cordiali saluti)\s*,?\s*$/i;

/** Marker, die eine echte (lange) Signatur kennzeichnen: Kontaktdaten, Firmen-/Rechtsangaben. */
const SIG_CONTENT_RE =
  /@|vereinsregister|ust-?id|umsatzsteuer|gmbh|\be\.?\s?v\.?\b|\bag\b|str\.|stra[ßs]e|\bvorstand\b|gesch[äa]ftsf[üu]hr|tel\b|fax\b|mobil\b/i;

export function findSignatureStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (DELIMITER_RE.test(line)) return i;
    const lower = line.toLowerCase();
    if (DISCLAIMER_PHRASES.some((p) => lower.includes(p))) return i;
    // Grußformel auf eigener Zeile = Signaturbeginn — ABER nur bei einer echten, längeren
    // Signatur (Name + Adresse + Kontakt + Rechtstext). So werden lange Firmen-Signaturen
    // VOLLSTÄNDIG eingeklappt (früher scheiterte die <=8-Zeilen-Heuristik daran), während ein
    // kurzer persönlicher Gruß ("Liebe Grüße, Lorenzo") sichtbar im Body bleibt.
    if (CLOSING_RE.test(line) && i > 0) {
      const rest = lines.slice(i + 1).filter((l) => l.trim().length > 0);
      const substantial = rest.length >= 3 || rest.some((l) => PHONE_FAX_RE.test(l) || SIG_CONTENT_RE.test(l));
      if (substantial) return i;
    }
  }
  return -1;
}

/** Trennt Body und Signatur einer Text-Nachricht. */
export function splitSignature(text: string): { body: string; signature?: string } {
  const lines = text.split('\n');
  const idx = findSignatureStart(lines);
  if (idx < 0) return { body: text };
  return {
    body: lines.slice(0, idx).join('\n').replace(/\s+$/, ''),
    signature: lines.slice(idx).join('\n').trim() || undefined,
  };
}
