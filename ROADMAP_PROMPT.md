# Mail to Chat — Entwicklungs-Briefing

> Dieses Dokument ist das vollständige Briefing für die nächste Entwicklungsrunde.
> Ergänze Abschnitte mit `[LO: ...]` und gib das Dokument dann zurück.

---

## 1. Kontext & Stand

**Produkt:** Chrome Extension (MV3) + Firefox (MV2). Monorepo: `packages/core`, `packages/ui`, `packages/adapters/gmail`, `apps/chrome-ext`, `apps/firefox-ext`. TypeScript strict, esbuild, Vitest (94 Tests).

**Aktuell stabile Version:** v1.4.6

**Was funktioniert:**

- iOS-Style Toggle-Switch ("Chat" / "Klassisch") + Gear-Icon (⚙️) in Gmails Toolbar
- Sofortiger Custom-Tooltip am Switch (kein Browser-Delay, 0.08s Fade via CSS `::after`)
- Chat-View mit Shadow DOM, 12 Themes, Bubble-Tails, Avatare, Datums-Trenner
- Gmail-Skin-Engine (Bumblebee, Discord Dark, WhatsApp Night, Telegram, Clean Light, Slack)
- autoActivate: ON by default — jede Mail öffnet automatisch als Chat
- Spam-Click-Guard (kein Hang bei schnellen Klicks), Loading-State pulsiert den Track
- Heartbeat-Timer (3s) als Dead-man's-Switch + Generation-Counter gegen Zombie-Instanzen
- NASA-Retry-Logik bei autoActivate (8 Retries × 400ms + MutationObserver)
- Settings-Seite: Design / Chat-Design / Verhalten + Erweiterte Einstellungen (ausgeklappt)
- Live-Vorschau in Einstellungen mit echten Datums-Trennern (Gestern/Heute)
- Chat-Composer: direkt aus der Chat-Ansicht antworten
- Anhang-Galerie (PDF, Bilder, Lightbox) + Anhang-Cache (überlebt eingeklappte Mails)
- Reply-Kontext (WhatsApp-Style-Banner über dem Editor)
- Message-Grouping (visuelle Gruppierung zusammengehöriger Nachrichten)
- Compose/Reply-Inline-Fix: Schreiben-Popup (neues Fenster) triggert nicht mehr Compose-Mode
- Compose-Toolbar Icons im Dark Mode via Nuclear-Fix (brightness(0)invert(1) direkt auf Element)
- Fade-in Animation (opacity 0→1, 150ms) beim Aktivieren der Chat-Ansicht
- Keyboard Shortcut Alt+C (Win/Linux) / Option+C (Mac)
- Debug-Handle `window.__chatmailDebug.dump()` (Konsole F12)
- Anhang-Cache-Strategie: Medien überleben das Einklappen von Mails (sessionStorage)

---

## 2. Entwicklungsprinzipien (non-negotiable)

**Engineering:**

- Zero-Halluzination: nur implementieren was du 100% verstehst. Bei Unklarheit: Rückfrage.
- Alle Änderungen müssen `npm run build` + `npx vitest run` (94/94) bestehen.
- Kein Refactoring ohne konkreten Grund. Stabilität > Eleganz.
- TypeScript strict: kein `any`, kein `@ts-ignore`.
- NASA-Redundanz: jede kritische Funktion hat mindestens zwei unabhängige Pfade.

**Git & Versioning:**

- Semantisches Versioning: `MAJOR.MINOR.PATCH`
  - `PATCH`: Bugfix, kein Breaking Change, kein neues Feature
  - `MINOR`: Neues Feature, backward-kompatibel
  - `MAJOR`: Breaking Change oder Architektur-Änderung
- Commit-Format: `<type>(<scope>): <beschreibung> (vX.Y.Z)`
  - `type`: `fix` | `feat` | `refactor` | `chore` | `docs` | `test`
  - `scope`: `core` | `ui` | `gmail` | `chrome` | `firefox` | `release`
- Git-Tag nach jedem Release: `git tag -a v1.x.x -m "v1.x.x: ..."` + `git push origin v1.x.x`
- `apps/chrome-ext/manifest.json` + `apps/firefox-ext/manifest.src.json` immer auf gleicher Version
- Version in manifest.json, manifest.src.json und ROADMAP (Abschnitt 1) synchron halten
- Niemals pushen ohne lokalen Build+Test-Lauf (94/94)

**Commit-Body Pflichtformat** (bei jedem fix/feat):
```
Problem:  Was war kaputt / fehlte
Ursache:  Root Cause (nicht nur Symptom)
Lösung:   Was geändert wurde und warum
Hinweis:  (optional) Portierungshinweise für Thunderbird/Firefox/andere Plattformen
```
Zweck: Die Git-History ist das Handbuch für zukünftige Ports. Jedes gelöste
Problem soll nie neu analysiert werden müssen.

**UX-Prinzipien (Silicon Valley / Apple-Standard):**

