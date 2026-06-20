/**
 * Auto-ablaufende animierte Produkt-Demo (für Screen-Recording).
 * Gmail-artiges 2-Spalten-Layout: links Mail-Liste, rechts Lese-/Chat-Bereich.
 * Echter Renderer (chatmail-ui), fiktive Inhalte. Build: `npm run build:demo-video`.
 */
import { createChatView, DEFAULT_SETTINGS, THEMES } from '@chatmail/ui';
import type { MessageObject } from '@chatmail/core';

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="230" height="150"><rect width="230" height="150" fill="#5b8def"/><circle cx="62" cy="50" r="22" fill="#ffd34e"/><path d="M0 150 L74 84 L126 126 L172 92 L230 138 L230 150Z" fill="#2f9e6e"/></svg>',
  );
const SIG =
  'Anna Berg<br>Projektkoordination Sommerfest<br>Stadtwerk Kultur gGmbH<br>Tel: 089 123 456 78<br>anna.berg@stadtwerk-kultur.example';

const CONVOS: MessageObject[][] = [
  // 0 — reich: Reply-Chip, Anhang, Weiterleitung, Signatur
  [
    { sender: { name: 'Anna Berg', email: 'anna.berg@stadtwerk-kultur.example' }, timestamp: 'Gestern, 09:14', isOwn: false, attachments: [],
      bodyText: 'Hallo! Hast du das Briefing für das Sommerfest schon gesehen? Ich würde gern nächste Woche starten.',
      bodyHtml: 'Hallo! Hast du das Briefing für das Sommerfest schon gesehen? Ich würde gern nächste Woche starten.' },
    { sender: { name: 'Du' }, timestamp: 'Gestern, 09:30', isOwn: true, attachments: [],
      bodyText: 'Hi Anna, ja — sieht super aus. Wann passt dir ein kurzer Call?',
      bodyHtml: 'Hi Anna, ja — sieht super aus. Wann passt dir ein kurzer Call?' },
    { sender: { name: 'Anna Berg' }, timestamp: 'Gestern, 09:42', isOwn: false, attachments: [{ kind: 'image', name: 'location.jpg', url: PHOTO }],
      bodyText: 'Donnerstag 14 Uhr? Hier schon mal ein Eindruck der Location:',
      bodyHtml: 'Donnerstag 14 Uhr? Hier schon mal ein Eindruck der Location:' },
    { sender: { name: 'Anna Berg' }, timestamp: 'Heute, 08:05', isOwn: false, attachments: [],
      bodyText: 'Und hier die Weiterleitung des Angebots:',
      bodyHtml: 'Und hier die Weiterleitung des Angebots:',
      forwarded: { sender: 'Eventlocation München', subject: 'Angebot Sommerfest 2026',
        preview: 'Angebot Sommerfest 2026 — Gerne unterbreiten wir Ihnen unser Angebot für Ihre Veranstaltung.',
        bodyHtml: 'Sehr geehrte Frau Berg,<br><br>gerne unterbreiten wir Ihnen unser Angebot für Ihre Veranstaltung am 12. Juli. Die Räumlichkeiten sind verfügbar.<br><br>Mit freundlichen Grüßen<br>Eventlocation München' } },
    { sender: { name: 'Du' }, timestamp: 'Heute, 08:20', isOwn: true, attachments: [],
      bodyText: 'Perfekt, Donnerstag 14 Uhr passt. Danke dir!', bodyHtml: 'Perfekt, Donnerstag 14 Uhr passt. Danke dir!',
      replyTo: { name: 'Anna Berg', preview: 'Hallo! Hast du das Briefing für das Sommerfest' }, signatureHtml: SIG },
  ],
  // 1 — kurz, Dev-Thread mit Reply
  [
    { sender: { name: 'Tom Vogel' }, timestamp: 'Gestern, 14:02', isOwn: false, attachments: [],
      bodyText: 'Kannst du den Pull Request #214 noch reviewen? Wäre top bis morgen.',
      bodyHtml: 'Kannst du den Pull Request #214 noch reviewen? Wäre top bis morgen.' },
    { sender: { name: 'Du' }, timestamp: 'Gestern, 14:20', isOwn: true, attachments: [],
      bodyText: 'Klar, schaue ich mir gleich an.', bodyHtml: 'Klar, schaue ich mir gleich an.',
      replyTo: { name: 'Tom Vogel', preview: 'Kannst du den Pull Request #214 noch reviewen' } },
    { sender: { name: 'Tom Vogel' }, timestamp: 'Gestern, 16:48', isOwn: false, attachments: [],
      bodyText: 'Sieht gut aus, mergen wir. Danke!', bodyHtml: 'Sieht gut aus, mergen wir. Danke!' },
  ],
  // 2 — Anhang/Bild
  [
    { sender: { name: 'Lisa Wang' }, timestamp: 'Montag, 19:30', isOwn: false, attachments: [{ kind: 'image', name: 'strand.jpg', url: PHOTO }],
      bodyText: 'Hier die Bilder vom Strand! War ein Traum.', bodyHtml: 'Hier die Bilder vom Strand! War ein Traum.' },
    { sender: { name: 'Du' }, timestamp: 'Montag, 20:05', isOwn: true, attachments: [],
      bodyText: 'Wow, sieht fantastisch aus! 😍', bodyHtml: 'Wow, sieht fantastisch aus! 😍' },
  ],
];

