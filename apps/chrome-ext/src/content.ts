import { initGmailAdapter } from '@chatmail/adapter-gmail';
import { DEFAULT_SETTINGS, type ChatSettings } from '@chatmail/ui';

/**
 * Content Script für Gmail. Verdrahtet chrome.storage mit dem Adapter.
 * Alles läuft lokal - es werden keine Daten übertragen.
 *
 * WICHTIG - "Extension context invalidated":
 * Wird die Extension neu geladen (Update/↻), verliert das alte Content Script
 * im offenen Gmail-Tab seine chrome.*-APIs (sie werden undefined). Jeder
 * Zugriff ist deshalb abgesichert und degradiert sauber auf Defaults,
 * statt mit TypeErrors zu crashen. Nach einem Tab-Reload ist alles frisch.
 */

function contextAlive(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id && !!chrome.storage?.sync;
  } catch {
    return false;
  }
}

function getSettings(): Promise<ChatSettings> {
  return new Promise((resolve) => {
    const fallback: ChatSettings = {
      ...DEFAULT_SETTINGS,
      custom: { ...DEFAULT_SETTINGS.custom },
      gmailSkin: { ...DEFAULT_SETTINGS.gmailSkin },
    };
    if (!contextAlive()) {
      resolve(fallback);
      return;
    }
    // CRITICAL: Race-Condition-Guard.
    // chrome.storage.sync.get schaut synchron lebendig aus (contextAlive() = true),
    // stirbt aber bevor der Callback feuert → Promise hängt für immer → toggle() hängt.
    // Lösung: nach 1500ms zwangsweise mit Fallback auflösen.
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn('[Mail to Chat] getSettings() Timeout — Extension-Kontext tot? Gmail-Tab neu laden (F5).');
        resolve(fallback);
      }
    }, 1500);
    try {
      chrome.storage.sync.get(null, (raw) => {
        if (resolved) return; // Timeout hat bereits aufgelöst
        resolved = true;
        clearTimeout(timer);
        if (chrome.runtime?.lastError) {
          resolve(fallback);
          return;
        }
        const stored = (raw ?? {}) as Partial<ChatSettings>;
        // Browser-Sprache als Default, solange der Nutzer nie umgeschaltet hat
        const detected: ChatSettings['uiLanguage'] = (navigator.language || '').toLowerCase().startsWith('de')
          ? 'de'
          : 'en';
        resolve({
          ...DEFAULT_SETTINGS,
          uiLanguage: detected,
          ...stored,
          custom: { ...DEFAULT_SETTINGS.custom, ...stored.custom },
          gmailSkin: { ...DEFAULT_SETTINGS.gmailSkin, ...stored.gmailSkin },
        });
      });
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(fallback);
      }
    }
  });
}

initGmailAdapter({
  getSettings,
  onSettingsChanged: (cb) => {
    if (!contextAlive()) return;
    try {
      chrome.storage.onChanged.addListener((_changes, area) => {
        if (area === 'sync') cb();
      });
    } catch {
      /* Kontext weg - Listener entfällt, Defaults bleiben aktiv */
    }
  },
  setAutoActivate: (on: boolean) => {
    if (!contextAlive()) return;
    try {
      void chrome.storage.sync.set({ autoActivate: on });
    } catch {
      /* Kontext weg - Modus gilt für diese Session trotzdem */
    }
  },
  openSettings: () => {
    if (!contextAlive()) {
      // Kontext tot (Extension wurde neu geladen) → Hinweis statt Crash
      alert('Mail to Chat wurde aktualisiert - bitte den Gmail-Tab einmal neu laden (F5).');
      return;
    }
    try {
      void chrome.runtime.sendMessage('chatmail-open-options');
    } catch {
      alert('Mail to Chat wurde aktualisiert - bitte den Gmail-Tab einmal neu laden (F5).');
    }
  },
});
