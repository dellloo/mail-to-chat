/**
 * Erkennung weitergeleiteter Nachrichten (Forwards).
 *
 * Anders als Antwort-Zitate (blockquote) haben Weiterleitungen oft KEINE HTML-Struktur:
 * der Marker ("Anfang der weitergeleiteten Nachricht:", "---------- Forwarded message ----------"
 * usw.) und der weitergeleitete Inhalt stehen als flacher Text mit <br> im selben Block.
 * Diese Erkennung arbeitet daher rein textbasiert und mehrsprachig — bombenfest gegen
 * Gmail-/Apple-/Outlook-Varianten in DE/EN/FR/ES/IT.
 */

/** Marker-Zeilen, die den Beginn einer weitergeleiteten / ursprünglichen Nachricht anzeigen. */
const FORWARD_MARKERS: RegExp[] = [
  // Gmail-Stil: "---------- Weitergeleitete Nachricht / Forwarded message ----------"
  /^[-—_]{2,}\s*(?:weitergeleitete?\s+(?:nachricht|e-?mail)|forwarded\s+message|message\s+transf[ée]r[ée]|mensaje\s+reenviado|messaggio\s+inoltrato)\s*[-—_]{2,}$/i,
  // Apple/iOS-Stil: "Anfang der weitergeleiteten Nachricht:" / "Begin forwarded message:"
  /^(?:anfang der weitergeleiteten\s+(?:nachricht|e-?mail)|begin forwarded message|d[ée]but du message transf[ée]r[ée]|inicio del mensaje reenviado|inizio messaggio inoltrato)\s*:?\s*$/i,
  // Outlook-Stil: "-----Ursprüngliche Nachricht / Original Message-----"
  /^[-—_]{2,}\s*(?:urspr[üu]ngliche nachricht|original message|message d['’]origine|mensaje original|messaggio originale)\s*[-—_]{2,}$/i,
];

/** Header-Schlüssel innerhalb eines Forward-Kopfs (mehrsprachig). */
const HDR_SENDER = /^(?:von|from|de|da|mittente)$/i;
const HDR_SUBJECT = /^(?:betreff|subject|objet|asunto|oggetto)$/i;
const HDR_DATE = /^(?:datum|date|fecha|data|gesendet|sent|envoy[ée]|enviado|inviato)$/i;
const HDR_ANY = /^(?:von|from|de|da|mittente|betreff|subject|objet|asunto|oggetto|datum|date|fecha|data|gesendet|sent|envoy[ée]|enviado|inviato|an|to|à|para|a|cc|bcc|destinatario)$/i;

export interface ForwardRef {
  sender?: string;
  subject?: string;
  date?: string;
  /** Kurzvorschau für den eingeklappten Kopf: Betreff + erster Satz. */
  preview: string;
  /** Reiner Text des weitergeleiteten Inhalts. */
  body: string;
}

export interface ForwardSplit {
  /** Echter Nachrichtentext VOR dem Forward-Marker. */
  before: string;
  forward: ForwardRef;
}

function cleanName(v: string): string {
  return v
    .replace(/<[^<>]*>/g, '')
    .replace(/["<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splittet einen Body am ersten Forward-Marker. Gibt null zurück, wenn kein Marker gefunden wird.
 * `before` kann leer sein (Mail, die NUR aus einer Weiterleitung besteht).
 */
export function detectForward(text: string): ForwardSplit | null {
  const lines = text.split('\n');
  let markerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = (lines[i] ?? '').trim().replace(/\s+/g, ' ');
    if (l.length > 0 && l.length <= 120 && FORWARD_MARKERS.some((re) => re.test(l))) {
      markerIdx = i;
      break;
    }
  }
  if (markerIdx === -1) return null;

  const before = lines.slice(0, markerIdx).join('\n').trim();
  const after = lines.slice(markerIdx + 1);

  let sender: string | undefined;
  let subject: string | undefined;
  let date: string | undefined;
  let bodyStart = 0;

  // Forward-Kopf parsen (max. 12 Zeilen): "Von:/From:", "Betreff:/Subject:", "Datum:/Date:", ...
  for (let i = 0; i < after.length && i < 12; i++) {
    const raw = (after[i] ?? '').trim();
    if (!raw) {
      // Leerzeile NACH erkannten Headern beendet den Kopf, davor wird sie übersprungen.
      if (sender || subject || date) {
        bodyStart = i + 1;
        break;
      }
      bodyStart = i + 1;
      continue;
    }
    const m = raw.match(/^([A-Za-zÀ-ÿ]{1,12})\s*:\s*(.+)$/);
    if (m && HDR_ANY.test(m[1] ?? '')) {
      const key = m[1] ?? '';
      const val = (m[2] ?? '').trim();
      if (HDR_SENDER.test(key) && !sender) sender = cleanName(val) || val;
      else if (HDR_SUBJECT.test(key) && !subject) subject = val;
      else if (HDR_DATE.test(key) && !date) date = val;
      bodyStart = i + 1;
    } else {
      // Erste Nicht-Header-Zeile → der weitergeleitete Body beginnt hier.
      bodyStart = i;
      break;
    }
  }

  const body = after.slice(bodyStart).join('\n').trim();
  const firstSentence =
    body
      .replace(/\s+/g, ' ')
      .trim()
      .split(/(?<=[.!?])\s/)[0]
      ?.slice(0, 80) ?? '';
  const preview =
    [subject, firstSentence].filter((s) => s && s.length > 0).join(' — ').slice(0, 130) ||
    'Weitergeleitete Nachricht';

  return { before, forward: { sender, subject, date, preview, body } };
}
