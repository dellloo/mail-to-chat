import { describe, expect, it } from 'vitest';
import type { MessageObject } from '@chatmail/core';
import { DEFAULT_SETTINGS, renderMessages, buildCss, THEMES } from '../src/index';

const msg = (over: Partial<MessageObject>): MessageObject => ({
  sender: { name: 'Max', email: 'max@y.de' },
  bodyHtml: 'Hallo',
  bodyText: 'Hallo',
  attachments: [],
  isOwn: false,
  ...over,
});

describe('UI-Renderer', () => {
  it('rendert eigene Nachrichten rechts, fremde links', () => {
    const html = renderMessages([msg({ isOwn: true }), msg({ isOwn: false })], DEFAULT_SETTINGS);
    expect(html).toContain('cm-row own');
    expect(html).toContain('cm-row other');
  });

  it('zeigt Sendernamen in Gruppen, Avatar im 1:1 (wie WhatsApp)', () => {
    // 1:1 → kein Name (Avatar reicht), aber Avatar mit Initialen
    const single = renderMessages([msg({ isOwn: false, sender: { name: 'Max M' } })], DEFAULT_SETTINGS);
    expect(single).not.toContain('class="cm-sender"');
    expect(single).toContain('cm-avatar');
    // Gruppe (2+ fremde Sender) → Namen sichtbar
    const group = renderMessages(
      [
        msg({ sender: { name: 'Max M', email: 'max@x.de' } }),
        msg({ sender: { name: 'Anna B', email: 'anna@x.de' } }),
      ],
      DEFAULT_SETTINGS,
    );
    expect(group).toContain('Max M');
    expect(group).toContain('Anna B');
    // Eigene Nachrichten: nie Name/Avatar
    const own = renderMessages([msg({ isOwn: true, sender: { name: 'Ich selbst' } })], DEFAULT_SETTINGS);
    expect(own).not.toContain('class="cm-sender"');
    expect(own).not.toContain('cm-avatar');
  });

  it('klappt Signaturen ein — Toggle oben UND Einklappen unten', () => {
    const html = renderMessages([msg({ signatureHtml: 'Max M<br>ACME GmbH' })], DEFAULT_SETTINGS);
    expect(html).toContain('class="cm-sig"');
    expect(html).toContain('cm-sig-toggle'); // Bedienelement oben
    expect(html).toContain('cm-sig-collapse'); // Einklappen unten
    expect(html).toContain('Signatur anzeigen');
    expect(html).toContain('Signatur ausblenden');
  });

  it('rendert Bild-Anhänge als Thumbnails und Dateien als Chips', () => {
    const html = renderMessages(
      [msg({ attachments: [
        { kind: 'image', name: 'Foto', url: 'https://x/im.png' },
        { kind: 'file', name: 'bericht.pdf', url: 'https://x/bericht.pdf' },
      ] })],
      DEFAULT_SETTINGS,
    );
    expect(html).toContain('cm-att-img');
    expect(html).toContain('cm-att-chip');
    expect(html).toContain('bericht.pdf');
  });

  it('vergibt Gruppenfarben bei mehreren Gesprächspartnern', () => {
    const html = renderMessages(
      [
        msg({ sender: { name: 'A', email: 'a@x.de' } }),
        msg({ sender: { name: 'B', email: 'b@x.de' } }),
      ],
      DEFAULT_SETTINGS,
    );
    expect(html).toContain('--cm-sender-color');
  });

  it('gruppiert aufeinanderfolgende Nachrichten desselben Absenders (Messenger-Pattern)', () => {
    const m = (body: string): MessageObject =>
      msg({ sender: { name: 'Max M', email: 'max@y.de' }, bodyHtml: body, bodyText: body });
    const html = renderMessages(
      [m('eins'), m('zwei'), m('drei'), msg({ isOwn: true, sender: { name: 'Ich' } })],
      { ...DEFAULT_SETTINGS, showDateSeparators: false },
    );
    expect(html).toContain('grp-start');
    expect(html).toContain('grp-mid');
    expect(html).toContain('grp-end');
    expect(html).toContain('grp-solo'); // eigene Einzelnachricht
    // Avatar nur am Gruppenende, davor Spacer für die Ausrichtung
    expect(html.match(/class="cm-avatar"/g)).toHaveLength(1);
    expect(html.match(/cm-avatar-spacer/g)).toHaveLength(2);
  });

  it('Bubble-Tails nur an Gruppenenden (CSS vorhanden)', () => {
    const css = buildCss(DEFAULT_SETTINGS);
    expect(css).toContain('.cm-row.own.grp-end .cm-bubble::after');
    expect(css).toContain('clip-path');
    expect(css).toContain('background: inherit');
  });

  it('escaped Sendernamen (XSS)', () => {
    const html = renderMessages([msg({ sender: { name: '<img src=x onerror=alert(1)>' } })], DEFAULT_SETTINGS);
    expect(html).not.toContain('<img src=x');
  });

  it('alle 12 vordefinierten Themes erzeugen valides CSS', () => {
    expect(THEMES).toHaveLength(12);
    for (const t of THEMES) {
      const css = buildCss({ ...DEFAULT_SETTINGS, themeId: t.id });
      expect(css).toContain('--cm-own-bubble');
      expect(css).toContain(t.background === 'transparent' ? 'transparent' : t.background);
    }
  });

  it('Custom-Theme nutzt die konfigurierten Farben', () => {
    const css = buildCss({
      ...DEFAULT_SETTINGS,
      themeId: 'custom',
      custom: { ...DEFAULT_SETTINGS.custom, ownBubble: '#ff00aa' },
    });
    expect(css).toContain('#ff00aa');
  });

  it('Zeitstempel-Modi setzen die richtige Klasse', () => {
    expect(renderMessages([msg({})], { ...DEFAULT_SETTINGS, timestamps: 'hover' })).toContain('ts-hover');
    expect(renderMessages([msg({})], { ...DEFAULT_SETTINGS, timestamps: 'hidden' })).toContain('ts-hidden');
  });
});
