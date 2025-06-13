# 💬 Mail to Chat

Verwandelt E-Mail-Threads per Klick in eine übersichtliche Chat-Ansicht - wie WhatsApp, aber für deine Mails. **100% lokal, keine Daten verlassen dein Gerät.**

## Installation (Entwicklung)

```bash
npm install
npm test        # 24 Unit-Tests (Parser + UI)
npm run build   # baut Chrome- und Firefox-Extension
```

**Chrome:** `chrome://extensions` → Entwicklermodus an → „Entpackte Erweiterung laden" → `apps/chrome-ext/dist`
**Firefox:** `about:debugging#/runtime/this-firefox` → „Temporäres Add-on laden" → `apps/firefox-ext/dist/manifest.json`

Danach Gmail öffnen, einen Thread anklicken → Button **„💬 Chat-Ansicht"** neben dem Betreff (oder `Alt+C`).

## Architektur

```
packages/core            chatmail-core - plattformunabhängiger Parser
                         (Thread-Splitting, Metazeilen DE/EN/FR/ES/IT,
                          Signatur-Filter, Attachment-Extraktion)
packages/ui              chatmail-ui - Chat-Renderer, 11 Themes + Custom,
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

Details: siehe `../mail-to-chat-plan.md`
