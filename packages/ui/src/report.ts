/**
 * Fehler-Melde- / Feedback-Modul — Single Source of Truth.
 *
 * Sammelt rein TECHNISCHE Diagnose-Daten (Version, Browser, interner State,
 * operative Logs) und bietet dem Nutzer zwei Wege, sie zu melden:
 *   • GitHub-Issue (strukturiert, nachvollziehbar)  • E-Mail (ohne Konto)
 * Der vollständige Text wird zusätzlich in die Zwischenablage kopiert.
 *
 * DATENSCHUTZ (non-negotiable): Hier dürfen NIEMALS Mail-Inhalte landen.
 * Der Aufrufer übergibt nur sanitisierte `details` (State-Flags, Log-Zeilen).
 * Siehe PRIVACY.md — keine E-Mail-Inhalte verlassen das Gerät.
 *
 * Framework-frei (reines DOM, Inline-Styles) → funktioniert identisch im
 * Gmail-Content-Script (Isolated World) und auf der Optionsseite.
 */

/** Wohin Meldungen gehen — an EINER Stelle pflegen. */
export const REPORT_TARGET = {
  repo: 'dellloo/mail-to-chat',
  email: 'deeeellloooo@gmail.com',
} as const;

export type ReportLang = 'de' | 'en';

export interface ReportInput {
  lang: ReportLang;
  /** Extension-Version, z.B. '1.9.0'. */
  version: string;
  /** Kurzer Kontext, z.B. 'Gmail-Tab' / 'Einstellungsseite'. */
  where: string;
  /** Mehrzeilige, rein technische Details. KEINE Mail-Inhalte. */
  details: string;
  /** Optional: DOM-Wurzel (Default: document.body). Für Tests. */
  root?: HTMLElement;
}

const I18N = {
  de: {
    menuItem: 'Problem melden…',
    title: 'Problem melden',
    intro:
      'Wähle, wie du melden möchtest — alle technischen Infos sind im geöffneten Fenster schon vorausgefüllt:',
    github: 'Auf GitHub melden',
    githubHint: 'Strukturiert · GitHub-Konto nötig',
    email: 'Per E-Mail melden',
    emailHint: 'Ohne Konto · dein Mail-Programm öffnet sich',
    copy: 'Erneut kopieren',
    copied: 'Kopiert ✓',
    close: 'Schließen',
    privacy: 'Enthält nur technische Zustandsdaten & Logs — keine E-Mail-Inhalte.',
    tplWhat: '## Was ist passiert?\n(kurz beschreiben)\n',
    tplExpect: '\n## Was hast du erwartet?\n\n',
    tplSteps: '## Schritte zum Reproduzieren\n1. \n2. \n',
    tplTech: '\n---\n### Technische Infos (automatisch erfasst — bitte drin lassen)',
  },
  en: {
    menuItem: 'Report a problem…',
    title: 'Report a problem',
    intro:
      'Choose how to report — all technical info is already pre-filled in the window that opens:',
    github: 'Report on GitHub',
    githubHint: 'Structured · GitHub account required',
    email: 'Report by email',
    emailHint: 'No account · opens your mail app',
    copy: 'Copy again',
    copied: 'Copied ✓',
    close: 'Close',
    privacy: 'Contains only technical state & logs — no email content.',
    tplWhat: '## What happened?\n(briefly describe)\n',
    tplExpect: '\n## What did you expect?\n\n',
    tplSteps: '## Steps to reproduce\n1. \n2. \n',
    tplTech: '\n---\n### Technical info (auto-collected — please keep)',
  },
} as const;

/** Kurzer, korrelierbarer Debug-Code, z.B. M2C-1.9.0-LXF3A9. */
export function makeDebugCode(version: string, now: number = Date.now()): string {
  return `M2C-${version}-${now.toString(36).toUpperCase()}`;
}

/** Technischer Datenblock (Code + Umgebung + Details). Keine Mail-Inhalte. */
export function buildTechBlock(input: ReportInput, code: string): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a';
  return [
    `Debug-Code: ${code}`,
    `Version: ${input.version}`,
    `Kontext: ${input.where}`,
    `Browser: ${ua}`,
    `Sprache: ${input.lang}`,
    '',
    input.details.trim(),
  ].join('\n');
}

/** Vollständiger Issue-/Mail-Text: Nutzer-Vorlage + technischer Block. */
export function buildReportBody(input: ReportInput, code: string): string {
  const t = I18N[input.lang];
  return [
    t.tplWhat,
    t.tplExpect,
    t.tplSteps,
    t.tplTech,
    '',
    '```',
    buildTechBlock(input, code),
    '```',
  ].join('\n');
}

/** GitHub- und mailto-URL aus Titel + Body. */
export function reportUrls(title: string, body: string): { github: string; mailto: string } {
  const t = encodeURIComponent(title);
  const b = encodeURIComponent(body);
  return {
    github: `https://github.com/${REPORT_TARGET.repo}/issues/new?title=${t}&body=${b}`,
    mailto: `mailto:${REPORT_TARGET.email}?subject=${t}&body=${b}`,
  };
}

