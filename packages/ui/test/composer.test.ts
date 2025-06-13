import { describe, expect, it, vi } from 'vitest';
import type { MessageObject } from '@chatmail/core';
import { createChatView, DEFAULT_SETTINGS } from '../src/index';

const msg: MessageObject = {
  sender: { name: 'Max' },
  bodyHtml: 'Hi',
  bodyText: 'Hi',
  attachments: [],
  isOwn: false,
};

describe('Chat-Composer', () => {
  it('erscheint nur, wenn ein onSend-Handler übergeben wird', () => {
    const without = createChatView([msg], DEFAULT_SETTINGS);
    expect(without.shadowRoot!.querySelector('.cm-composer')).toBeNull();

    const withSend = createChatView([msg], DEFAULT_SETTINGS, { onSend: async () => true });
    expect(withSend.shadowRoot!.querySelector('.cm-composer')).not.toBeNull();
  });

  it('sendet beim Klick und leert die Eingabe bei Erfolg', async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const view = createChatView([msg], DEFAULT_SETTINGS, { onSend });
    const shadow = view.shadowRoot!;
    const input = shadow.querySelector<HTMLTextAreaElement>('.cm-comp-input')!;
    input.value = 'Hallo zurück!';
    shadow.querySelector<HTMLButtonElement>('.cm-comp-send')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onSend).toHaveBeenCalledWith('Hallo zurück!');
    expect(input.value).toBe('');
  });

  it('behält Text und zeigt Fehler bei fehlgeschlagenem Senden', async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    const view = createChatView([msg], DEFAULT_SETTINGS, { onSend });
    const shadow = view.shadowRoot!;
    const input = shadow.querySelector<HTMLTextAreaElement>('.cm-comp-input')!;
    input.value = 'Test';
    shadow.querySelector<HTMLButtonElement>('.cm-comp-send')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(input.value).toBe('Test');
    expect(shadow.querySelector('.cm-composer')!.classList.contains('error')).toBe(true);
  });

  it('leere Eingabe wird nicht gesendet', () => {
    const onSend = vi.fn();
    const view = createChatView([msg], DEFAULT_SETTINGS, { onSend });
    view.shadowRoot!.querySelector<HTMLButtonElement>('.cm-comp-send')!.click();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Volleditor-Button ruft onOpenFullEditor', () => {
    const onOpenFullEditor = vi.fn();
    const view = createChatView([msg], DEFAULT_SETTINGS, { onSend: async () => true, onOpenFullEditor });
    view.shadowRoot!.querySelector<HTMLButtonElement>('.cm-comp-full')!.click();
    expect(onOpenFullEditor).toHaveBeenCalled();
  });

  it('📎-Button erscheint mit Handler und ruft onOpenAttach', () => {
    const onOpenAttach = vi.fn();
    const view = createChatView([msg], DEFAULT_SETTINGS, { onSend: async () => true, onOpenAttach });
    const btn = view.shadowRoot!.querySelector<HTMLButtonElement>('.cm-comp-attach');
    expect(btn).not.toBeNull();
    btn!.click();
    expect(onOpenAttach).toHaveBeenCalled();
    // ohne Handler kein Button
    const without = createChatView([msg], DEFAULT_SETTINGS, { onSend: async () => true });
    expect(without.shadowRoot!.querySelector('.cm-comp-attach')).toBeNull();
  });
});
