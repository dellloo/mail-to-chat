import type { ParserLanguage } from '@chatmail/core';

/** Nutzer-Einstellungen - gespeichert in chrome.storage.sync. */
export interface ChatSettings {
  themeId: string;
  /** Custom-Theme-Overrides (nur aktiv bei themeId === 'custom'). */
  custom: {
    ownBubble: string;
    ownText: string;
    otherBubble: string;
    otherText: string;
    background: string;
    radius: number;
  };
  fontSize: 'small' | 'normal' | 'large';
  timestamps: 'always' | 'hover' | 'hidden';
  darkMode: 'light' | 'dark' | 'system';
  /** Eigene Adressen für die isOwn-Zuordnung (Alias-Support). */
  ownEmails: string[];
  ownName: string;
  filterSignatures: boolean;
  showAttachments: boolean;
  /** Chat-View automatisch beim Öffnen einer Mail aktivieren. */
  autoActivate: boolean;
  /** Datums-Trenner ("Heute", "Gestern") zwischen Tagen. */
  showDateSeparators: boolean;
  /** Aktivierte Parser-Sprachen. */
  languages: ParserLanguage[];
  /** UI-Sprache. */
  uiLanguage: 'de' | 'en';
  /** Chat-Design separat anpassen (false = folgt dem allgemeinen Design). */
  chatThemeSeparate: boolean;
  /**
   * HTML-Mails auf weißem Hintergrund anzeigen (default: true).
   * HTML-Mails sind für weiße Hintergründe designt. Bei dunklen Themes
   * würden Inline-Farben (z.B. schwarzer Text) auf dunklem Grund unsichtbar.
   * Mit htmlSafeBg = true bekommt der Mail-Body einen weißen Container,
   * Inline-Styles der Mail greifen wieder korrekt.
   */
  htmlSafeBg: boolean;
  /** Skin für die GESAMTE Gmail-Oberfläche (Beta). */
  gmailSkin: {
    enabled: boolean;
    /** Akzentfarbe (Buttons, aktive Elemente, Links). */
    accent: string;
    /** Haupthintergrund. */
    bg: string;
    /** Flächen (Listen, Karten, Toolbar). */
    surface: string;
    /** Grundtextfarbe. */
    text: string;
    /** Globale Eckenrundung in px. */
    radius: number;
    /** Schriftfamilie ('' = Gmail-Standard). */
    font: string;
    /** Kompakte Dichte (engere Zeilen). */
    compact: boolean;
    /** Extra-Optik: pride = Regenbogen-Akzente, paws = Tier-Pfoten-Muster (Kids). */
    flair: 'none' | 'pride' | 'paws';
  };
}

export const DEFAULT_SETTINGS: ChatSettings = {
  themeId: 'whatsapp',
  custom: {
    ownBubble: '#25D366',
    ownText: '#ffffff',
    otherBubble: '#f1f1f1',
    otherText: '#111111',
    background: '#e5ddd5',
    radius: 12,
  },
  fontSize: 'normal',
  timestamps: 'always',
  darkMode: 'system',
  ownEmails: [],
  ownName: '',
  filterSignatures: true,
  showAttachments: true,
  autoActivate: true,
  showDateSeparators: true,
  languages: ['de', 'en', 'fr', 'es', 'it'],
  uiLanguage: 'de',
  chatThemeSeparate: false,
  htmlSafeBg: true,
  gmailSkin: {
    enabled: false,
    accent: '#e6b400',
    bg: '#101216',
    surface: '#1a1d23',
    text: '#eceef2',
    radius: 12,
    font: '',
    compact: false,
    flair: 'none',
  },
};
