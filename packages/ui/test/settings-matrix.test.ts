import { describe, expect, it } from 'vitest';
import type { MessageObject } from '@chatmail/core';
import { buildCss, createChatView, DEFAULT_SETTINGS, renderMessages, THEMES, type ChatSettings } from '../src/index';

/**
 * Settings-Matrix: JEDE Kombination von Einstellungen muss eine valide,
 * nicht-leere Chat-Ansicht erzeugen - egal was der Nutzer verstellt.
 * Schutz gegen "Einstellung X zerschießt Ansicht Y".
 */

const MESSAGES: MessageObject[] = [
  {
    sender: { name: 'Max Mustermann', email: 'max@y.de' },
    timestamp: 'Mi., 10. Juni 2026 um 09:14 Uhr',
    bodyHtml: '<div style="color:#202124;background:#fff">Newsletter-HTML <a href="https://x.de">Link</a></div>',
    bodyText: 'Newsletter-HTML Link',
    signatureHtml: 'Max<br>ACME GmbH',
    attachments: [
      { kind: 'image', name: 'foto.jpg', url: 'https://x/im.png' },
      { kind: 'file', name: 'bericht.pdf', url: 'https://x/b.pdf' },
    ],
    isOwn: false,
  },
  {
    sender: { name: 'Lo' },
    timestamp: '11.06.2026, 10:00',
    bodyHtml: 'Passt! 👍',
    bodyText: 'Passt! 👍',
    attachments: [],
    isOwn: true,
  },
  {
    sender: { name: 'Anna Beispiel', email: 'anna@z.de' },
    timestamp: undefined, // fehlender Zeitstempel darf nie crashen
    bodyHtml: 'Dritte Person (Gruppen-Pfad)',
    bodyText: 'Dritte Person',
    attachments: [],
    isOwn: false,
  },
];

const themeIds = [...THEMES.map((t) => t.id), 'custom'];
const fontSizes: ChatSettings['fontSize'][] = ['small', 'normal', 'large'];
const timestamps: ChatSettings['timestamps'][] = ['always', 'hover', 'hidden'];
const bools = [true, false];

describe('Settings-Matrix (keine Kombination zerschießt die Ansicht)', () => {
  it(`alle ${themeIds.length * fontSizes.length * timestamps.length * 8} Kombinationen rendern fehlerfrei`, () => {
    let combos = 0;
    for (const themeId of themeIds) {
      for (const fontSize of fontSizes) {
        for (const ts of timestamps) {
          for (const filterSignatures of bools) {
            for (const showAttachments of bools) {
              for (const showDateSeparators of bools) {
                                  const settings: ChatSettings = {
                    ...DEFAULT_SETTINGS,
                    themeId,
                    fontSize,
                    timestamps: ts,
                    filterSignatures,
                    showAttachments,
                    showDateSeparators,
                  };
                  const css = buildCss(settings);
                  const html = renderMessages(MESSAGES, settings);
                  // Grundinvarianten
                  expect(css).toContain('--cm-own-bubble');
                  expect(html).toContain('cm-bubble');
                  expect(html).toContain('cm-row own');
                  expect(html).toContain('cm-row other');
                  expect(html).not.toContain('<script');
                  expect(html).not.toContain('undefined<');
                  // Settings-Wirkung
                  if (!showAttachments) expect(html).not.toContain('cm-att-');
                  if (ts === 'hidden') expect(html).toContain('ts-hidden');
                  combos++;
                }
              }
            }
          }
        }
      }
    expect(combos).toBe(themeIds.length * fontSizes.length * timestamps.length * 8);
  });

  it('createChatView funktioniert mit Extrem-Settings (custom dunkel, alles aus / alles an)', () => {
    const extremes: Partial<ChatSettings>[] = [
      {
        themeId: 'custom',
        custom: { ownBubble: '#000000', ownText: '#ffffff', otherBubble: '#111111', otherText: '#eeeeee', background: '#000000', radius: 0 },
        filterSignatures: false, showAttachments: false, showDateSeparators: false, timestamps: 'hidden', fontSize: 'small', uiLanguage: 'en',
      },
      {
        themeId: 'minimal',
        filterSignatures: true, showAttachments: true, showDateSeparators: true, timestamps: 'hover', fontSize: 'large', uiLanguage: 'de',
      },
    ];
    for (const over of extremes) {
      const view = createChatView(MESSAGES, { ...DEFAULT_SETTINGS, ...over } as ChatSettings, {
        onSend: async () => true,
        onReplyTo: () => {},
        onForward: () => {},
      });
      const shadow = view.shadowRoot!;
      expect(shadow.querySelectorAll('.cm-bubble').length).toBe(3);
      expect(shadow.querySelector('.cm-composer')).not.toBeNull();
      expect(shadow.querySelector('.cm-lb')).not.toBeNull();
    }
  });

  it('leerer Thread und Nachricht ohne alles crashen nicht', () => {
    expect(renderMessages([], DEFAULT_SETTINGS)).toContain('cm-chat');
    const bare: MessageObject = { sender: { name: '' }, bodyHtml: '', bodyText: '', attachments: [], isOwn: false };
    const html = renderMessages([bare], DEFAULT_SETTINGS);
    expect(html).toContain('cm-bubble');
  });
});
