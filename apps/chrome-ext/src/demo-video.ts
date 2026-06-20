/**
 * Auto-ablaufende animierte Produkt-Demo (für Screen-Recording).
 * Echter Renderer (chatmail-ui) + Animations-Director. Keine echten Mails.
 * Build: `npm run build:demo-video` → self-contained docs/demo-video.html
 */
import { createChatView, DEFAULT_SETTINGS, THEMES } from '@chatmail/ui';
import type { MessageObject } from '@chatmail/core';

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140"><rect width="220" height="140" fill="#5b8def"/><circle cx="60" cy="48" r="22" fill="#ffd34e"/><path d="M0 140 L70 78 L120 120 L165 86 L220 130 L220 140Z" fill="#2f9e6e"/><text x="12" y="130" fill="#fff" font-family="sans-serif" font-size="13">strand.jpg</text></svg>',
  );

const SIG =
  'Anna Berg<br>Projektkoordination Sommerfest<br>Stadtwerk Kultur gGmbH<br>' +
  'Tel: 089 123 456 78<br>anna.berg@stadtwerk-kultur.example';

const CONVO: MessageObject[] = [
  {
    sender: { name: 'Anna Berg', email: 'anna.berg@stadtwerk-kultur.example' },
    timestamp: 'Gestern, 09:14', isOwn: false, attachments: [],
    bodyText: 'Hallo! Hast du das Briefing für das Sommerfest schon gesehen? Ich würde gern nächste Woche starten.',
    bodyHtml: 'Hallo! Hast du das Briefing für das Sommerfest schon gesehen? Ich würde gern nächste Woche starten.',
  },
  {
    sender: { name: 'Du' }, timestamp: 'Gestern, 09:30', isOwn: true, attachments: [],
    bodyText: 'Hi Anna, ja — sieht super aus. Wann passt dir ein kurzer Call?',
    bodyHtml: 'Hi Anna, ja — sieht super aus. Wann passt dir ein kurzer Call?',
    replyTo: { name: 'Anna Berg', preview: 'Hallo! Hast du das Briefing für das Sommerfest' },
  },
  {
    sender: { name: 'Anna Berg' }, timestamp: 'Gestern, 09:42', isOwn: false,
    attachments: [{ kind: 'image', name: 'strand.jpg', url: PHOTO }],
    bodyText: 'Donnerstag 14 Uhr? Hier schon mal ein Eindruck der Location:',
    bodyHtml: 'Donnerstag 14 Uhr? Hier schon mal ein Eindruck der Location:',
  },
  {
    sender: { name: 'Anna Berg' }, timestamp: 'Heute, 08:05', isOwn: false, attachments: [],
    bodyText: 'Und hier die Weiterleitung des Angebots:',
    bodyHtml: 'Und hier die Weiterleitung des Angebots:',
    forwarded: {
      sender: 'Eventlocation München', subject: 'Angebot Sommerfest 2026',
      preview: 'Angebot Sommerfest 2026 — Gerne unterbreiten wir Ihnen unser Angebot für Ihre Veranstaltung.',
      bodyHtml: 'Sehr geehrte Frau Berg,<br><br>gerne unterbreiten wir Ihnen unser Angebot für Ihre Veranstaltung am 12. Juli. Die Räumlichkeiten sind verfügbar.<br><br>Mit freundlichen Grüßen<br>Eventlocation München',
    },
  },
  {
    sender: { name: 'Du' }, timestamp: 'Heute, 08:20', isOwn: true, attachments: [],
    bodyText: 'Perfekt, Donnerstag 14 Uhr passt. Danke dir!',
    bodyHtml: 'Perfekt, Donnerstag 14 Uhr passt. Danke dir!',
    signatureHtml: SIG,
  },
];

