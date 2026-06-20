import { describe, expect, it } from 'vitest';
import type { MessageObject } from '@chatmail/core';
import {
  applyCachedAttachments,
  attachmentCacheKey,
  mergeThreadMessages,
  pruneRedundantReplyTo,
  stripCrossQuotes,
} from '../src/index';

const m = (body: string): MessageObject => ({
  sender: { name: 'X' },
  bodyHtml: body,
  bodyText: body,
  attachments: [],
  isOwn: false,
});

describe('stripCrossQuotes (markerlose Zitate inhaltsbasiert abschneiden)', () => {
  it('schneidet den zitierten Text einer früheren Bubble aus dem Body', () => {
    const prev = m('Hallo Lorenzo, freut mich dass bei dir alles gut ist. Wie laeuft mit Rayan?');
    const reply = m(
      'Ich war heute da, er macht es gut. Danke fuer den Link. Hallo Lorenzo, freut mich dass bei dir alles gut ist. Wie laeuft mit Rayan?',
    );
    const out = stripCrossQuotes([prev, reply]);
    expect(out[1]!.bodyText).toContain('Ich war heute da');
    expect(out[1]!.bodyText).not.toContain('freut mich dass bei dir');
  });
  it('lässt eine Nachricht ohne zitierten Vorgänger unangetastet', () => {
    const a = m('Erste Nachricht hier, komplett eigenständig formuliert.');
    const b = m('Zweite ganz andere Nachricht ohne jeden Bezug dazu.');
    expect(stripCrossQuotes([a, b])[1]!.bodyText).toBe('Zweite ganz andere Nachricht ohne jeden Bezug dazu.');
  });
});

describe('mergeThreadMessages (Verlauf darf nie verschwinden)', () => {
  it('Zitat-Historie länger als DOM → Kopf aus Historie, Schwanz aus DOM', () => {
    const dom = [m('neu-1'), m('neu-2')];
    const quote = [m('alt-1'), m('alt-2'), m('alt-3'), m('neu-1q'), m('neu-2q')];
    const merged = mergeThreadMessages(dom, quote);
    expect(merged.map((x) => x.bodyText)).toEqual(['alt-1', 'alt-2', 'alt-3', 'neu-1', 'neu-2']);
  });

  it('gleich viele oder mehr DOM-Mails → nur DOM (zuverlässigste Quelle)', () => {
    const dom = [m('a'), m('b'), m('c')];
    expect(mergeThreadMessages(dom, [m('x'), m('y')])).toBe(dom);
    expect(mergeThreadMessages(dom, [m('x'), m('y'), m('z')])).toBe(dom);
  });

  it('keine DOM-Mails → komplette Zitat-Historie', () => {
    const quote = [m('1'), m('2')];
    expect(mergeThreadMessages([], quote)).toEqual(quote);
  });

  it('beides leer → leer', () => {
    expect(mergeThreadMessages([], [])).toEqual([]);
  });

  it('Anhang-Cache: Medien ueberleben das Einklappen der Mail (failsafe)', () => {
    const withAtt: MessageObject = {
      ...m('servus, hier das bild'),
      sender: { name: 'Lo', email: 'lo@x.de' },
      attachments: [{ kind: 'image', name: 'AS01.png', url: 'https://x/as01.png' }],
    };
    // 1. Aufgeklappt gesehen -> Cache befuellt
    const cache: Record<string, typeof withAtt.attachments> = {
      [attachmentCacheKey(withAtt)]: withAtt.attachments,
    };
    // 2. Spaeter eingeklappt: gleiche Nachricht kommt aus der Zitat-Historie OHNE Anhaenge
    const collapsed: MessageObject = { ...withAtt, attachments: [] };
    const restored = applyCachedAttachments([collapsed, m('andere nachricht')], cache);
    expect(restored[0]?.attachments).toHaveLength(1);
    expect(restored[0]?.attachments[0]?.name).toBe('AS01.png');
    // Fremde Nachricht ohne Cache-Treffer bleibt unveraendert
    expect(restored[1]?.attachments).toHaveLength(0);
    // Vorhandene Anhaenge werden NIE ueberschrieben
    const untouched = applyCachedAttachments([withAtt], { [attachmentCacheKey(withAtt)]: [] });
    expect(untouched[0]?.attachments).toHaveLength(1);
  });

  it('REGRESSION Doppel-Bubble: identische Nachricht an der Naht wird dedupliziert', () => {
    // Szenario: Auto-Reply zitiert die eigene 👍/Kurz-Mail → sie steckt im Kopf
    // (Zitat-Historie) UND im Schwanz (DOM) → darf nur 1x erscheinen.
    const dom = [m('kurze nachricht'), m('auto-reply text')];
    const quote = [m('alt-1'), m('alt-2'), m('kurze nachricht'), m('x'), m('y')];
    const merged = mergeThreadMessages(dom, quote);
    expect(merged.map((q) => q.bodyText)).toEqual(['alt-1', 'alt-2', 'kurze nachricht', 'auto-reply text']);
  });

  it('pruneRedundantReplyTo: adjazente Antworten verlieren den Chip, Antworten auf AELTERE behalten ihn', () => {
    const msgs: MessageObject[] = [
      { ...m('Hi! Koennen wir das Meeting verschieben auf Dienstag?') },
      {
        ...m('Klar, passt.'),
        replyTo: { name: 'Max', preview: 'Hi! Koennen wir das Meeting verschieben auf Dienstag?' },
      },
      {
        ...m('Nochmal zur ersten Frage: Dienstag geht doch nicht.'),
        replyTo: { name: 'Max', preview: 'Hi! Koennen wir das Meeting verschieben auf Dienstag?' },
      },
    ];
    const pruned = pruneRedundantReplyTo(msgs);
    expect(pruned[1]?.replyTo).toBeUndefined(); // antwortet auf direkt vorherige -> Rauschen
    expect(pruned[2]?.replyTo).toBeDefined(); // antwortet auf AELTERE -> informativ, bleibt
    expect(pruned[2]?.replyTo?.preview).toContain('Meeting verschieben');
  });

  it('Regression: nach Senden (1 DOM-Mail, lange Historie) bleibt ALLES erhalten', () => {
    const dom = [m('gerade gesendet')];
    const quote = [m('msg1'), m('msg2'), m('msg3'), m('msg4'), m('gesendet-q')];
    const merged = mergeThreadMessages(dom, quote);
    expect(merged).toHaveLength(5);
    expect(merged[4]?.bodyText).toBe('gerade gesendet');
    expect(merged[0]?.bodyText).toBe('msg1');
  });
});