- **Zero-friction:** Es funktioniert sofort, ohne Konfiguration.
- **Progressive Disclosure:** Standardansicht ist simpel. Power-Features sind da, aber versteckt.
- **Perceived Performance:** Lieber optimistisches UI als Warte-States.
- **Resilience:** Das Plugin heilt sich selbst. Gmail ändert seinen DOM? Extension recovered.
- **Single Source of Truth:** Eine Einstellung, eine Wahrheit. Kein Zustand der sich widerspricht.
- **Delight ohne Noise:** Kleine Animationen die Qualität kommunizieren, aber nie nerven.

---

## 3. Offene Baustellen

### P1 — Hoch (nächste Version)

#### 3.1 Compose-Fenster visuell verifizieren (v1.4.5 — bitte testen)

**Status:** Drei-Ebenen-Fix in v1.4.5 implementiert. Nach Extension-Reload Tab refreshen!
**Was:** 
- Rule 10 v2: `:has([g_editable])` auf Listitem → `bg=${bg}` (nahtlose Ecken, kein Cutoff)
- `[role="toolbar"]:not([gh])` in `[role="list"]` → struktureller Fallback für Toolbar-Background
  (funktioniert auch wenn Gmail `.aDh` umbenennt)
- Wrapper-Divs transparent (Spezifität sauber: 043 < 058)
**Action:** Discord-Dark-Skin aktivieren → Reply-Thread öffnen → prüfen:
  - Toolbar-Hintergrund dunkel? Icons (B, I, U, Emoji, Attach) weiß auf dunklem Grund?
  - Compose-Textbereich dunkel?
  - Ecken des Compose-Bereichs: nahtlos statt abgeschnitten?

---

### P2 — Mittel

#### 3.3 Per-Mail Opt-Out

**Was:** Rechtsklick auf den Toggle → Kontextmenü: "Diese Mail immer klassisch anzeigen".
**Impl:** Whitelist/Blacklist nach Thread-ID in `chrome.storage.sync`. Thread-ID aus Gmail-URL.

#### 3.4 Smart Quote-Collapse

**Was:** Zitierter Text soll einklappbar sein (wie in Gmail selbst), mit Badge "X Zeilen zitiert".
**Impl:** Toggle-Animation + Badge im `packages/ui`.

---

### P3 — Zukunft

#### 3.5 Thunderbird-Port

**Was:** Thunderbird Extension als nächstes primäres Ziel nach Chrome/Firefox.
**Hinweis:** Die gesamte Git-History ist so strukturiert, dass Lösungen nie neu analysiert werden müssen. MutationObserver-Patterns, Retry-Logik und CSS-Filter-Fixes sind portierbar.

#### 3.6 Firefox-Parität Audit

**Was:** Firefox-Extension ist technisch vorhanden — Audit: welche Features fehlen oder verhalten sich anders?

#### 3.7 Onboarding bei Erstinstallation

**Was:** Einmaliger Tooltip nach Erstinstallation: "✦ Mail to Chat ist aktiv — deine Mails werden jetzt als Chat angezeigt."

#### 3.8 htmlSafeBg Übergang (Feinheit)

**Was:** Aktueller `inset box-shadow`-Ansatz ist OK aber nicht perfekt. Ideal: `mask-image` als Soft-Edge-Vignette.
**Priorität:** P3 — aktuell akzeptabel.

---

## 4. Was Lo explizit wichtig findet (harte Anforderungen)

- **Der iOS-Toggle-Switch muss bleiben.** Er ist das primäre Control-Element.
- **autoActivate muss ON sein** — jede Mail öffnet als Chat, ohne Ausnahme.
- **Kein Hängen bei schnellen Klicks.** Spam-Click-Fix bleibt.
- **Die Einstellungen müssen immer erreichbar sein** — Gear-Icon oder Extension-Icon in Chrome.
- **Git + Versioning ist Pflicht.** Jede Änderung = eigener Commit + semantischer Tag.
- **Keine halbfertigen Lösungen.** Lieber weniger Features, dafür 100% stabil.
- **NASA-Redundanz:** alles muss immer funktionieren, so sicher wie irgend möglich.

---

## 5. Lo's Ergänzungen

[LO: Thunderbird-Extension hat höhere Prio als Mobile-App. Mobile-App is P4/future.
NASA-Programmierprinzipien gelten für alle kritischen Pfade.
Recherche ist immer erlaubt wenn nötig.]

---

## 6. Out of Scope

- Backend / Server / Cloud-Sync — alles bleibt 100% lokal
- KI-Features (Zusammenfassung, Auto-Reply) — explizit ausgeschlossen
- Mobile-App — Gmail-App hat kein Extension-API; P4/Zukunft
- Paid-Features / Paywall — alles bleibt kostenlos

---

## 7. Wie du dieses Dokument verwendest

1. Lies es durch
2. Ergänze deine Gedanken in den `[LO: ...]` Feldern
3. Schick es zurück: "Implementiere das Briefing"
4. Ich arbeite die P1-Items ab, baue, teste, committe
