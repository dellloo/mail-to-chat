import { describe, expect, it, vi } from 'vitest';
import type { MessageObject } from '@chatmail/core';
import { createChatView, DEFAULT_SETTINGS, renderMessages } from '../src/index';

const msg = (over: Partial<MessageObject>): MessageObject => ({
  sender: { name: 'Max' },
  bodyHtml: 'Hi',
  bodyText: 'Hi',
  attachments: [],
  isOwn: false,
  ...over,
});

describe('Datums-Trenner', () => {
  it('rendert Trenner bei Tageswechsel, keinen bei gleichem Tag', () => {
    const html = renderMessages(
      [
        msg({ timestamp: '01.06.2026 um 09:00' }),
        msg({ timestamp: '01.06.2026 um 10:00' }),
        msg({ timestamp: '02.06.2026 um 08:00' }),
      ],
      DEFAULT_SETTINGS,
    );
    expect(html.match(/class="cm-day"/g)).toHaveLength(2);
  });

  it('kein Trenner bei unparsbarem Datum oder deaktiviertem Setting', () => {
    const unparseable = renderMessages([msg({ timestamp: 'vor 2 Minuten' })], DEFAULT_SETTINGS);
    expect(unparseable).not.toContain('cm-day');
    const off = renderMessages(
      [msg({ timestamp: '01.06.2026' }), msg({ timestamp: '02.06.2026' })],
      { ...DEFAULT_SETTINGS, showDateSeparators: false },
    );
    expect(off).not.toContain('cm-day');
  });
});

describe('Kontaktkarte (Avatar-Klick)', () => {
  it('Avatare tragen Name + E-Mail als Daten-Attribute', () => {
    const html = renderMessages(
      [msg({ sender: { name: 'Max Mustermann', email: 'max@y.de' } })],
      DEFAULT_SETTINGS,
    );
    expect(html).toContain('data-cm-name="Max Mustermann"');
    expect(html).toContain('data-cm-email="max@y.de"');
  });

  it('Klick auf Avatar öffnet Karte mit Name, E-Mail und Aktionen', () => {
    const view = createChatView(
      [msg({ sender: { name: 'Max Mustermann', email: 'max@y.de' } })],
      DEFAULT_SETTINGS,
    );
    document.body.appendChild(view);
    const shadow = view.shadowRoot!;
    shadow.querySelector<HTMLElement>('.cm-avatar')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    const card = shadow.querySelector('.cm-contact');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('Max Mustermann');
    expect(card!.textContent).toContain('max@y.de');
    expect(card!.querySelectorAll('button, a').length).toBeGreaterThanOrEqual(2);
    view.remove();
  });

  it('ohne E-Mail: Hinweis statt Aktionen, kein Crash', () => {
    const view = createChatView([msg({ sender: { name: 'Nur Name' } })], DEFAULT_SETTINGS);
    document.body.appendChild(view);
    const shadow = view.shadowRoot!;
    shadow.querySelector<HTMLElement>('.cm-avatar')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(shadow.querySelector('.cm-contact')!.textContent).toContain('E-Mail unbekannt');
    view.remove();
  });

  it('Reactions-Feature ist entfernt (bewusste Produktentscheidung)', () => {
    const html = renderMessages([msg({})], DEFAULT_SETTINGS);
    expect(html).not.toContain('cm-react');
  });
});

describe('Antwort-Kontext (WhatsApp-Style Quote-Chip)', () => {
  it('rendert Name, Vorschau und Zeit im Chip', () => {
    const html = renderMessages(
      [
        msg({ bodyHtml: 'Erste Frage zum Budget?', bodyText: 'Erste Frage zum Budget?' }),
        msg({ bodyHtml: 'Zwischenstand', bodyText: 'Zwischenstand', isOwn: true }),
        msg({
          bodyHtml: 'Dazu: ja!',
          bodyText: 'Dazu: ja!',
          replyTo: { name: 'Max M', preview: 'Erste Frage zum Budget?', timestamp: '09:14' },
        }),
      ],
      DEFAULT_SETTINGS,
    );
    expect(html).toContain('cm-quote');
    expect(html).toContain('Max M');
    expect(html).toContain('Erste Frage zum Budget?');
    expect(html).toContain('09:14');
    // Original gefunden -> klickbarer Sprung auf Index 0
    expect(html).toContain('data-cm-jump="0"');
  });

  it('Klick auf den Chip springt zur Originalnachricht (Flash)', () => {
    const view = createChatView(
      [
        msg({ bodyHtml: 'Originalfrage hier', bodyText: 'Originalfrage hier' }),
        msg({ bodyHtml: 'x', bodyText: 'x', isOwn: true }),
        msg({
          bodyHtml: 'Antwort darauf',
          bodyText: 'Antwort darauf',
          replyTo: { name: 'Max', preview: 'Originalfrage hier' },
        }),
      ],
      DEFAULT_SETTINGS,
    );
    document.body.appendChild(view);
    const shadow = view.shadowRoot!;
    shadow
      .querySelector<HTMLElement>('.cm-quote[data-cm-jump]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    const target = shadow.querySelector('.cm-row[data-cm-row="0"]');
    expect(target?.classList.contains('cm-flash')).toBe(true);
    view.remove();
  });

  it('ohne auffindbares Original: Chip ohne Sprung-Attribut, kein Crash', () => {
    const html = renderMessages(
      [msg({ replyTo: { name: 'X', preview: 'nirgends vorhandener text' } })],
      DEFAULT_SETTINGS,
    );
    expect(html).toContain('cm-quote');
    expect(html).not.toContain('data-cm-jump');
  });
});

describe('Pro-Mail-Aktionen (Antworten/Weiterleiten am Bubble)', () => {
  it('jede Bubble trägt Reply- und Forward-Aktion mit korrektem Index', () => {
    const html = renderMessages([msg({}), msg({ isOwn: true })], DEFAULT_SETTINGS);
    expect(html.match(/data-cm-act="reply"/g)).toHaveLength(2);
    expect(html.match(/data-cm-act="forward"/g)).toHaveLength(2);
    expect(html).toContain('data-cm-idx="0"');
    expect(html).toContain('data-cm-idx="1"');
  });

  it('Klick ruft onReplyTo/onForward mit dem richtigen Index', () => {
    const onReplyTo = vi.fn();
    const onForward = vi.fn();
    const view = createChatView([msg({}), msg({})], DEFAULT_SETTINGS, { onReplyTo, onForward });
    document.body.appendChild(view);
    const shadow = view.shadowRoot!;
    const acts = shadow.querySelectorAll<HTMLButtonElement>('.cm-act');
    acts[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })); // reply idx 0
    acts[3]!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })); // forward idx 1
    // Zweites Argument: Draft aus dem Composer (hier leer)
    expect(onReplyTo).toHaveBeenCalledWith(0, '');
    expect(onForward).toHaveBeenCalledWith(1, '');
    view.remove();
  });

  it('ohne Handler werden die Aktionen entfernt', () => {
    const view = createChatView([msg({})], DEFAULT_SETTINGS);
    expect(view.shadowRoot!.querySelector('.cm-actions')).toBeNull();
  });
});

describe('Toolbar', () => {
  it('Export-Button vorhanden, Summary-Feature entfernt (Produktentscheidung)', () => {
    const view = createChatView([msg({})], DEFAULT_SETTINGS);
    const tools = view.shadowRoot!.querySelectorAll('.cm-tool');
    expect(tools).toHaveLength(1);
    expect(tools[0]?.textContent).toContain('PDF');
    expect(view.shadowRoot!.querySelector('.cm-summary-card')).toBeNull();
  });
});
