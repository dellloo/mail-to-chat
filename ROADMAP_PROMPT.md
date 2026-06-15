# Mail to Chat — Entwicklungs-Briefing

> Dieses Dokument ist das vollständige Briefing für die nächste Entwicklungsrunde.
> Ergänze Abschnitte mit `[LO: ...]` und gib das Dokument dann zurück.

---

## 1. Kontext & Stand

**Produkt:** Chrome Extension (MV3) + Firefox (MV2). Monorepo: `packages/core`, `packages/ui`, `packages/adapters/gmail`, `apps/chrome-ext`, `apps/firefox-ext`. TypeScript strict, esbuild, Vitest (94 Tests).

**Aktuell stabile Version:** v1.3.3

**Was funktioniert:**

- Gelber Toggle-Button ("Chat-Ansicht") + Gear-Icon (⚙️) in der Gmail-Toolbar
- Chat-View mit Shadow DOM, 12 Themes, Bubble-Tails, Avatare, Datums-Trenner
- Gmail-Skin-Engine (komplettes Restyling der Gmail-Oberfläche)
- Skin-Presets: Bumblebee, Discord Dark, WhatsApp Night, Telegram, Clean Light, Slack
- autoActivate: ON by default — jede Mail öffnet automatisch als Chat
- Spam-Click-Guard (kein Hang bei schnellen Klicks)
- Settings-Seiten-Fix (cm-skin-settings, hashchange)
- Chat-Composer (direkt antworten aus der Chat-Ansicht)
- Anhang-Galerie (PDF, Bilder, Lightbox)
- Reply-Kontext (WhatsApp-Style, mit Sprung zur Original-Nachricht)
- Message-Grouping (visuelle Gruppierung zusammengehöriger Nachrichten)

**Bekannte Schwächen / offene Baustellen:**

- Gelegentlich triggert autoActivate nicht beim ersten Laden (Race-Condition MutationObserver vs. Gmail-Render)
- Button injiziert sich manchmal erst nach 1-2 Sekunden (sichtbarer Delay) (fix möglichkeiten? entweder was bombensicheres redundantes oder ein visueller ausgrauen nach jedem clicken oder block dass man nciht spammen kann visuell und per code idk )
- Kein graceful Degradation wenn Gmail seinen DOM ändert
- Keine Onboarding-Experience bei Erstinstallation
- Kein visuelles Feedback wenn Extension den Context verliert (Gmail-Tab-Wechsel)

---

## 2. Entwicklungsprinzipien (non-negotiable)

**Engineering:**

- Zero-Halluzination: nur implementieren was du 100% verstehst. Bei Unklarheit: Rückfrage.
- Alle Änderungen müssen `npm run build` + `npx vitest run` (94/94) bestehen.
- Kein Refactoring ohne konkreten Grund. Stabilität > Eleganz.
- TypeScript strict: kein `any`, kein `@ts-ignore`.

**Git & Versioning:**

- Semantisches Versioning: `MAJOR.MINOR.PATCH`
  - `PATCH`: Bugfix, kein Breaking Change, kein neues Feature
  - `MINOR`: Neues Feature, backward-kompatibel
  - `MAJOR`: Breaking Change oder Architektur-Änderung
- Commit-Format: `<type>(<scope>): <beschreibung>`
  - `type`: `fix` | `feat` | `refactor` | `chore` | `docs` | `test`
  - `scope`: `core` | `ui` | `gmail` | `chrome` | `firefox` | `release`
- Git-Tag nach jedem Release: `git tag -a v1.x.x -m "v1.x.x: ..."` + `git push origin v1.x.x`
- `apps/chrome-ext/manifest.json` + `apps/firefox-ext/manifest.src.json` immer auf gleicher Version halten
- Version in manifest.json, manifest.src.json und ROADMAP (Abschnitt 1) synchron halten
- Niemals pushen ohne lokalen Build+Test-Lauf (94/94)

**UX-Prinzipien (Silicon Valley / Apple-Standard):**

- **Zero-friction:** Es funktioniert sofort, ohne Konfiguration. Der User denkt nicht über das Tool nach.
- **Progressive Disclosure:** Standardansicht ist simpel. Power-Features sind da, aber versteckt.
- **Perceived Performance:** Lieber optimistisches UI als Warte-States. Animation überbrückt Ladezeit.
- **Resilience:** Das Plugin heilt sich selbst. Gmail ändert seinen DOM? Extension recovered.
- **Single Source of Truth:** Eine Einstellung, eine Wahrheit. Kein Zustand der sich widerspricht.
- **Delight ohne Noise:** Kleine Animationen die Qualität kommunizieren, aber nie nerven.

