# Mail to Chat — Gelöste Probleme & Lösungen

> Wissensbase für zukünftige Ports (Thunderbird, Firefox, Mobile).
> Format ab v1.3.7: direkt im Git-Commit-Body. Ältere Einträge hier nachgetragen.
> Neueste Einträge zuerst.

---

## v1.3.6 — Switch nur bei offenem Thread sichtbar

**Problem:** Toggle-Switch war im Inbox-View (kein Thread offen) sichtbar und klickbar, obwohl er nichts tun kann.

**Ursache:** `findThreadHeader()` hat einen Fallback-Selektor (`div[role="main"] h2`) der im Inbox-View auf Gmail-Sektion-Überschriften matcht → `hasMail = true` obwohl kein Thread offen ist.

**Lösung:** `hasMail`-Check in `injectToolbarButton()` auf `h2.hP` (Gmails spezifische Thread-Subject-Klasse) beschränkt. Diese Klasse existiert ausschließlich wenn ein Thread geöffnet ist. Der generische `h2`-Fallback bleibt in `findThreadHeader()` für die Thread-Wechsel-Erkennung (harmlos dort, kritisch nur bei der Button-Visibility).

**Hinweis Thunderbird:** Thunderbird's Message-Pane hat eigene DOM-Anker. Equivalent zu `h2.hP` wäre der Subject-Header des geöffneten Mails — muss im Thunderbird-DOM analysiert werden. Gleiches Muster: spezifische Klasse statt generischen Tag-Fallback verwenden.

---

## v1.3.5 — Toggle-Switch statt Pill-Button

**Problem:** Pill-Button ("● Chat" / "○ Klassisch") kommuniziert den Zustand schlecht — nicht sofort klar ob er den aktuellen Zustand anzeigt oder wohin er wechselt. Kein intuitives visuelles Feedback beim Laden.

**Ursache:** Design-Entscheidung aus frühen Versionen. Pill-Buttons sind für Actions, nicht für Zustands-Toggles gedacht.

