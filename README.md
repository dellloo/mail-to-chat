# 💬 Mail to Chat

Verwandelt E-Mail-Threads per Klick in eine übersichtliche Chat-Ansicht - wie WhatsApp, aber für deine Mails. **100% lokal, keine Daten verlassen dein Gerät.**

## Installation (Entwicklung)

> Voraussetzung: **Node ≥ 18** (esbuild/vitest).

```bash
npm install
npm test        # 119 Unit-Tests (Parser + UI + Gmail-Adapter)
npm run build   # baut Chrome- und Firefox-Extension
```

**Chrome:** `chrome://extensions` → Entwicklermodus an → „Entpackte Erweiterung laden" → `apps/chrome-ext/dist`
**Firefox:** `about:debugging#/runtime/this-firefox` → „Temporäres Add-on laden" → `apps/firefox-ext/dist/manifest.json`

Danach Gmail öffnen, einen Thread anklicken → **iOS-Toggle „Chat / Klassisch"** in der Toolbar (oder `Alt+C` / `Option+C`).

## Architektur

```
packages/core            chatmail-core - plattformunabhängiger Parser
                         (Thread-Splitting, Metazeilen DE/EN/FR/ES/IT,
                          Signatur-Filter, Attachment-Extraktion)
packages/ui              chatmail-ui - Chat-Renderer, 12 Themes + Custom,
                         Shadow DOM (Style-Isolation gegen Gmail-CSS)
packages/adapters/gmail  Gmail-DOM-Extraktor, Toggle-Button, MutationObserver
apps/chrome-ext          Manifest V3, Options Page mit Live-Vorschau
apps/firefox-ext         Manifest V2 (gleiche Bundles)
```

## Einstellungen

Rechtsklick aufs Extension-Icon → Optionen: Theme (WhatsApp, iMessage, Telegram, Signal, Slack, Teams, Discord u. a. oder vollständig custom), Schriftgröße, Zeitstempel, eigene E-Mail-Adressen (Alias-Support), Signatur-Filter, Auto-Aktivierung, Parser-Sprachen.

## Status / Roadmap

- [x] Phase 1 MVP: Gmail (Chrome + Firefox)
- [ ] Phase 2: Outlook Web, Thunderbird (MailExtension)
- [ ] Phase 3: Fastmail, ProtonMail, HEY, Yahoo

## Datenschutz

100 % lokal: keine Server, kein Tracking, keine Werbung. E-Mail-Inhalte verlassen nie das Gerät;
gespeichert werden nur deine Einstellungen (`chrome.storage`). Siehe [`PRIVACY.md`](PRIVACY.md).

## Lizenz

[GNU General Public License v3.0 (or later)](LICENSE) — freie Software: nutzen, einsehen und
verbessern ist ausdrücklich erlaubt; Ableitungen müssen ebenfalls quelloffen unter der GPL bleiben
und den Ursprung nennen. So bleibt das Projekt frei und kann nicht proprietär vereinnahmt werden.

© 2026 Lo Delleske. Mail to Chat ist freie Software unter der GPL-3.0-or-later.