---

## 3. Priorisierte Änderungen

### P0 — Kritisch (muss in nächster Version)

#### 3.1 autoActivate Race-Condition fixen

**Problem:** Wenn Gmail noch rendert wenn der Content-Script startet, findet `check()` kein `div.adn`-Element und gibt auf. Keine Retry-Logik für diesen Fall.
**Fix:** `scheduleCheck()` soll nach dem initialen `check()` einen Fallback-Observer auf `document.body` setzen der wartet bis `div.adn` erscheint (max 10s, dann aufgeben). Ähnlich wie ein "lazy activation" pattern.

#### 3.2 Button-Injection-Delay eliminieren

**Problem:** Der Toggle-Button erscheint manchmal 1-2s nach dem die Gmail-Toolbar schon sichtbar ist. User sieht den leeren Slot.
**Fix:** `injectToolbarButton()` soll den Toolbar-Observer (`div[gh="mtb"]`) früher starten — bereits beim `DOMContentLoaded` statt erst wenn `check()` erfolgreich war.

---

### P1 — Hoch (sollte in nächster Version)

#### 3.3 Aktivierungs-Animation

**Was:** Wenn die Chat-Ansicht sich aktiviert, soll das Element mit einem schnellen Fade-in (150ms, `opacity: 0 → 1`) erscheinen statt hart zu wechseln.
**Warum:** Kommuniziert dem User "etwas ist passiert" ohne ihn abzulenken. iMessage, WhatsApp und Telegram machen das alle so.
**Impl:** CSS `@keyframes chatmail-fadein` auf `.cm-chat`, über `buildCss()` in `packages/ui/src/chat.ts`.

#### 3.4 Button-State klarer kommunizieren

**Aktuell:** Button zeigt "Chat-Ansicht" wenn aktiv — was bedeutet das? Ist das der aktuelle Modus oder wohin man wechselt?
**Fix:**

- Aktiv: Button zeigt `● Chat` (solid dot = an)
- Inaktiv: Button zeigt `○ Klassisch` (hollow dot = aus)
- Tooltip on hover: "Chat-Ansicht ist aktiv — klicken zum Deaktivieren" / vice versa
  **Alternativ:** [LO: Hast du eine andere Idee wie der Button-State kommuniziert werden soll?]

#### 3.5 Keyboard Shortcut

**Was:** `Alt+C` (Mac: `Option+C`) toggled die Chat-Ansicht auf der aktuellen Mail.
**Warum:** Power-User (das Ziel-Persona) nutzen Tastatur. Kein Klick notwendig.
**Impl:** `keydown`-Listener im Content-Script, nur wenn `document.activeElement` kein Input ist.

---

### P2 — Mittel (nice to have für nächste Version)

#### 3.6 Per-Mail Opt-Out

**Was:** Rechtsklick auf den Toggle-Button → Kontextmenü: "Diese Mail immer klassisch anzeigen" / "Diese Mail immer als Chat anzeigen"
**Warum:** Manche Mails (z.B. Newsletters, lange Threads mit Anhängen) sehen in der Chat-Ansicht suboptimal aus. User will Ausnahmen definieren ohne autoActivate global auszuschalten.
**Impl:** Whitelist/Blacklist nach Thread-ID in `chrome.storage.sync`. Thread-ID aus Gmail-URL (`#inbox/[threadId]`).

#### 3.7 Smart Quote-Erkennung verbessern

**Was:** Zitierter Text in Antworten (`> Schrieb am...`) soll kompakter collapsed werden — wie in Gmail selbst (einklappbar per Click).
**Aktuell:** Quotes werden erkannt aber nur statisch versteckt/angezeigt.
**Fix:** Toggle-Animation + "X Zeilen zitiert" Badge wenn collapsed.

#### 3.8 Self-Healing bei Gmail-DOM-Änderungen

**Was:** Wenn Gmail nach einem SPA-Routing-Event seinen DOM neu aufbaut (z.B. Tab-Wechsel zwischen Posteingang und Labels), verliert die Extension manchmal ihren Button.
**Fix:** Ein globaler `MutationObserver` auf `document.body` der den `GROUP_ID`-Container überwacht. Wenn er verschwindet → `injectToolbarButton()` erneut aufrufen.
**Hinweis:** Bereits partiell implementiert in `scheduleCheck()`, muss aber robuster werden.

