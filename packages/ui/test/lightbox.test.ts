import { describe, expect, it } from 'vitest';
import type { MessageObject } from '@chatmail/core';
import { createChatView, DEFAULT_SETTINGS, initials } from '../src/index';

const msg = (over: Partial<MessageObject>): MessageObject => ({
  sender: { name: 'Max Mustermann', email: 'max@y.de' },
  bodyHtml: 'Hallo',
  bodyText: 'Hallo',
  attachments: [],
  isOwn: false,
  ...over,
});

describe('Avatare', () => {
  it('bildet Initialen korrekt', () => {
    expect(initials('Max Mustermann')).toBe('MM');
    expect(initials('Lo')).toBe('L');
    expect(initials('Linda Dahlmann')).toBe('LD');
    expect(initials('  ')).toBe('?');
  });

  it('rendert Avatare nur für fremde Nachrichten', () => {
    const view = createChatView([msg({ isOwn: false }), msg({ isOwn: true })], DEFAULT_SETTINGS);
    const avatars = view.shadowRoot!.querySelectorAll('.cm-avatar');
    expect(avatars).toHaveLength(1);
    expect(avatars[0]?.textContent).toBe('MM');
  });
});

describe('Lightbox', () => {
  it('ist im Shadow DOM vorhanden und initial geschlossen', () => {
    const view = createChatView([msg({})], DEFAULT_SETTINGS);
    const lb = view.shadowRoot!.querySelector('.cm-lb');
    expect(lb).not.toBeNull();
    expect(lb!.classList.contains('open')).toBe(false);
  });

  it('öffnet sich beim Klick auf ein Anhang-Bild und schließt per ✕', () => {
    const view = createChatView(
      [msg({ attachments: [{ kind: 'image', name: 'Foto', url: 'https://x/im.png' }] })],
      DEFAULT_SETTINGS,
    );
    document.body.appendChild(view);
    const shadow = view.shadowRoot!;
    const thumb = shadow.querySelector<HTMLImageElement>('.cm-att-img')!;
    thumb.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    const lb = shadow.querySelector('.cm-lb')!;
    expect(lb.classList.contains('open')).toBe(true);
    expect(lb.querySelector('img')?.getAttribute('src')).toBe('https://x/im.png');

    lb.querySelector('.cm-lb-x')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(lb.classList.contains('open')).toBe(false);
    view.remove();
  });

  it('Anhang-Bilder sind KEINE Links mehr (kein neuer Tab)', () => {
    const view = createChatView(
      [msg({ attachments: [{ kind: 'image', name: 'Foto', url: 'https://x/im.png' }] })],
      DEFAULT_SETTINGS,
    );
    const a = view.shadowRoot!.querySelector('.cm-att-img')?.closest('a');
    expect(a).toBeNull();
  });
});
