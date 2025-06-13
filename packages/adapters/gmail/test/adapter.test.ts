import { describe, expect, it } from 'vitest';
import { parseDownloadUrl, upscaleGmailThumb } from '../src/index';

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

  it('skaliert Gmail-Thumbnails hoch (sz=w360-h240 → w1600)', () => {
    expect(upscaleGmailThumb('https://mail.google.com/mail/u/0/?view=fimg&sz=w360-h240&attid=0.1')).toContain(
      'sz=w1600',
    );
    expect(upscaleGmailThumb('https://mail.google.com/x?sz=w200')).toContain('sz=w1600');
    // URLs ohne sz-Parameter bleiben unverändert
    expect(upscaleGmailThumb('https://mail.google.com/x?view=fimg')).toBe('https://mail.google.com/x?view=fimg');
  });
});