---

### P3 — Zukunft (nicht in nächster Version, aber im Hinterkopf behalten)

#### 3.9 htmlSafeBg — Übergang weiter verbessern (Nice-to-have)

**Was:** Der aktuelle `inset box-shadow` Ansatz ist OK, aber noch nicht perfekt. Ideal: dünner gefärbter Außenrand der pixel-genau und flüssig direkt in das Weiß übergeht — kein sichtbarer Schatteneffekt, kein "Rahmen"-Look, reiner Farbübergang direkt an der Grenze.
**Technische Richtung:** CSS `mask-image` als Soft-Edge-Vignette, oder `outline` in Bubble-Farbe mit `outline-offset: -1px` + `border-radius`.
**Priorität:** P3 — aktuell akzeptabel, das ist eine Feinheit.

#### 3.10 Onboarding-Flow bei Erstinstallation

**Was:** Wenn die Extension zum ersten Mal in Gmail injiziert wird (kein gespeicherter State), erscheint ein einmaliger Tooltip: "✦ Mail to Chat ist aktiv — deine Mails werden jetzt als Chat angezeigt." mit einem "Verstanden" Button.
**Warum:** Viele User wissen nach der Installation nicht was passiert ist. Zero-Confusion = bessere Retention.

#### 3.10 Firefox-Parität

**Was:** Die Firefox-Extension (`apps/firefox-ext`) ist technisch vorhanden aber möglicherweise nicht auf gleichem Featurestand.
**Action:** Audit — welche Features fehlen in der Firefox-Version? Parität herstellen.

#### 3.11 Micro-Interaction: Send-Button Animation

**Was:** Wenn der User eine Antwort sendet (Chat-Composer), soll der Send-Button kurz pulsieren (scale 1→1.2→1, 200ms) bevor die Nachricht abschickt wird.
**Warum:** Haptisches Feedback-Analogon für Desktop. Slack macht das, Discord macht das.

---

## 4. Was der User (Dello) explizit wichtig findet

Aus der Entwicklungsgeschichte dieser Session — das sind harte Anforderungen:

- **Der gelbe Toggle-Button muss bleiben.** Entfernen war ein Fehler. Er ist das primäre Control-Element.
- **autoActivate muss ON sein** — jede Mail öffnet als Chat, ohne Ausnahme, solange das Plugin aktiv ist.
- **Kein Hängen bei schnellen Klicks.** Der Spam-Click-Fix (no-waitFor, activating-Guard) bleibt.
- **Die Einstellungen müssen immer erreichbar sein** — entweder über das Gear-Icon in der Toolbar oder über das Extension-Icon in Chrome.
- **Git + Versioning ist Pflicht.** Jede Änderung = eigener Commit + semantischer Tag.
- **Keine halbfertigen Lösungen.** Lieber weniger Features, dafür 100% stabil.

---

## 5. Lo's Ergänzungen

> Hier kannst du eigene Ideen, Korrekturen oder Prioritätsänderungen eintragen.
> Format: `[LO: deine Notiz]`

[LO: ...]
habe bei z29 ergänzt sonst keine ideen bzw zu den programmiwrprinzipien lass uns einen weg extra gehen und bei der funktionalität und redundanz auf NASA programmierprinzipien gehen also die sichersten die es gibt sodass IMMEr alles funktioniert,
nimm dir wenn nötig für alles die notwendige zeit zur recherche und um dir beispiele oder anwendungsmethoden, prinzipien oder sicherheiten anzuschauen

btw wie sieht es aus mit einer mobile app, sowas gibts schon hab ich gesehen aber vlt kann man ja iwie was entwickeln wenn das simpel ist, hat aber erstmal geringere prio, vorher wäre die thudnerbird erweiterung das nächste wichtige ziel

---

## 6. Out of Scope

Diese Dinge werden explizit **nicht** gebaut (zumindest nicht jetzt):

- Backend / Server / Cloud-Sync — alles bleibt 100% lokal
- KI-Features (Zusammenfassung, Auto-Reply) — war drin, wurde rausgenommen, bleibt draußen
- Mobile-Support — Gmail-App hat kein Extension-API
- Paid-Features / Paywall — alles bleibt kostenlos

---

## 7. Wie du dieses Dokument verwendest

1. Lies es durch
2. Ergänze deine Gedanken in den `[LO: ...]` Feldern
3. Schick es zurück: "Implementiere das Briefing"
4. Ich arbeite die P0/P1-Items ab, baue, teste, committe
