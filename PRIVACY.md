# Datenschutzerklärung — Mail to Chat

_Stand: 20. Juni 2026_

**Kurzfassung:** Mail to Chat verarbeitet alles **ausschließlich lokal in deinem Browser**.
Kein Server, kein Tracking, keine Werbung. **Keine E-Mail-Inhalte verlassen jemals dein Gerät**,
und der Entwickler erhält keinerlei Daten.

## 1. Was die Erweiterung macht
Stellt geöffnete Gmail-Threads (`mail.google.com`) als Chat-Ansicht dar. Dazu liest sie den Inhalt
der gerade angezeigten Gmail-Seite (Absender, Datum, Nachrichtentext, Anhänge) direkt im Browser
aus und rendert daraus die Chat-Darstellung — vollständig auf deinem Gerät.

## 2. Welche Daten verarbeitet werden — und welche NICHT
- **Lokal gelesen (nicht gespeichert, nicht gesendet):** Inhalt der aktuell geöffneten Gmail-Seite,
  ausschließlich zur Anzeige. Wird nicht gespeichert, protokolliert oder übertragen.
- **Lokal gespeichert (nur Einstellungen):** über `chrome.storage` nur deine Einstellungen
  (Design/Theme, Schriftgröße, Zeitstempel, Auto-Aktivierung, eigene E-Mail-Adressen,
  Pro-Thread-Präferenzen). **E-Mail-Inhalte gehören nicht dazu.**
- **Nicht erhoben:** keine Analyse-/Tracking-Daten, keine Statistiken, keine Geräte-/Standortdaten.

## 3. Weitergabe an Dritte
Keine. Kein Backend, keine Übermittlung an den Entwickler oder Dritte, kein Verkauf, kein Teilen.

## 4. Synchronisierung
Hat dein Browser eine eigene Sync-Funktion aktiv (z. B. Chrome-Sync), können nur deine
*Einstellungen* zwischen deinen Geräten synchronisiert werden — verwaltet allein von deinem
Browser. Der Entwickler erhält dabei nichts.

## 5. Berechtigungen
- `storage` — Einstellungen speichern.
- Zugriff auf `mail.google.com` — Gmail-Seite auslesen und Chat-Ansicht rendern. Keine anderen Seiten.

## 6. Kinder
Richtet sich nicht gezielt an Kinder; erhebt keine personenbezogenen Daten.

## 7. Änderungen
Bei Änderungen wird dieses Dokument mit neuem Datum aktualisiert.

## 8. Kontakt
Fragen zum Datenschutz: `KONTAKT-EMAIL-HIER-EINSETZEN`