const ROWS = [
  { from: 'Anna Berg', subj: 'Sommerfest 2026', snip: 'Perfekt, Donnerstag passt!', time: '09:14', color: '#e6794b', convo: 0 },
  { from: 'Tom Vogel', subj: 'Re: Code Review', snip: 'Sieht gut aus, mergen wir.', time: 'Gestern', color: '#4b8de6', convo: 1 },
  { from: 'Lisa Wang', subj: 'Urlaubsfotos', snip: 'Hier die Bilder vom Strand!', time: 'Mo.', color: '#9b59b6', convo: 2 },
  { from: 'GitHub', subj: '3 neue Issues im Repo', snip: 'mail-to-chat · opened by octo', time: 'Mo.', color: '#5a5f6a', convo: -1 },
  { from: 'Stadtwerk News', subj: 'Wochenrückblick', snip: 'Die Highlights der Woche …', time: 'So.', color: '#2f9e6e', convo: -1 },
];

let themeId = 'whatsapp';

function renderChat(idx: number, fade: boolean, prev: HTMLElement | null): HTMLElement {
  const settings = { ...DEFAULT_SETTINGS, themeId, chatThemeSeparate: true, htmlSafeBg: false };
  const next = createChatView(CONVOS[idx] ?? [], settings);
  next.style.height = '100%';
  next.style.opacity = fade ? '0' : '1';
  next.style.transition = 'opacity 0.45s ease';
  $('cm-slot').appendChild(next);
  if (fade) requestAnimationFrame(() => (next.style.opacity = '1'));
  if (prev) setTimeout(() => prev.remove(), 480);
  return next;
}

const list = $('maillist');
ROWS.forEach((r, i) => {
  const el = document.createElement('div');
  el.className = 'mrow' + (i === 0 ? ' active' : '');
  el.innerHTML =
    `<div class="mav" style="background:${r.color}">${r.from.charAt(0)}</div>` +
    `<div class="mtext"><div class="mtop"><span class="mfrom">${r.from}</span><span class="mtime">${r.time}</span></div>` +
    `<div class="msubj">${r.subj}</div><div class="msnip">${r.snip}</div></div>`;
  list.appendChild(el);
});
function selectRow(i: number): void {
  Array.from(list.children).forEach((c, j) => (c as HTMLElement).classList.toggle('active', i === j));
}

// Theme-Swatches im Einstellungs-Panel (klickbar)
const SW_THEMES = ['whatsapp', 'imessage', 'telegram', 'discord', 'signal', 'bumblebee'];
const sw = $('sw');
const swEls: Record<string, HTMLElement> = {};
for (const id of SW_THEMES) {
  const t = THEMES.find((x) => x.id === id);
  const d = document.createElement('div');
  d.className = 'swatch';
  d.style.background = (t?.ownBubble as string) ?? '#888';
  d.title = t?.label ?? id;
  sw.appendChild(d);
  swEls[id] = d;
}

function setToggle(on: boolean): void {
  $('ios-toggle').classList.toggle('on', on);
}
function label(text: string): void {
  const el = $('theme-label');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1300);
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
function scroller(h: HTMLElement | null): HTMLElement | null {
  return (h?.shadowRoot?.querySelector('.cm-chat') as HTMLElement | null) ?? h;
}
async function scrollChat(h: HTMLElement | null, to: number): Promise<void> {
  const s = scroller(h);
  if (s) s.scrollTo({ top: to, behavior: 'smooth' });
  await wait(950);
}

async function play(): Promise<void> {
  for (;;) {
    themeId = 'whatsapp';
    selectRow(0);
    $('classic').style.opacity = '1';
    $('cm-slot').style.opacity = '0';
    $('cm-slot').replaceChildren();
    setToggle(false);
    $('settings').classList.remove('open');
    let h: HTMLElement | null = null;
    await wait(1200);

    // 1) Schalter an → Crossfade Klassisch → Chat
    await moveCursor($('ios-toggle'));
    setToggle(true);
    await wait(320);
    h = renderChat(0, false, h);
    $('classic').style.opacity = '0';
    $('cm-slot').style.opacity = '1';
    label('Chat-Ansicht');
    await wait(1500);

    // 2) Durch den Verlauf nach unten scrollen
    label('Durch den Verlauf scrollen');
    await scrollChat(h, 99999);
    await wait(900);

    // 3) Unten: Antwort-Referenz → Klick → satisfying Flick hoch zur Original-Nachricht
    const chip = h?.shadowRoot?.querySelector('.cm-quote[data-cm-jump]') as HTMLElement | null;
    if (chip) {
      await moveCursor(chip);
      label('Antwort-Referenz — Klick springt zum Original');
      chip.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      await wait(2200);
    }
    await scrollChat(h, 0); // vor Mail-Wechsel sauber nach oben (kein Crossfade-Versatz)
    await wait(500);

    // 4) Andere Mails in der linken Liste öffnen
    await moveCursor(list.children[1] as Element);
    selectRow(1);
    h = renderChat(1, true, h);
    label('Andere Mail öffnen');
    await wait(1700);

    await moveCursor(list.children[2] as Element);
    selectRow(2);
    h = renderChat(2, true, h);
    label('Mail mit Bild-Anhang');
    await wait(1800);

    // 5) Designs durchwechseln — auf der reichen Konversation, von OBEN (kein Scroll-Sprung mehr)
    h = renderChat(0, true, h);
    selectRow(0);
    await moveCursor($('gear'));
    $('settings').classList.add('open');
    label('Design wechseln');
    await wait(1300);
    for (const id of ['imessage', 'telegram', 'discord', 'signal', 'bumblebee']) {
      const t = THEMES.find((x) => x.id === id);
      await moveCursor(swEls[id] ?? null);
      themeId = id;
      h = renderChat(0, true, h);
      label(t?.label ?? id);
      await wait(1500);
    }
    $('settings').classList.remove('open');
    themeId = 'whatsapp';
    await wait(1000);
  }
}

void play();
