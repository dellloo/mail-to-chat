/** Plattformunabhängige Datenstrukturen von chatmail-core. */

export interface Sender {
  name: string;
  email?: string;
}

export interface Attachment {
  kind: 'image' | 'file';
  name: string;
  /** Quelle (src/href), falls vorhanden. Bleibt lokal - wird nie nachgeladen. */
  url?: string;
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
