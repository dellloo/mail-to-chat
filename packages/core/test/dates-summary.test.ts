import { describe, expect, it } from 'vitest';
import { dayKey, dayLabel, parseMailDate } from '../src/index';

describe('parseMailDate', () => {
  it('parst deutsche Formate', () => {
    expect(parseMailDate('Mi., 10. Juni 2026 um 23:27 Uhr')?.getDate()).toBe(10);
    expect(parseMailDate('10.06.26 um 23:28')?.getFullYear()).toBe(2026);
    expect(parseMailDate('01.06.2026')?.getMonth()).toBe(5);
  });

  it('parst englische Formate', () => {
    expect(parseMailDate('Mon, Jun 1, 2026 at 9:14 AM')?.getDate()).toBe(1);
    expect(parseMailDate('1 Jun 2026')?.getMonth()).toBe(5);
  });

  it('REGRESSION Jahr-2001-Bug: fehlendes Jahr → aktuelles Jahr, nie V8-Default 2001', () => {
    const now = new Date(2026, 5, 11);
    // Gmail lässt das Jahr im aktuellen Jahr weg
    expect(parseMailDate('Mi., 10. Juni, 01:23 Uhr', now)?.getFullYear()).toBe(2026);
    expect(parseMailDate('10. Juni um 01:23', now)?.getFullYear()).toBe(2026);
    expect(parseMailDate('Jun 10, 01:23 AM', now)?.getFullYear()).toBe(2026);
    expect(parseMailDate('10 Jun 01:23', now)?.getFullYear()).toBe(2026);
    // Explizites Jahr bleibt natürlich erhalten
    expect(parseMailDate('10. Juni 2024', now)?.getFullYear()).toBe(2024);
  });

  it('gibt null bei unparsbaren Strings zurück (sanfte Degradation)', () => {
    expect(parseMailDate('vor 2 Minuten')).toBeNull();
    expect(parseMailDate('23:31')).toBeNull();
    expect(parseMailDate(undefined)).toBeNull();
    expect(parseMailDate('99.99.2026')).toBeNull();
  });

  it('dayKey gruppiert nach Kalendertag', () => {
    expect(dayKey(new Date(2026, 5, 10, 1))).toBe(dayKey(new Date(2026, 5, 10, 23)));
    expect(dayKey(new Date(2026, 5, 10))).not.toBe(dayKey(new Date(2026, 5, 11)));
  });

  it('dayLabel: Heute/Gestern/Datum', () => {
    const now = new Date(2026, 5, 11);
    expect(dayLabel(new Date(2026, 5, 11), 'de', now)).toBe('Heute');
    expect(dayLabel(new Date(2026, 5, 10), 'de', now)).toBe('Gestern');
    expect(dayLabel(new Date(2026, 5, 11), 'en', now)).toBe('Today');
    expect(dayLabel(new Date(2026, 5, 1), 'de', now)).toContain('2026');
  });
});

