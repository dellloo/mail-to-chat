import { describe, expect, it } from 'vitest';
import { THEMES } from '../src/index';

/**
 * Lesbarkeits-Garantie: Text-auf-Bubble-Kontrast aller vordefinierten Themes
 * nach WCAG-Luminanzformel. Faengt kuenftige Theme-Fehler automatisch ab
 * (z. B. dunkler Text auf dunkler Bubble).
 */

function luminance(hex: string): number | null {
  const m = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(m)) return null;
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = channel(parseInt(m.slice(0, 2), 16));
  const g = channel(parseInt(m.slice(2, 4), 16));
  const b = channel(parseInt(m.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null; // Gradient/inherit/transparent: nicht pruefbar
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('Theme-Kontrast (WCAG, mind. 3:1 fuer Bubble-Text)', () => {
  for (const t of THEMES) {
    if (t.minimal) continue; // Minimal erbt die Umgebungsfarbe (eigener Mechanismus)
    it(`${t.label}: eigener und fremder Bubble-Text lesbar`, () => {
      const own = contrast(t.ownBubble, t.ownText);
      const other = contrast(t.otherBubble, t.otherText);
      if (own !== null) expect(own, `ownText auf ownBubble bei ${t.id}`).toBeGreaterThanOrEqual(3);
      if (other !== null) expect(other, `otherText auf otherBubble bei ${t.id}`).toBeGreaterThanOrEqual(3);
    });
  }

  it('Minimal-Theme: Meta-Farbe folgt der Umgebung (color-mix auf currentColor)', async () => {
    const { buildCss, DEFAULT_SETTINGS } = await import('../src/index');
    const css = buildCss({ ...DEFAULT_SETTINGS, themeId: 'minimal' });
    expect(css).toContain('color-mix(in srgb, currentColor');
    expect(css).toContain('color: inherit'); // :host vererbt Gmail-Textfarbe
  });
});
