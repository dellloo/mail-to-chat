/**
 * Standalone-Demo: rendert den ECHTEN Chat-Renderer (chatmail-ui) mit FIKTIVEN Inhalten.
 * Build: `npm run build:demo` → self-contained docs/demo.html (für Screenshots / Live-Demo).
 * Keine echten Mails — datenschutzsicher.
 */
import { createChatView, DEFAULT_SETTINGS, THEMES } from '@chatmail/ui';
import type { MessageObject } from '@chatmail/core';

const SIG =
  'Anna Berg<br>Projektkoordination Sommerfest<br>Stadtwerk Kultur gGmbH<br>' +
  'Tel: 089 123 456 78<br>anna.berg@stadtwerk-kultur.example<br>www.stadtwerk-kultur.example';

const CONVO: MessageObject[] = [
  {
    sender: { name: 'Anna Berg', email: 'anna.berg@stadtwerk-kultur.example' },
    timestamp: 'Gestern, 09:14',
    isOwn: false,
    attachments: [],
    bodyText: 'Hallo! Hast du das Briefing für das Sommerfest schon gesehen? Ich würde gern nächste Woche starten.',
    bodyHtml: 'Hallo! Hast du das Briefing für das Sommerfest schon gesehen? Ich würde gern nächste Woche starten.',
  },
  {
    sender: { name: 'Du' },
    timestamp: 'Gestern, 09:30',
    isOwn: true,
    attachments: [],
    bodyText: 'Hi Anna, ja — sieht super aus. Wann passt dir ein kurzer Call?',
    bodyHtml: 'Hi Anna, ja — sieht super aus. Wann passt dir ein kurzer Call?',
    replyTo: { name: 'Anna Berg', preview: 'Hallo! Hast du das Briefing für das Sommerfest' },
  },
  {
    sender: { name: 'Anna Berg' },
    timestamp: 'Gestern, 09:42',
    isOwn: false,
    attachments: [],
    bodyText: 'Donnerstag 14 Uhr? Ich leite dir das Angebot der Location weiter.',
    bodyHtml: 'Donnerstag 14 Uhr? Ich leite dir das Angebot der Location weiter.',
  },
  {
    sender: { name: 'Anna Berg' },
    timestamp: 'Heute, 08:05',
    isOwn: false,
    attachments: [],
    bodyText: 'Hier die Weiterleitung:',
    bodyHtml: 'Hier die Weiterleitung:',
    forwarded: {
      sender: 'Eventlocation München',
      subject: 'Angebot Sommerfest 2026',
      preview: 'Angebot Sommerfest 2026 — Gerne unterbreiten wir Ihnen unser Angebot für Ihre Veranstaltung.',
      bodyHtml:
        'Sehr geehrte Frau Berg,<br><br>gerne unterbreiten wir Ihnen unser Angebot für Ihre ' +
        'Veranstaltung am 12. Juli. Die Räumlichkeiten sind an dem Termin verfügbar.<br><br>' +
        'Mit freundlichen Grüßen<br>Eventlocation München',
    },
  },
  {
    sender: { name: 'Du' },
    timestamp: 'Heute, 08:20',
    isOwn: true,
    attachments: [],
    bodyText: 'Perfekt, Donnerstag 14 Uhr passt. Danke dir!',
    bodyHtml: 'Perfekt, Donnerstag 14 Uhr passt. Danke dir!',
    signatureHtml: SIG,
  },
];

function render(themeId: string): void {
  const settings = { ...DEFAULT_SETTINGS, themeId, chatThemeSeparate: true };
  const host = createChatView(CONVO, settings);
  const slot = document.getElementById('cm-slot');
  if (!slot) return;
  while (slot.firstChild) slot.removeChild(slot.firstChild);
  host.style.height = '100%';
  slot.appendChild(host);
}

// Theme-Umschalter (Auswahl an markanten Themes) + globaler Hook fürs Screenshotten.
const SHOWCASE = ['whatsapp', 'imessage', 'telegram', 'bumblebee', 'discord', 'signal'];
const bar = document.getElementById('cm-themes');
if (bar) {
  for (const t of THEMES.filter((x) => SHOWCASE.includes(x.id))) {
    const b = document.createElement('button');
    b.textContent = t.label;
    b.dataset.id = t.id;
    b.addEventListener('click', () => {
      render(t.id);
      for (const c of Array.from(bar.children)) (c as HTMLElement).classList.toggle('on', (c as HTMLElement).dataset.id === t.id);
    });
    bar.appendChild(b);
  }
  (bar.firstElementChild as HTMLElement | null)?.classList.add('on');
}
(window as unknown as { cmRender: (id: string) => void }).cmRender = render;
render('whatsapp');
