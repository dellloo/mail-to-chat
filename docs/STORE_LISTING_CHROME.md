# Chrome Web Store — Listing-Texte (zum Einfügen ins Developer-Dashboard)

> Copy-Paste-Vorlage. Felder direkt ins Chrome Web Store Developer Dashboard übernehmen.
> Platzhalter `<…>` vor dem Absenden ersetzen.

---

## Name (Extension-Titel)
```
Mail to Chat — Gmail als Chat
```
(Manifest-Name bleibt „Mail to Chat".)

## Kurzbeschreibung / Summary  (max. 132 Zeichen)
**DE:**
```
Verwandelt Gmail-Threads per Klick in eine übersichtliche Chat-Ansicht. 100% lokal — keine Daten verlassen dein Gerät.
```
**EN:**
```
Turns Gmail threads into a clean chat view with one click. 100% local — no data ever leaves your device.
```

## Kategorie
`Productivity` (Produktivität)

## Sprache (primär)
Deutsch (zusätzlich englische Beschreibung empfohlen für mehr Reichweite)

---

## Ausführliche Beschreibung / Detailed description

**DE:**
```
Lange E-Mail-Threads sind ein Chaos: zehn Nachrichten hintereinander, jede schleppt den ganzen
Verlauf als zitierten Text mit – man weiß nicht mehr, wo oben und unten ist.

Mail to Chat verwandelt jeden Gmail-Thread per Klick in eine klare, sortierte Chat-Ansicht –
wie WhatsApp oder Telegram, aber für deine Mails. Jede Mail wird eine eigene, eindeutig
zugeordnete Bubble. Antworten und Weiterleitungen werden erkannt und sauber als klickbare
Referenz bzw. eingeklappter Block dargestellt, statt als zitierte Textwand. Signaturen werden
automatisch eingeklappt.

• 1 Mail = 1 Bubble, mit echtem Absender und Zeit
• Antwort-Bezüge als klickbarer Chip – ein Klick springt zur Originalnachricht
• Weiterleitungen als aufklappbarer Block mit Vorschau
• Signaturen & zitierter Verlauf automatisch ausgeblendet
• 12 Themes (WhatsApp, iMessage, Telegram, Signal, Slack, Teams, Discord u. a.) oder komplett custom
• Direkt aus der Chat-Ansicht antworten
• iOS-Toggle: jederzeit zwischen Chat und klassischer Ansicht wechseln

100 % lokal: Es gibt keinen Server, kein Tracking, keine Werbung. Deine E-Mail-Inhalte verlassen
niemals dein Gerät – die gesamte Verarbeitung passiert in deinem Browser. Gespeichert werden nur
deine Einstellungen.

Mail to Chat ist freie Software (Open Source, GPL-3.0).
```

**EN:**
```
Long email threads are a mess: ten messages in a row, each carrying the whole history as quoted
text — you lose track of what's new.

Mail to Chat turns any Gmail thread into a clean, sorted chat view with one click — like WhatsApp
or Telegram, but for your mail. Each email becomes its own clearly attributed bubble. Replies and
forwards are detected and shown as a clickable reference or a collapsible block instead of a wall
of quoted text. Signatures are collapsed automatically.

• 1 email = 1 bubble, with the real sender and time
• Reply references as a clickable chip — one click jumps to the original message
• Forwards as an expandable block with preview
• Signatures & quoted history hidden automatically
• 12 themes (WhatsApp, iMessage, Telegram, Signal, Slack, Teams, Discord, …) or fully custom
• Reply right from the chat view
• iOS-style toggle: switch between chat and classic view anytime

100% local: no server, no tracking, no ads. Your email content never leaves your device — all
processing happens in your browser. Only your settings are stored.

Mail to Chat is free software (open source, GPL-3.0).
```

---

## Single Purpose (Chrome verlangt einen klaren Einzelzweck)
```
Mail to Chat has a single purpose: it displays Gmail email threads as a chat-style conversation
view to make them easier to read. It does not do anything beyond transforming the appearance of
the currently open Gmail thread, locally in the browser.
```

## Permission-Justifications (für die CWS-Review)
- **`storage`:**
  ```
  Used only to save the user's own settings (selected theme, font size, timestamp display,
  auto-activation, the user's own email addresses for "own message" detection, and per-thread
  display preferences). No email content is stored.
  ```
- **Host permission `https://mail.google.com/*`:**
  ```
  Required to read the content of the currently open Gmail thread (sender, date, message text,
  attachments) directly from the page in order to render the chat view. Processing is entirely
  local; nothing is transmitted. The extension runs on Gmail only — no other sites.
  ```

## Datennutzungs-Angaben (CWS „Privacy practices" / Data disclosures)
Ankreuzen/angeben:
- Personenbezogene oder sensible Daten gesammelt/übertragen: **Nein** (keine Übertragung; lokale
  Verarbeitung; nur Einstellungen lokal gespeichert).
- Verkauf an Dritte: **Nein**.
- Nutzung/Übertragung zu nicht zum Kernzweck gehörenden Zwecken: **Nein**.
- Verwendung für Bonität/Kreditwürdigkeit: **Nein**.
- Bestätigung der drei Programmrichtlinien-Zusicherungen: **Ja**.
- **Datenschutz-URL:** `<HIER GEHOSTETE privacy-policy.html URL EINTRAGEN>`

## Support-/Homepage-URL
```
<GitHub-Repo-URL oder Projekt-Homepage>
```

---

## Vor dem Absenden Checkliste
- [ ] Datenschutz-URL gehostet und eingetragen (docs/privacy-policy.html)
- [ ] Kontakt-E-Mail in der Datenschutzerklärung gesetzt
- [ ] Mind. 1 Screenshot (1280×800 oder 640×400) hochgeladen
- [ ] Kleines Promo-Tile 440×280 (optional, empfohlen)
- [ ] Developer-Konto verifiziert (einmalig 5 $)
- [ ] ZIP via `npm run package` erzeugt und hochgeladen
