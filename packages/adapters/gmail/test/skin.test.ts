import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@chatmail/ui';
import { applySkin, buildSkinCss } from '../src/skin';

const skin = { ...DEFAULT_SETTINGS.gmailSkin, enabled: true };

describe('Gmail-Skin-Engine', () => {
  it('baut CSS mit allen konfigurierten Werten', () => {
    const css = buildSkinCss({ ...skin, accent: '#ff00aa', bg: '#000000', radius: 7 });
    expect(css).toContain('#ff00aa');
    expect(css).toContain('#000000');
    expect(css).toContain('border-radius: 7px');
  });

  it('Font nur wenn gesetzt, Compact nur wenn aktiv', () => {
    expect(buildSkinCss({ ...skin, font: '' })).not.toContain('font-family');
    expect(buildSkinCss({ ...skin, font: 'Georgia' })).toContain('Georgia');
    expect(buildSkinCss({ ...skin, compact: false })).not.toContain('height: 28px');
    expect(buildSkinCss({ ...skin, compact: true })).toContain('height: 28px');
  });

  it('Flair: Pride erzeugt Regenbogen-CSS, Paws das Tier-Muster, none nichts davon', () => {
    const pride = buildSkinCss({ ...skin, flair: 'pride' });
    expect(pride).toContain('#e40303'); // Regenbogen-Gradient
    expect(pride).toContain('body::before');
    const paws = buildSkinCss({ ...skin, flair: 'paws' });
    expect(paws).toContain('%F0%9F%90%BE'); // 🐾 im SVG-Muster
    const none = buildSkinCss({ ...skin, flair: 'none' });
    expect(none).not.toContain('#e40303');
    expect(none).not.toContain('%F0%9F%90%BE');
  });

  it('applySkin injiziert Style-Tag und entfernt ihn bei disabled', () => {
    applySkin({ ...DEFAULT_SETTINGS, gmailSkin: skin });
    expect(document.getElementById('chatmail-skin')).not.toBeNull();
    expect(document.documentElement.classList.contains('cm-skin')).toBe(true);

    applySkin({ ...DEFAULT_SETTINGS, gmailSkin: { ...skin, enabled: false } });
    expect(document.getElementById('chatmail-skin')).toBeNull();
    expect(document.documentElement.classList.contains('cm-skin')).toBe(false);
  });
});
