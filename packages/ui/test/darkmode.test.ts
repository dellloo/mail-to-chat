import { describe, expect, it } from 'vitest';
import type { MessageObject } from '@chatmail/core';
import { buildCss, DEFAULT_SETTINGS, isDarkColor, renderMessages } from '../src/index';

const msg: MessageObject = {
  sender: { name: 'Max' },
  bodyHtml: '<div style="color:#202124;background:#ffffff">Newsletter</div>',
  bodyText: 'Newsletter',
  attachments: [],
  isOwn: false,
};

describe('Dark-Mode-Härtung', () => {
  it('isDarkColor erkennt dunkle und helle Farben', () => {
    expect(isDarkColor('#000000')).toBe(true);
    expect(isDarkColor('#36393F')).toBe(true);
    expect(isDarkColor('#ffffff')).toBe(false);
    expect(isDarkColor('#E5DDD5')).toBe(false);
    expect(isDarkColor('transparent')).toBe(false); // ungültig → sicher hell
  });

  it('dunkle Themes bekommen die dark-Klasse, helle nicht', () => {
    expect(renderMessages([msg], { ...DEFAULT_SETTINGS, themeId: 'imessage-dark' })).toContain('dark');
    expect(renderMessages([msg], { ...DEFAULT_SETTINGS, themeId: 'discord' })).toContain('dark');
    expect(renderMessages([msg], { ...DEFAULT_SETTINGS, themeId: 'whatsapp' })).not.toContain('cm-chat ts-always dark');
  });

  it('Custom-Theme mit dunklem Hintergrund wird als dark erkannt (Redundanz)', () => {
    const darkCustom = {
      ...DEFAULT_SETTINGS,
      themeId: 'custom',
      custom: { ...DEFAULT_SETTINGS.custom, background: '#101216' },
    };
    expect(renderMessages([msg], darkCustom)).toContain('dark');
  });

  it('REGRESSION: Theme-Variablen auch auf :host (Kontaktkarte/Lightbox liegen außerhalb von .cm-chat)', () => {
    for (const themeId of ['whatsapp', 'imessage-dark', 'custom']) {
      const css = buildCss({ ...DEFAULT_SETTINGS, themeId });
      expect(css).toContain(':host, .cm-chat {');
      // --cm-card-bg muss im :host-Scope definiert sein, nicht nur in .cm-chat
      const hostBlock = css.split(':host, .cm-chat {')[1]?.split('}')[0] ?? '';
      expect(hostBlock).toContain('--cm-card-bg');
      expect(hostBlock).toContain('--cm-input-text');
    }
  });

  it('CSS neutralisiert Inline-Farben der Original-Mail in dunklen Themes', () => {
    const css = buildCss({ ...DEFAULT_SETTINGS, themeId: 'imessage-dark' });
    expect(css).toContain('.cm-chat.dark .cm-body');
    expect(css).toContain('color: var(--cm-other-text) !important');
    expect(css).toContain('background: transparent !important');
  });
});
