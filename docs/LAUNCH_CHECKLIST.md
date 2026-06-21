# Chrome-Launch — deine To-Do-Liste (Stand v1.8.4)

> Alles Technische ist fertig. Hier nur noch das, was nur DU machen kannst (Konten, Hosting, Upload).

## Brauchst du eine Domain?
**Nein — keine bezahlte Domain nötig.** Du brauchst nur EINE öffentliche URL für die
**Datenschutzerklärung** (das verlangt der Chrome Web Store). Die hostest du **kostenlos über
GitHub Pages**. Eine eigene Domain ist optional (später schön fürs Branding/eine Homepage).

---

## Was du brauchst — der Reihe nach

### 1. GitHub-Konto + Repo  (kostenlos)
- Konto auf github.com (falls noch nicht vorhanden).
- Neues Repo `mail-to-chat` anlegen, den Projektordner pushen.
  (Open Source unter GPL-3.0 — passt: Code darf offen sein.)

### 2. Datenschutzerklärung hosten via GitHub Pages  (kostenlos, ~3 Min.)
- Im Repo: Settings → Pages → Source: „Deploy from a branch" → Branch `main`, Ordner `/docs`.
- Datei liegt schon: `docs/privacy-policy.html`.
- Du bekommst eine URL wie `https://DEIN-NAME.github.io/mail-to-chat/privacy-policy.html`.
- **Diese URL brauchst du im Store-Formular.**
- Vorher in `docs/privacy-policy.html` + `PRIVACY.md` die Kontakt-E-Mail eintragen
  (Platzhalter `KONTAKT-EMAIL-HIER-EINSETZEN` ersetzen).

### 3. Chrome Web Store Developer-Konto  (einmalig 5 $)
- chrome.google.com/webstore/devconsole → mit Google-Konto anmelden.
- Einmalige Registrierungsgebühr **5 $** zahlen.
- (Das sind die „Google Dev Tools", die du meintest — das Developer Dashboard.)

### 4. Assets vorbereiten
- **Screenshots:** `docs/demo.html` öffnen → Theme wählen → `Cmd+Shift+4` (Mac), pro Theme 1 Bild.
  (Mind. 1 Screenshot 1280×800 oder 640×400 nötig.)
- **Video (optional, stark empfohlen):** `docs/demo-video.html` öffnen → läuft automatisch →
  `Cmd+Shift+5` einen Durchlauf aufnehmen.

### 5. Hochladen & Einreichen
- Im Developer Dashboard: „Neues Element" → ZIP hochladen: `releases/mail-to-chat-chrome-v1.8.4.zip`.
- Listing-Texte aus `docs/STORE_LISTING_CHROME.md` einfügen (Name, Kurz-/Langbeschreibung, Kategorie).
- Screenshots hochladen.
- Datenschutz-URL (aus Schritt 2) eintragen.
- „Privacy practices" ausfüllen (Vorgaben stehen in STORE_LISTING_CHROME.md).
- **Einreichen.** Review dauert i. d. R. einige Tage bis Wochen (Gmail-Zugriff = mehr Prüfung).

---

## Wichtig (Arbeitsteilung)
- **Builden/ZIP** macht Claude (dein Mac hat node v16, zu alt). Aktuelles ZIP liegt in `releases/`.
  Bei jeder neuen Version erzeugt Claude ein frisches ZIP.
- **Konten, Hosting, Bezahlung, Upload, Einreichen** = nur du (kann/​darf Claude nicht).

## Kurzfassung „was kostet/brauche ich"
| Punkt | Pflicht? | Kosten |
|---|---|---|
| Domain | nein | – |
| GitHub-Konto + Pages (Datenschutz-Hosting) | ja | kostenlos |
| Chrome Developer-Konto | ja | 5 $ einmalig |
| Screenshots | ja (≥1) | – |
| Video | optional | – |