**Lösung:** iOS/Settings-Style Toggle-Switch: Track (36×20px, border-radius 10px) + gleitender Thumb (14px Kreis). Aktiv: Track gelb (#f2c200), Thumb translateX(16px). Inaktiv: Track grau (rgba(128,128,128,0.35)), Thumb position 0. Loading: Button opacity 0.5 + pointer-events none + Track pulsiert (chatmail-pulse Keyframe). `updateButtonLabel()` manipuliert Track/Thumb/Label direkt statt `innerHTML` zu ersetzen.

**Hinweis Thunderbird:** CSS-Transition (`transform 0.2s ease`) und `@keyframes` funktionieren in Thunderbird's HTML-Panels (XUL/XHTML). Switch-DOM-Struktur identisch portierbar.

---

## v1.3.4 — Debug-Brücke für Main World + Retry-Loop-Fix

### Teil 1: window.__chatmailDebug nicht in DevTools nutzbar

**Problem:** `window.__chatmailDebug.dump()` warf `TypeError: Cannot read properties of undefined` in der DevTools-Konsole.

**Ursache:** Chrome Content Scripts laufen in einer **Isolated World** — sie haben ein separates JavaScript-Kontext. `window.__chatmailDebug` ist dort gesetzt, aber DevTools-Konsole läuft im **Main World**-Kontext ("top"). Beide sehen nicht dieselben `window`-Properties.

**Lösung:** CustomEvent-Bus zwischen den Welten. Isolated World lauscht auf `CustomEvent('__cmDbgReq')`, Main World bekommt ein via `<script>`-Tag injiziertes Shim das `window.__chatmailDebug` als Proxy exponiert. `dump()` dispatcht Event → Isolated World empfängt es → ruft echtes `dump()` auf → Output erscheint in Console.

**Hinweis Thunderbird:** Thunderbird Extensions laufen im privilegierten Kontext (chrome://), kein Isolated World Problem. `window.__chatmailDebug` direkt exponierbar. Firefox WebExtension: gleiches Isolated World Problem wie Chrome → gleiche Bridge-Lösung.

### Teil 2: autoActivate Retry-Endlosschleife

**Problem:** Nach 8 fehlgeschlagenen Aktivierungs-Retries startete der 3s-Heartbeat-Timer immer wieder neue 8er-Zyklen — Konsole voll mit "Retry 1/8 ... 8/8 → reset → 1/8 ...".

**Ursache:** Im `else`-Branch nach erschöpften Retries wurde `retryActivationCount = 0` gesetzt. Der nächste Heartbeat-Tick sah count = 0, begann neuen Zyklus.

**Lösung:** Neues `activationGaveUp`-Flag (boolean). Wird `true` wenn Retries erschöpft. `activate()` wird nur aufgerufen wenn `!activationGaveUp`. Wird auf `false` zurückgesetzt ausschließlich bei Thread-Wechsel (`key !== lastThreadKey`). `retryActivationCount` wird nicht mehr im else-Branch genullt.

**Hinweis Thunderbird:** Heartbeat-Pattern (setInterval → scheduleCheck) ist identisch portierbar. `activationGaveUp` sollte auch bei Tab-Wechsel (Folder-Change in Thunderbird) zurückgesetzt werden.

---

## v1.3.3 — Spam-Guard + Loadbar + Debug-Handle

### Spam-Guard: toggle() hing bei schnellen Klicks

**Problem:** Schnelles Klicken auf den Toggle-Button führte zu hängendem UI-Zustand.

**Ursache:** `activating`-Flag schützte nur den Aktivierungspfad. Deaktivierung lief ungeschützt durch: `deactivate()` ist sync, aber `updateButtonLabel()` danach ist async. In der async-Lücke war der Button ungeschützt.

**Lösung:** `toggling`-Flag (boolean) das am Anfang von `toggle()` gesetzt und im `finally`-Block (also immer, auch bei Fehlern) zurückgesetzt wird. Deckt BEIDE Pfade ab (Aktivierung + Deaktivierung + Label-Update).

**Hinweis Thunderbird:** Gleiches Pattern anwendbar. `finally`-Block ist kritisch — ohne ihn bleibt `toggling = true` bei unerwarteten Fehlern.

### window.__chatmailDebug Handle

**Problem:** Bei Bugs war nicht ersichtlich was intern vorgeht — kein strukturierter Zugriff auf State/Log.

**Lösung:** `window.__chatmailDebug` Objekt am Ende von `initGmailAdapter()` gesetzt mit: `dump()` (console.group mit State-Tabelle), `state` (getter, live), `log` (getter, Ringpuffer letzter 50 Einträge mit relativem Timestamp), `forceCheck()`, `version`. Ringpuffer `DEBUG_LOG` (max 50) in `log()` befüllt.

---

## v1.3.2 — autoActivate Race-Condition + Button-Delay

### Race-Condition: div.adn erscheint nach h2.hP

**Problem:** `autoActivate` feuerte aber fand 0 Nachrichten — Chat-Ansicht blieb aus.

**Ursache:** Gmail rendert Thread-Header (`h2.hP`) manchmal vor den Mail-Bodies (`div.adn`). `check()` → `activate()` → 0 Messages → gibt auf. Einmaliger 400ms-Timer als Retry war nicht zuverlässig genug.

**Lösung:** Doppelter Retry-Pfad (NASA-Redundanz): (1) `MutationObserver` auf `document.body` der sofort feuert sobald `div.adn` erscheint, (2) 400ms Safety-Timer als Fallback. Bis zu 8 Retries (`MAX_ACTIVATION_RETRIES`). Beide Pfade rufen `retryOnce()` das `retryObs.disconnect()` + `scheduleCheck()`.

**Hinweis Thunderbird:** Thunderbird's Nachrichtenliste ist kein SPA — Race-Condition unwahrscheinlicher. Aber bei Conversation-View (Zusammenführung mehrerer Mails) ähnliches Timing-Problem möglich.

### Button-Injection-Delay

**Problem:** Toggle-Button erschien mit leerem Label bis `updateButtonLabel()` (async) zurückkam.

**Ursache:** `updateButtonLabel()` wartet auf `getSettings()` → Chrome Storage → async. In dieser Zeit: Button sichtbar aber kein Label.

**Lösung:** Sofortige synchrone Label-Initialisierung mit DE-Fallback direkt bei Button-Erstellung (`btn.innerHTML = ...`). Danach überschreibt `updateButtonLabel()` mit korrekter Sprache. P0.2-Kommentar im Code.

---

## v1.3.1 — htmlSafeBg: weißer Hintergrund für HTML-Mails im Dark Mode

**Problem:** HTML-Mails im Dark Mode waren schwer lesbar — dunkle Extension-Bubble + dunkle Mail-Inhalte mit schwarzem Text.

**Ursache:** HTML-Mails haben hardcoded `color: #000` oder ähnliches. Im Dark Mode kollidiert das mit dunklem Bubble-Hintergrund.

**Lösung:** CSS-Klasse `html-safe` auf `.cm-chat` wenn `themeIsDark(t) && settings.htmlSafeBg !== false`. Bubble-Body bekommt weißen Hintergrund + `inset box-shadow` in Bubble-Farbe für flüssigen Übergang ohne harte Kante. Checkbox in Options.

**Fehlversuch 1:** `background: linear-gradient(white, transparent)` — CSS `transparent` = `rgba(0,0,0,0)` (transparentes SCHWARZ), Interpolation ergibt grau-schwarzen Verlauf statt weiß-transparent.

**Fehlversuch 2:** `radial-gradient` mit `rgba(255,255,255,0)` — wolkig, Übergang nicht sauber genug.

**Richtige Lösung:** `background: #ffffff` + `inset box-shadow: inset 0 0 14px 3px var(--cm-other-bubble)`. Box-Shadow hat keine Farbinterpolations-Probleme, fließt sauber von Bubble-Farbe nach weiß.

---

## v1.0.3 — getSettings() Deadlock

**Problem:** `toggle()` hing dauerhaft — Extension schien eingefroren.

**Ursache:** `chrome.storage.sync.get()` Callback feuerte nie wenn der Extension-Kontext invalidiert war (Extension neu geladen während Gmail-Tab offen). `contextAlive()` gab `true` zurück (chrome.runtime.id noch gesetzt), aber Storage-Callback kam nie → Promise hing für immer.

**Lösung:** 1500ms Timeout-Guard in `getSettings()`. Nach Ablauf: resolve mit Fallback-Settings + console.warn mit Hinweis auf Tab-Reload (F5).

**Hinweis Thunderbird:** Thunderbird Extensions invalidieren ihren Kontext beim Update ebenfalls. Gleiches Timeout-Pattern empfohlen für alle async Storage-Operationen.

---

## v0.9.6 — Toolbar-Button toter Klick im Lesebereich

**Problem:** Toggle-Button im Lesebereich-Modus (Split View) empfing keine Klicks — unsichtbares Gmail-Overlay lag darüber.

**Ursache:** Button als Fluss-Element in `div[gh="mtb"]` brach in neue Zeile um und landete im Bereich wo Gmails eigenes Overlay alle Pointer-Events absorbierte.

**Lösung:** Button als `position: absolute` innerhalb `position: relative` Toolbar. Wrapper-Div (`GROUP_ID`) mit `position: absolute; top: 50%; transform: translateY(-50%); z-index: 9` verankert. `positionGroup()` berechnet `left`-Position dynamisch rechts von Gmails Icon-Gruppe.

---

## v0.9.2 — Firefox: isVisible() Bug

**Problem:** Extension funktionierte in Firefox nicht — alle Messages unsichtbar.

**Ursache:** `isVisible()` nutzte `el.offsetParent !== null`. In Firefox ist `offsetParent === null` wenn irgendein Vorfahr `position: fixed` oder `sticky` hat — Gmails Lesebereich nutzt genau das.

**Lösung:** `el.getClientRects().length > 0` — funktioniert browserübergreifend korrekt (Chrome, Firefox, Safari).

**Hinweis Thunderbird:** Thunderbird nutzt Gecko (Firefox-Engine) → gleicher Bug möglich. Immer `getClientRects()` statt `offsetParent` verwenden.

---

## Generation Counter — Mehrfach-Instanz-Problem

**Problem:** Bei schnellem Tab-Wechsel oder Extension-Reload liefen mehrere Content-Script-Instanzen gleichzeitig — doppelte Aktivierungen, Race-Conditions auf globalem `state`.

**Ursache:** Gmail ist eine SPA. Content Script wird nicht entladen bei Navigation. Mehrere Injections möglich.

**Lösung:** Generation Counter in `document.documentElement.dataset.chatmailGen`. Jede neue Instanz inkrementiert, prüft bei jedem `scheduleCheck()` ob sie noch Owner ist (`isStillOwner()`). Ältere Instanzen disconnecten sich graceful. Orphan-Cleanup beim Start: alle DOM-Elemente mit alten IDs entfernen.

**Hinweis Thunderbird:** Thunderbird's Addon-Lifecycle ist expliziter (startup/shutdown events). Generation Counter ggf. nicht nötig, aber bei dynamischem Folder-Switching sicherheitshalber implementieren.
