/** Plattformunabhängige Datenstrukturen von chatmail-core. */

export interface Sender {
  name: string;
  email?: string;
}

export interface Attachment {
  kind: 'image' | 'file';
  name: string;
  /** Anzeige-Quelle (Thumbnail-src/href), falls vorhanden. Bleibt lokal. */
  url?: string;
  /** Volle Originalgröße (für „Original öffnen"), falls ableitbar. */
  fullUrl?: string;
}

export interface MessageObject {
  sender: Sender;
  /** Roh-String des Zeitstempels (clientabhängig formatiert). */
  timestamp?: string;
  /** Bereinigter Nachrichten-Body als HTML (ohne Zitate, ohne Signatur). */
  bodyHtml: string;
  /** Reine Textfassung des Bodys. */
  bodyText: string;
  /** Erkannte Signatur (eingeklappt darstellbar), falls vorhanden. */
  signatureHtml?: string;
  attachments: Attachment[];
  /** true = Nachricht stammt vom Nutzer selbst (rechts darstellen). */
  isOwn: boolean;
  /** WhatsApp-Style Antwort-Kontext: worauf diese Mail direkt geantwortet hat
   *  (aus der Zitat-Ebene extrahiert). Nur gesetzt, wenn NICHT auf die
   *  unmittelbar vorherige Nachricht geantwortet wurde. */
  replyTo?: { name: string; preview: string; timestamp?: string };
  /** Eingeklappt darstellbare, weitergeleitete Nachricht innerhalb dieses Bubbles.
   *  Wird textbasiert aus Forward-Markern erkannt (siehe forwards.ts). */
  forwarded?: {
    sender?: string;
    subject?: string;
    date?: string;
    /** Kurzvorschau (Betreff + erster Satz) für den eingeklappten Kopf. */
    preview: string;
    /** Voller weitergeleiteter Inhalt als HTML (<br>-getrennt). */
    bodyHtml: string;
  };
}

export type ParserLanguage = 'de' | 'en' | 'fr' | 'es' | 'it';

export interface ParseOptions {
  /** Eigene Adressen für die isOwn-Zuordnung. */
  ownEmails?: string[];
  /** Eigener Anzeigename (Fallback, wenn keine E-Mail in der Metazeile steht). */
  ownName?: string;
  /** Aktivierte Metazeilen-Sprachen. Default: alle. */
  languages?: ParserLanguage[];
  /** Signaturen erkennen und abtrennen. Default: true. */
  filterSignatures?: boolean;
}
