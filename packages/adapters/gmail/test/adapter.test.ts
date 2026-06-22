import { describe, expect, it, vi, afterEach } from 'vitest';
import type { MessageObject } from '@chatmail/core';
import { parseDownloadUrl, upscaleGmailThumb, fullSizeGmailThumb, getThreadId, reconstructSingleMailHistory } from '../src/index';

const mkMsg = (over: Partial<MessageObject> = {}): MessageObject => ({
  sender: { name: 'X', email: 'x@y.de' },
  bodyHtml: 'hi', bodyText: 'hi', attachments: [], isOwn: false, ...over,
});

describe('reconstructSingleMailHistory (Option A — Einzel-Mail-Historie)', () => {
  it('rekonstruiert Bubbles bei sicherem Absender pro Ebene; neueste = echter Node', () => {
    const older1 = mkMsg({ sender: { name: 'Hama Onlineshop', email: 's@hama.de' }, bodyText: 'logo', bodyHtml: 'logo' });
    const older2 = mkMsg({ sender: { name: 'Lo Delle', email: 'lo@x.de' }, bodyText: 'damke', bodyHtml: 'damke', isOwn: true });
    const top = mkMsg({ sender: { name: 'Hama Kundenservice', email: 'ks@hama.de' }, bodyText: 'danke', bodyHtml: 'danke' });
    const out = reconstructSingleMailHistory(top, [older1, older2, top]);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(3);
    expect(out![2]).toBe(top); // echter Gmail-Node bleibt die neueste Bubble
    expect(out![1]?.isOwn).toBe(true); // eigene Mail → rechte Seite
  });

  it('Failsafe: null bei unsicherem Absender (Unbekannt ohne E-Mail)', () => {
    const bad = mkMsg({ sender: { name: 'Unbekannt' }, bodyText: 'x', bodyHtml: 'x' });
    expect(reconstructSingleMailHistory(mkMsg(), [bad, mkMsg()])).toBeNull();
  });

  it('null ohne zitierten Verlauf (<2 Ebenen)', () => {
    expect(reconstructSingleMailHistory(mkMsg(), [mkMsg()])).toBeNull();
  });

  it('null wenn eine ältere Ebene keinen Inhalt hat', () => {
    const empty = mkMsg({ sender: { name: 'A', email: 'a@b.de' }, bodyText: '   ', bodyHtml: '' });
    expect(reconstructSingleMailHistory(mkMsg(), [empty, mkMsg()])).toBeNull();
  });

  it('akzeptiert Ebene mit Name aber ohne E-Mail (sicherer Name reicht)', () => {
    const named = mkMsg({ sender: { name: 'Marjan' }, bodyText: 'hallo', bodyHtml: 'hallo' });
    const out = reconstructSingleMailHistory(mkMsg(), [named, mkMsg()]);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(2);
  });
});

describe('Gmail-Anhang-Karten', () => {
  it('parst download_url (mime:name:url - URL enthält selbst ":")', () => {
    const att = parseDownloadUrl(
      'application/pdf:Q2-Bericht.pdf:https://mail.google.com/mail/u/0/?ui=2&attid=0.1',
    );
    expect(att?.kind).toBe('file');
    expect(att?.name).toBe('Q2-Bericht.pdf');
    expect(att?.url).toBe('https://mail.google.com/mail/u/0/?ui=2&attid=0.1');
  });

  it('erkennt Bilder am MIME-Type', () => {
    const att = parseDownloadUrl('image/jpeg:foto.jpg:https://mail.google.com/x');
    expect(att?.kind).toBe('image');
  });

  it('gibt null bei kaputtem Format zurück', () => {
    expect(parseDownloadUrl('keinformat')).toBeNull();
    expect(parseDownloadUrl('')).toBeNull();
  });

  it('skaliert Gmail-Thumbnails hoch — ERSETZT DEN GANZEN sz-Wert (Regressionsschutz)', () => {
    // Realer Gmail-Anhang-sz-Wert. Der frühere Teilersatz ließ "-p-nu" stehen
    // → "sz=w1600-p-nu" → Gmail lehnt ab (live verifiziert FAIL). Muss komplett
    // ersetzt werden, ohne den nachfolgenden Parameter zu fressen.
    const real = upscaleGmailThumb('https://mail.google.com/?view=fimg&sz=w360-h240-p-nu&attid=0.1');
    expect(real).toContain('sz=w1600-h1600');
    expect(real).not.toContain('-p-nu'); // keine Rest-Flags → wäre ungültig
    expect(real).toContain('&attid=0.1'); // Folgeparameter unangetastet
    expect(upscaleGmailThumb('https://mail.google.com/x?sz=w200')).toContain('sz=w1600-h1600');
    // URLs ohne sz-Parameter bleiben unverändert
    expect(upscaleGmailThumb('https://mail.google.com/x?view=fimg')).toBe('https://mail.google.com/x?view=fimg');
  });

  it('fullSizeGmailThumb liefert Originalgröße (sz=s0) für „Original öffnen"', () => {
    const full = fullSizeGmailThumb('https://mail.google.com/?view=fimg&sz=w360-h240-p-nu&attid=0.1');
    expect(full).toContain('sz=s0');
    expect(full).not.toContain('-p-nu');
    expect(full).toContain('&attid=0.1');
  });
});

describe('getThreadId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockHash = (hash: string): void => {
    vi.spyOn(globalThis, 'location', 'get').mockReturnValue({ hash } as Location);
  };

  it('extrahiert Thread-ID aus #inbox/hex16', () => {
    mockHash('#inbox/18f8d3a2b5c6e7f8');
    expect(getThreadId()).toBe('18f8d3a2b5c6e7f8');
  });

  it('extrahiert Thread-ID aus #label/Name/hex16', () => {
    mockHash('#label/Work/a1b2c3d4e5f60718');
    expect(getThreadId()).toBe('a1b2c3d4e5f60718');
  });

  it('extrahiert Thread-ID aus #sent/hex16', () => {
    mockHash('#sent/deadbeef01234567');
    expect(getThreadId()).toBe('deadbeef01234567');
  });

  it('gibt null zurück wenn kein Thread offen (nur Inbox)', () => {
    mockHash('#inbox');
    expect(getThreadId()).toBeNull();
  });

  it('gibt null zurück bei leerem Hash', () => {
    mockHash('');
    expect(getThreadId()).toBeNull();
  });

  it('gibt null zurück bei zu kurzem Hash-Segment', () => {
    mockHash('#inbox/abc123');
    expect(getThreadId()).toBeNull();
  });

  it('gibt null zurück wenn Hash-Segment Nicht-Hex enthält', () => {
    mockHash('#inbox/18f8d3a2b5c6e7fg'); // 'g' ist kein Hex
    expect(getThreadId()).toBeNull();
  });

  it('gibt null zurück bei 17-stelligem Segment (zu lang)', () => {
    mockHash('#inbox/18f8d3a2b5c6e7f89'); // 17 Zeichen
    expect(getThreadId()).toBeNull();
  });
});
