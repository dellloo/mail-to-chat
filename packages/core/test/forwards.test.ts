import { describe, expect, it } from 'vitest';
import { detectForward, stripReplyQuote } from '../src/forwards';
import { parseThread } from '../src/parser';
import { splitSignature } from '../src/signature';

describe('stripReplyQuote (flat-text Zitate abschneiden)', () => {
  it('schneidet ab "Am … schrieb …:" ab', () => {
    const t = 'Danke dir!\n\nAm 18.06.2026 um 09:36 schrieb Marjan <m@x.de>:\n\n> alter text';
    expect(stripReplyQuote(t)).toBe('Danke dir!');
  });
  it('schneidet Outlook-Header (Von/Gesendet/An/Betreff) ab', () => {
    const t = 'Neue Nachricht.\n\nVon: Lo Delle <lo@x.de>\nGesendet: Montag\nAn: Marjan\nBetreff: Re: Test\n\nalter inhalt';
    expect(stripReplyQuote(t)).toBe('Neue Nachricht.');
  });
  it('entfernt die Gmail-Hinweiszeile "Sie erhalten nicht häufig…"', () => {
    const t = 'Hallo,\nSie erhalten nicht häufig E-Mails von x@y.de.\nWie gehts?';
    expect(stripReplyQuote(t)).toBe('Hallo,\nWie gehts?');
  });
  it('lässt eine normale Nachricht unangetastet', () => {
    expect(stripReplyQuote('Nur ein Text\nmit zwei Zeilen.')).toBe('Nur ein Text\nmit zwei Zeilen.');
  });
});

describe('Signatur: lange Firmen-Signatur vollständig einklappen', () => {
  it('klappt ab "Mit freundlichen Grüßen" inkl. Kontakt/Recht ein', () => {
    const text = [
      'Hallo Lorenzo,',
      'kümmere mich gerne darum.',
      'Mit freundlichen Grüßen',
      'Marjan Milosevic',
      'Caritasverband der Erzdiözese München',
      'Mobil: 0151 50 65 73 92',
      'Fax: 089 992490729',
      'Email: Marjan.Milosevic@caritasmuenchen.org',
    ].join('\n');
    const { body, signature } = splitSignature(text);
    expect(body).toContain('kümmere mich gerne');
    expect(body).not.toContain('Mit freundlichen Grüßen');
    expect(body).not.toContain('Mobil');
    expect(signature).toContain('Marjan Milosevic');
    expect(signature).toContain('Email: Marjan');
  });
  it('kurzer persönlicher Gruß bleibt im Body', () => {
    const { body, signature } = splitSignature('Danke!\nLiebe Grüße\nLorenzo');
    expect(body).toContain('Liebe Grüße');
    expect(signature).toBeUndefined();
  });
});

describe('detectForward', () => {
  it('gibt null zurück ohne Forward-Marker', () => {
    expect(detectForward('Hallo,\n\nnur eine normale Nachricht.\n\nGruß')).toBeNull();
  });

  it('erkennt Apple/iOS-Marker und trennt den Body korrekt', () => {
    const text = [
      'Hallo Marjan,',
      '',
      'Lorenzo hier, kannst du helfen?',
      '',
      'Liebe Grüße',
      'Lorenzo',
      '',
      'Anfang der weitergeleiteten Nachricht:',
      '',
      'Von: Münchner Wochenanzeiger <info@mwa.de>',
      'Betreff: Ihr Interesse als Zeitungszusteller',
      'Datum: 18.06.2026',
      '',
      'Sehr geehrter Herr Aldoski, herzlichen Dank für Ihr Interesse.',
    ].join('\n');
    const r = detectForward(text);
    expect(r).not.toBeNull();
    expect(r!.before).toContain('Hallo Marjan');
    expect(r!.before).not.toContain('Sehr geehrter');
    expect(r!.forward.sender).toBe('Münchner Wochenanzeiger');
    expect(r!.forward.subject).toBe('Ihr Interesse als Zeitungszusteller');
    expect(r!.forward.date).toBe('18.06.2026');
    expect(r!.forward.body).toContain('Sehr geehrter Herr Aldoski');
    // Vorschau enthält Betreff + ersten Satz
    expect(r!.forward.preview).toContain('Ihr Interesse als Zeitungszusteller');
  });

  it('erkennt Gmail-Marker mit Bindestrichen', () => {
    const text =
      'Schau mal:\n\n---------- Forwarded message ----------\nFrom: Jane <jane@x.com>\nSubject: Hi\n\nInhalt der Mail.';
    const r = detectForward(text);
    expect(r).not.toBeNull();
    expect(r!.before).toBe('Schau mal:');
    expect(r!.forward.sender).toBe('Jane');
    expect(r!.forward.subject).toBe('Hi');
    expect(r!.forward.body).toBe('Inhalt der Mail.');
  });

  it('erkennt Outlook-Marker (Ursprüngliche Nachricht)', () => {
    const text = 'FYI\n\n-----Ursprüngliche Nachricht-----\nVon: Max\nBetreff: Test\n\nText.';
    const r = detectForward(text);
    expect(r).not.toBeNull();
    expect(r!.forward.subject).toBe('Test');
  });

  it('löst keinen Fehlalarm bei normalem Text mit dem Wort "Nachricht" aus', () => {
    expect(detectForward('Deine Nachricht war super, danke!')).toBeNull();
  });
});

describe('parseThread + Forward', () => {
  it('legt forwarded an und hält die Hauptnachricht sauber', () => {
    const html =
      '<div>Hallo Marjan,<br><br>kannst du helfen?<br><br>Liebe Grüße<br>Lorenzo<br><br>' +
      'Anfang der weitergeleiteten Nachricht:<br><br>Von: Wochenanzeiger &lt;info@mwa.de&gt;<br>' +
      'Betreff: Zeitungszusteller<br><br>Sehr geehrter Herr Aldoski, danke für Ihr Interesse.</div>';
    const msgs = parseThread(html, { ownName: 'Lorenzo' });
    expect(msgs.length).toBe(1);
    const m = msgs[0]!;
    expect(m.forwarded).toBeTruthy();
    expect(m.forwarded!.subject).toBe('Zeitungszusteller');
    // Hauptbubble enthält NICHT den weitergeleiteten Inhalt
    expect(m.bodyText).toContain('kannst du helfen');
    expect(m.bodyText).not.toContain('Sehr geehrter Herr Aldoski');
    // Forward-HTML enthält den Inhalt
    expect(m.forwarded!.bodyHtml).toContain('Sehr geehrter Herr Aldoski');
  });
});
