import { describe, it, expect, beforeEach } from 'vitest';
import {
  REPORT_TARGET, makeDebugCode, buildTechBlock, buildReportBody,
  reportUrls, openReportDialog, reportMenuLabel, type ReportInput,
} from '../src/report';

const baseInput = (over: Partial<ReportInput> = {}): ReportInput => ({
  lang: 'de',
  version: '1.9.0',
  where: 'Gmail-Tab',
  details: 'Host: mail.google.com\nState: {"active":true}',
  ...over,
});

describe('makeDebugCode', () => {
  it('hat das Format M2C-<version>-<base36>', () => {
    const code = makeDebugCode('1.9.0', 0);
    expect(code).toBe('M2C-1.9.0-0');
    expect(makeDebugCode('1.9.0')).toMatch(/^M2C-1\.9\.0-[0-9A-Z]+$/);
  });
});

describe('reportUrls', () => {
  it('baut GitHub- und mailto-URL mit korrektem Ziel + Encoding', () => {
    const { github, mailto } = reportUrls('[Bug] x & y', 'line1\nline2');
    expect(github).toContain(`https://github.com/${REPORT_TARGET.repo}/issues/new?`);
    expect(github).toContain('title=' + encodeURIComponent('[Bug] x & y'));
    expect(github).toContain('body=' + encodeURIComponent('line1\nline2'));
    expect(mailto.startsWith(`mailto:${REPORT_TARGET.email}?`)).toBe(true);
    // Keine rohen Sonderzeichen (sauber URL-kodiert)
    expect(github).not.toContain(' & ');
  });
});

describe('buildTechBlock / buildReportBody', () => {
  it('enthält Code, Version, Kontext und die übergebenen Details', () => {
    const tech = buildTechBlock(baseInput(), 'M2C-1.9.0-TEST');
    expect(tech).toContain('Debug-Code: M2C-1.9.0-TEST');
    expect(tech).toContain('Version: 1.9.0');
    expect(tech).toContain('Kontext: Gmail-Tab');
    expect(tech).toContain('Host: mail.google.com');
  });

  it('Datenschutz: gibt nur durch, was übergeben wird — kein Mail-Inhalt erfunden', () => {
    const tech = buildTechBlock(baseInput({ details: 'NUR_DIES' }), 'C');
    // Body besteht aus Vorlage + technischem Block; der einzige freie Inhalt ist NUR_DIES.
    expect(tech).toContain('NUR_DIES');
    expect(tech).not.toMatch(/Betreff|Subject:|@[a-z]+\.[a-z]+/i);
  });

  it('Body bettet den technischen Block in einen Code-Fence', () => {
    const body = buildReportBody(baseInput(), 'M2C-1.9.0-TEST');
    expect(body).toContain('```');
    expect(body).toContain('M2C-1.9.0-TEST');
    expect(body).toContain('Was ist passiert');
  });
});

describe('reportMenuLabel', () => {
  it('liefert lokalisierte Beschriftung', () => {
    expect(reportMenuLabel('de')).toBe('Problem melden…');
    expect(reportMenuLabel('en')).toBe('Report a problem…');
  });
});

describe('openReportDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.getElementById('chatmail-report-css')?.remove();
  });

  it('rendert ein Overlay mit genau den zwei Melde-Optionen (kein Textfeld)', () => {
    const overlay = openReportDialog(baseInput());
    expect(document.getElementById('chatmail-report-overlay')).toBe(overlay);
    // Nur die zwei Optionen — kein beschreibbares Textfeld mehr.
    expect(overlay.querySelector('#cmRepTxt')).toBeNull();
    expect(overlay.querySelector('textarea')).toBeNull();
    expect(overlay.querySelector('#cmRepGh')).not.toBeNull();
    expect(overlay.querySelector('#cmRepMail')).not.toBeNull();
  });

  it('Schließen-Button entfernt das Overlay', () => {
    const overlay = openReportDialog(baseInput());
    overlay.querySelector<HTMLButtonElement>('#cmRepClose')!.click();
    expect(document.getElementById('chatmail-report-overlay')).toBeNull();
  });

  it('öffnet nur ein Overlay (kein Doppel)', () => {
    openReportDialog(baseInput());
    openReportDialog(baseInput());
    expect(document.querySelectorAll('#chatmail-report-overlay').length).toBe(1);
  });
});
