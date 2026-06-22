import { describe, expect, it } from 'vitest';
import { isMetaLine, parseMetaLine, parseThread, splitSignature } from '../src/index';

describe('Metazeilen-Erkennung', () => {
  it('erkennt EN/DE/FR/ES/IT', () => {
    expect(isMetaLine('On Mon, Jun 1, 2026 at 9:14 AM Jane Doe <jane@x.com> wrote:')).toBe(true);
    expect(isMetaLine('Am 01.06.2026 um 09:14 schrieb Max Mustermann <max@y.de>:')).toBe(true);
    expect(isMetaLine('Le 1 juin 2026 à 09:14, Jean Dupont <jean@z.fr> a écrit :')).toBe(true);
    expect(isMetaLine('El 1 jun 2026, a las 9:14, Ana García <ana@w.es> escribió:')).toBe(true);
    expect(isMetaLine('Il giorno lun 1 giu 2026 alle ore 09:14 Mario Rossi <mario@v.it> ha scritto:')).toBe(true);
    expect(isMetaLine('Hallo, wie geht es dir?')).toBe(false);
    expect(isMetaLine('On the other hand, this is fine.')).toBe(false);
  });

  it('respektiert Sprach-Konfiguration', () => {
    expect(isMetaLine('Am 01.06.2026 um 09:14 schrieb Max <m@y.de>:', ['en'])).toBe(false);
    expect(isMetaLine('Am 01.06.2026 um 09:14 schrieb Max <m@y.de>:', ['de'])).toBe(true);
  });

  it('extrahiert Sender aus deutscher Metazeile', () => {
    const { sender, timestamp } = parseMetaLine('Am 01.06.2026 um 09:14 schrieb Max Mustermann <max@y.de>:');
    expect(sender.email).toBe('max@y.de');
    expect(sender.name).toBe('Max Mustermann'); // E-Mail darf NICHT im Namen kleben
    expect(timestamp).toContain('01.06.2026');
  });

  it('Name ohne E-Mail in Metazeile (Gmail-Eigenkonto) wird sauber extrahiert', () => {
    const { sender } = parseMetaLine('Am Mi., 10. Juni 2026 um 23:27 Uhr schrieb Jane Doe:');
    expect(sender.name).toBe('Jane Doe');
    expect(sender.email).toBeUndefined();
  });

  it('extrahiert Sender aus englischer Metazeile', () => {
    const { sender } = parseMetaLine('On Mon, Jun 1, 2026 at 9:14 AM Jane Doe <jane@x.com> wrote:');
    expect(sender.email).toBe('jane@x.com');
    expect(sender.name).toBe('Jane Doe');
  });
});

describe('Signatur-Erkennung', () => {
  it('trennt an "--"-Delimiter', () => {
    const { body, signature } = splitSignature('Hallo!\nBis morgen.\n--\nMax Mustermann\nTel.: 030 1234');
    expect(body).toBe('Hallo!\nBis morgen.');
    expect(signature).toContain('Max Mustermann');
  });

  it('erkennt Grußformel + Kontaktblock', () => {
    const { body, signature } = splitSignature(
      'Anbei der Bericht.\n\nMit freundlichen Grüßen\nMax Mustermann\nACME GmbH\nTel.: +49 30 1234',
    );
    expect(body).toBe('Anbei der Bericht.');
    expect(signature).toContain('ACME GmbH');
  });

  it('erkennt Disclaimer', () => {
    const { signature } = splitSignature('Ok!\nThis e-mail and any attachments are confidential.');
    expect(signature).toContain('confidential');
  });

  it('lässt normalen Text unangetastet', () => {
    const { body, signature } = splitSignature('Zeile eins.\nZeile zwei.\nZeile drei.');
    expect(signature).toBeUndefined();
    expect(body).toContain('Zeile drei.');
  });
});