/** Robustes Kopieren: Clipboard-API mit execCommand-Fallback. */
function copyText(text: string): void {
  try {
    void navigator.clipboard?.writeText(text);
  } catch {
    /* fällt unten auf execCommand zurück */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  } catch {
    /* Clipboard nicht verfügbar — Nutzer kann aus dem Textfeld manuell kopieren */
  }
}

/** URL öffnen, ohne den aktuellen Tab zu verlassen. */
function openUrl(url: string, newTab: boolean): void {
  const a = document.createElement('a');
  a.href = url;
  if (newTab) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Zeigt den Melde-Dialog. Kopiert den Report sofort in die Zwischenablage
 * und bietet GitHub / E-Mail an. Gibt das Overlay-Element zurück (für Tests).
 */
export function openReportDialog(input: ReportInput): HTMLElement {
  const t = I18N[input.lang] ?? I18N.de;
  const root = input.root ?? document.body;
  const code = makeDebugCode(input.version);
  const title = `[Bug] Mail to Chat v${input.version} (${code})`;
  const body = buildReportBody(input, code);
  const urls = reportUrls(title, body);

  document.getElementById('chatmail-report-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'chatmail-report-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'background:rgba(8,10,16,0.55)', 'backdrop-filter:blur(2px)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'padding:20px', 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'animation:cmRepFade 0.18s ease',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'width:min(440px,94vw)', 'max-height:88vh', 'overflow:auto',
    'background:#ffffff', 'color:#16181d', 'border-radius:16px',
    'box-shadow:0 24px 70px rgba(0,0,0,0.5)', 'padding:22px 22px 18px',
    'animation:cmRepPop 0.22s cubic-bezier(0.22,1,0.36,1)',
  ].join(';');

  const btnBase = [
    'display:flex', 'flex-direction:column', 'align-items:flex-start', 'gap:1px',
    'width:100%', 'text-align:left', 'border:none', 'cursor:pointer',
    'padding:11px 15px', 'border-radius:11px', 'font-family:inherit',
    'transition:transform 0.12s ease, filter 0.12s ease',
  ].join(';');

  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:9px;margin-bottom:4px">
      <span style="font-size:18px">🛠️</span>
      <h2 style="margin:0;font-size:17px;font-weight:700">${t.title}</h2>
      <span style="margin-left:auto;font-size:10px;font-weight:800;letter-spacing:0.5px;
        color:#b8860b;border:1px solid rgba(230,180,0,0.5);background:rgba(230,180,0,0.12);
        padding:2px 6px;border-radius:5px">BETA</span>
    </div>
    <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#5f6672">${t.intro}</p>
    <button id="cmRepGh" type="button" style="${btnBase};background:#1f2328;color:#fff;margin-bottom:10px">
      <span style="font-weight:700;font-size:14px">${t.github}</span>
      <span style="font-size:11.5px;opacity:0.7">${t.githubHint}</span>
    </button>
    <button id="cmRepMail" type="button" style="${btnBase};background:#f4f5f7;color:#16181d;border:1px solid rgba(0,0,0,0.08)">
      <span style="font-weight:700;font-size:14px">${t.email}</span>
      <span style="font-size:11.5px;opacity:0.7">${t.emailHint}</span>
    </button>
    <div style="display:flex;align-items:center;margin-top:14px">
      <button id="cmRepClose" type="button" style="border:none;cursor:pointer;font-family:inherit;
        font-size:12.5px;font-weight:600;color:#5f6672;background:transparent;
        border-radius:8px;padding:8px 12px;margin-left:auto">${t.close}</button>
    </div>
    <p style="margin:8px 0 0;font-size:11px;line-height:1.4;color:#8a909c">🔒 ${t.privacy}</p>
  `;

  if (!document.getElementById('chatmail-report-css')) {
    const st = document.createElement('style');
    st.id = 'chatmail-report-css';
    st.textContent =
      '@keyframes cmRepFade{from{opacity:0}to{opacity:1}}' +
      '@keyframes cmRepPop{from{opacity:0;transform:translateY(10px) scale(0.97)}to{opacity:1;transform:none}}' +
      '#chatmail-report-overlay button:active{transform:scale(0.97)}' +
      '#chatmail-report-overlay #cmRepGh:hover,#chatmail-report-overlay #cmRepMail:hover{filter:brightness(1.06)}';
    document.head.appendChild(st);
  }

  overlay.appendChild(card);
  root.appendChild(overlay);

  const close = (): void => overlay.remove();
  // Klick → direkt GitHub / Mail öffnen, Report ist bereits in der URL
  // vorausgefüllt. Zusätzlich in die Zwischenablage (Backup), dann Dialog zu.
  card.querySelector('#cmRepGh')?.addEventListener('click', () => { copyText(body); openUrl(urls.github, true); close(); });
  card.querySelector('#cmRepMail')?.addEventListener('click', () => { copyText(body); openUrl(urls.mailto, false); close(); });
  card.querySelector('#cmRepClose')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);

  return overlay;
}

/** i18n-Zugriff für Aufrufer (z.B. Kontextmenü-Beschriftung). */
export function reportMenuLabel(lang: ReportLang): string {
  return (I18N[lang] ?? I18N.de).menuItem;
}