function renderChat(themeId: string, fade: boolean, prev: HTMLElement | null): HTMLElement {
  const settings = { ...DEFAULT_SETTINGS, themeId, chatThemeSeparate: true };
  const next = createChatView(CONVO, settings);
  next.style.height = '100%';
  next.style.opacity = fade ? '0' : '1';
  next.style.transition = 'opacity 0.45s ease';
  $('cm-slot').appendChild(next);
  if (fade) requestAnimationFrame(() => (next.style.opacity = '1'));
  if (prev) setTimeout(() => prev.remove(), 480);
  return next;
}

function label(text: string): void {
  const el = $('theme-label');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1200);
}

async function moveCursor(target: Element | null): Promise<void> {
  if (!target) return;
  const r = target.getBoundingClientRect();
  const c = $('cursor');
  c.style.opacity = '1';
  c.style.left = `${r.left + r.width / 2}px`;
  c.style.top = `${r.top + r.height / 2}px`;
  await wait(620);
  c.classList.add('tap');
  await wait(220);
  c.classList.remove('tap');
}

function setToggle(on: boolean): void {
  $('ios-toggle').classList.toggle('on', on);
}

async function play(): Promise<void> {
  for (;;) {
    let h: HTMLElement | null = null;
    // RESET: klassische Ansicht sichtbar, Chat aus, Schalter aus
    $('classic').style.opacity = '1';
    $('cm-slot').style.opacity = '0';
    $('cm-slot').replaceChildren();
    setToggle(false);
    $('settings').classList.remove('open');
    await wait(1100);

    // 1) Schalter anklicken → AN
    await moveCursor($('ios-toggle'));
    setToggle(true);
    await wait(350);

    // 2) Crossfade Klassisch → Chat
    h = renderChat('whatsapp', false, h);
    $('classic').style.opacity = '0';
    $('cm-slot').style.opacity = '1';
    label('💬 Chat-Ansicht');
    await wait(1500);

    // 3) Themes durchwechseln (Apple/Google-Style)
    for (const id of ['imessage', 'telegram', 'discord', 'signal', 'bumblebee']) {
      const t = THEMES.find((x) => x.id === id);
      h = renderChat(id, true, h);
      label('🎨 ' + (t?.label ?? id));
      await wait(1500);
    }
    h = renderChat('whatsapp', true, h);
    await wait(1300);

    // 4) Klick auf Antwort-Referenz → Sprung + Flash
    const chip = h?.shadowRoot?.querySelector('.cm-quote[data-cm-jump]') as HTMLElement | null;
    if (chip) {
      await moveCursor(chip);
      label('↪ Sprung zur Original-Nachricht');
      chip.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      await wait(1800);
    }
    await wait(400);

    // 5) Weiterleitung aufklappen
    const fwd = h?.shadowRoot?.querySelector('details.cm-fwd') as HTMLDetailsElement | null;
    if (fwd) {
      await moveCursor(fwd.querySelector('summary'));
      label('📨 Weiterleitung aufklappen');
      fwd.open = true;
      await wait(1700);
    }

    // 6) Signatur einklappen/ausklappen
    const sig = h?.shadowRoot?.querySelector('details.cm-sig') as HTMLDetailsElement | null;
    if (sig) {
      await moveCursor(sig.querySelector('summary'));
      label('✍️ Signatur ein-/ausklappen');
      sig.open = true;
      await wait(1700);
    }

    // 7) Einstellungen einblenden
    await moveCursor($('gear'));
    label('⚙️ Einstellungen & Themes');
    $('settings').classList.add('open');
    await wait(2400);
    $('settings').classList.remove('open');
    await wait(900);
  }
}

// Theme-Swatches im Mock-Einstellungs-Panel füllen
const sw = $('sw');
for (const t of THEMES.slice(0, 8)) {
  const d = document.createElement('div');
  d.className = 'swatch';
  d.style.background = typeof t.ownBubble === 'string' && t.ownBubble.startsWith('linear')
    ? t.ownBubble
    : (t.ownBubble as string);
  d.title = t.label;
  sw.appendChild(d);
}

void play();