describe('HTML-Thread-Parsing (Gmail-Stil)', () => {
  const html = `
    <div dir="ltr">Klingt gut, machen wir so!</div>
    <div class="gmail_quote">
      <div class="gmail_attr">Am 01.06.2026 um 09:14 schrieb Max Mustermann &lt;max@y.de&gt;:</div>
      <blockquote>
        <div>Können wir das Meeting auf 15 Uhr verschieben?</div>
        <div class="gmail_quote">
          <div class="gmail_attr">On Mon, Jun 1, 2026 at 8:00 AM Jane Doe &lt;jane.doe@gmail.com&gt; wrote:</div>
          <blockquote><div>Hi Max, passt dir 14 Uhr für das Meeting?</div></blockquote>
        </div>
      </blockquote>
    </div>`;

  it('zerlegt verschachtelten Thread in 3 Nachrichten (chronologisch)', () => {
    const msgs = parseThread(html, { ownEmails: ['jane.doe@gmail.com'], ownName: 'Lo' });
    expect(msgs).toHaveLength(3);
    expect(msgs[0]?.bodyText).toContain('passt dir 14 Uhr');
    expect(msgs[1]?.bodyText).toContain('15 Uhr verschieben');
    expect(msgs[2]?.bodyText).toContain('Klingt gut');
  });

  it('ordnet isOwn korrekt zu', () => {
    const msgs = parseThread(html, { ownEmails: ['jane.doe@gmail.com'], ownName: 'Lo' });
    expect(msgs[0]?.isOwn).toBe(true); // älteste: von jane.doe
    expect(msgs[1]?.isOwn).toBe(false); // Max
    expect(msgs[2]?.isOwn).toBe(true); // neueste: eigene Antwort
    expect(msgs[1]?.sender.email).toBe('max@y.de');
  });

  it('entfernt Script-Tags (Sanitizing)', () => {
    const msgs = parseThread('<div>Hi<script>alert(1)</script></div>');
    expect(msgs[0]?.bodyHtml).not.toContain('script');
  });

  it('REGRESSION Newsletter: Inline-Bilder werden NICHT als Anhänge dupliziert', () => {
    // Sie sind bereits in der Bubble sichtbar - echte Anhänge kommen über
    // die Anhang-Karten des Mail-Clients (Adapter-Strategien).
    const msgs = parseThread(
      '<div>Newsletter <img src="https://x/banner.png" alt="Banner" width="600" height="200">' +
        '<img src="https://x/icon.png" width="48" height="48"></div>',
    );
    expect(msgs[0]?.attachments).toHaveLength(0);
    expect(msgs[0]?.bodyHtml).toContain('banner.png'); // bleibt inline erhalten
  });

  it('extrahiert Datei-Links als Anhänge', () => {
    const msgs = parseThread('<div>Hier: <a href="https://x.com/bericht.pdf">Q2-Bericht.pdf</a></div>');
    expect(msgs[0]?.attachments[0]?.kind).toBe('file');
  });
});

describe('REGRESSION Metazeilen-Leak (Gmail packt Meta in denselben Textblock)', () => {
  it('Metazeile wird entfernt und der zitierte Absender korrekt zugeordnet', () => {
    const html =
      '<div>wait<br>höä<br>Am 11.06.26 um 00:13 schrieb Jane Doe &lt;jane.doe@gmail.com&gt;:<br></div>' +
      '<blockquote><div>also wenn ich hier was sende kommt es an</div></blockquote>';
    const msgs = parseThread(html, { ownEmails: [] });
    expect(msgs).toHaveLength(2);
    // Ältere Nachricht: Sender aus der Inline-Metazeile, NICHT "Unbekannt"
    expect(msgs[0]?.sender.name).toBe('Jane Doe');
    expect(msgs[0]?.sender.email).toBe('jane.doe@gmail.com');
    // Neuere Nachricht: Metazeile darf NICHT im Body kleben
    expect(msgs[1]?.bodyText).toContain('höä');
    expect(msgs[1]?.bodyText).not.toContain('schrieb');
    expect(msgs[1]?.bodyHtml).not.toContain('schrieb');
  });
});

describe('Plain-Text-Thread-Parsing', () => {
  it('zerlegt ">"-zitierten Text', () => {
    const text = [
      'Klingt gut!',
      '',
      'Am 01.06.2026 um 09:14 schrieb Max Mustermann <max@y.de>:',
      '> Können wir auf 15 Uhr verschieben?',
      '>',
      '> On Mon, Jun 1, 2026 at 8:00 AM Jane <jane.doe@gmail.com> wrote:',
      '> > Passt dir 14 Uhr?',
    ].join('\n');
    const msgs = parseThread(text, { ownEmails: ['jane.doe@gmail.com'] });
    expect(msgs).toHaveLength(3);
    expect(msgs[0]?.bodyText).toContain('14 Uhr');
    expect(msgs[2]?.bodyText).toContain('Klingt gut');
    expect(msgs[2]?.isOwn).toBe(true);
    expect(msgs[1]?.sender.email).toBe('max@y.de');
  });

  // Browser-Ziel: <50ms (nativer DOMParser, gemessen sub-ms bei 444 Nodes).
  // happy-dom ist 50–100x langsamer + Testdateien laufen parallel (CPU-Contention),
  // daher hier 150ms-Budget mit Best-of-3. Der eigentliche Schutz vor Regressionen
  // ist der O(n)-Algorithmus (destruktives Splitting statt Klonen, Single-Pass-Traversierung).
  it('Performance: 100+ Nachrichten in < 150ms (happy-dom-Budget, Browser-Ziel <50ms)', () => {
    let html = '<div>Nachricht 0</div>';
    for (let i = 1; i <= 110; i++) {
      html = `<div>Nachricht ${i}</div><div class="gmail_quote"><div class="gmail_attr">On Mon, Jun 1, 2026 at 9:00 AM P${i} &lt;p${i}@x.com&gt; wrote:</div><blockquote>${html}</blockquote></div>`;
    }
    parseThread(html); // Warmup (JIT) - gemessen wird Steady-State
    // Best-of-3: eliminiert Scheduler-Rauschen der Testumgebung
    let best = Infinity;
    let msgs: ReturnType<typeof parseThread> = [];
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      msgs = parseThread(html);
      best = Math.min(best, performance.now() - t0);
    }
    expect(msgs.length).toBeGreaterThan(100);
    expect(best).toBeLessThan(150);
  });
});

describe('Outlook-Antwort-Zitat ohne blockquote (Live-Bug Beratung-Thread)', () => {
  it('schneidet den zitierten Verlauf aus bodyText UND bodyHtml', () => {
    const html =
      '<div>Sehr geehrter Herr Delleske, vielen Dank fuer Ihre Mail.</div><div><br></div>' +
      '<div>Von: Lo Delle &lt;lo@x.de&gt;<br>Gesendet: Montag, 22. Juni 2026 08:00<br>' +
      'An: Beratung<br>Betreff: Test</div>' +
      '<div>Guten Tag, hier mein urspruengliches Anliegen. Beste Gruesse Lukas</div>';
    const msgs = parseThread(html, { languages: ['de'] });
    const m = msgs[msgs.length - 1]!;
    expect(m.bodyText).toContain('Sehr geehrter Herr Delleske');
    // Der zitierte Teil darf weder im Text noch im gerenderten HTML auftauchen.
    expect(m.bodyText).not.toMatch(/Von:|Gesendet:|Betreff:|urspruengliches Anliegen/);
    expect(m.bodyHtml).not.toMatch(/Von:|Gesendet:|Betreff:|urspruengliches Anliegen/);
  });

  it('entfernt Gmails "Nachricht gekuerzt"-Clip aus Text und HTML', () => {
    const html =
      '<div>Kurzer Nachrichtentext.</div>' +
      '<div>[Nachricht gekürzt] <a href="https://mail.google.com/x">Vollständige Nachricht ansehen</a></div>';
    const msgs = parseThread(html, { languages: ['de'] });
    const m = msgs[msgs.length - 1]!;
    expect(m.bodyText).toContain('Kurzer Nachrichtentext');
    expect(m.bodyText).not.toMatch(/gekürzt|Vollständige Nachricht/i);
    expect(m.bodyHtml).not.toMatch(/gekürzt|Vollständige Nachricht/i);
  });
});
