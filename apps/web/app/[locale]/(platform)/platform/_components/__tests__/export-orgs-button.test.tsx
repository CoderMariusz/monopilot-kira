/**
 * @vitest-environment jsdom
 *
 * Export orgs button — client-side CSV of the rendered orgs table.
 *
 * Parity anchor: .btn.btn-secondary
 *   (prototypes/design/Monopilot Design System/platform/platform-console-and-org-shell.html
 *   lines 40-41, 220).
 *
 * The server passes ONLY plain data (no functions cross the boundary).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExportOrgsButton, buildCsv, type ExportOrgRow } from '../export-orgs-button';

const HEADERS: [string, string, string, string, string, string] = [
  'Code',
  'Name',
  'Industry',
  'Sites',
  'Users',
  'Status',
];

const ROWS: ExportOrgRow[] = [
  { code: 'APEX', name: 'Apex Dairy', industry: 'Dairy · Food', sites: 3, users: 28, status: 'Active' },
  { code: 'KOBE', name: 'Kobe, Inc "quoted"', industry: 'Dairy', sites: 2, users: 41, status: 'Active' },
];

afterEach(() => cleanup());

describe('buildCsv', () => {
  it('emits a header row then one CSV line per org, quoting commas and quotes', () => {
    const csv = buildCsv(HEADERS, ROWS);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Code,Name,Industry,Sites,Users,Status');
    expect(lines[1]).toBe('APEX,Apex Dairy,Dairy · Food,3,28,Active');
    // Embedded comma + doubled quotes.
    expect(lines[2]).toBe('KOBE,"Kobe, Inc ""quoted""",Dairy,2,41,Active');
  });

  it('returns just the header when there are no rows', () => {
    expect(buildCsv(HEADERS, [])).toBe('Code,Name,Industry,Sites,Users,Status');
  });
});

describe('buildCsv — CSV-injection hardening', () => {
  // A cell whose raw value leads with a formula trigger char (= + - @) is
  // prefixed with a single quote so spreadsheets treat it as literal text.
  function nameCell(name: string): string {
    const row: ExportOrgRow = {
      code: 'X',
      name,
      industry: 'Ind',
      sites: 1,
      users: 1,
      status: 'Active',
    };
    // The name is the 2nd CSV column.
    return buildCsv(HEADERS, [row]).split('\r\n')[1].split(',')[1];
  }

  it('neutralises a leading = (formula)', () => {
    expect(nameCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
  });

  it('neutralises a leading + (formula)', () => {
    expect(nameCell('+1+1')).toBe("'+1+1");
  });

  it('neutralises a leading - (formula)', () => {
    expect(nameCell('-2+3')).toBe("'-2+3");
  });

  it('neutralises a leading @ (formula)', () => {
    expect(nameCell('@cmd')).toBe("'@cmd");
  });

  it('leaves a non-triggering value untouched', () => {
    expect(nameCell('Apex Dairy')).toBe('Apex Dairy');
  });

  it('quotes a neutralised value that also contains a comma', () => {
    // Prefix the quote first, then RFC-4180 quote because of the embedded comma.
    const line = buildCsv(HEADERS, [
      { code: 'X', name: '=A,B', industry: 'Ind', sites: 1, users: 1, status: 'Active' },
    ]).split('\r\n')[1];
    expect(line).toContain('"\'=A,B"');
  });
});

describe('ExportOrgsButton', () => {
  it('renders the secondary export button and triggers a CSV download on click', () => {
    const createURL = vi.fn(() => 'blob:mock');
    const revokeURL = vi.fn();
    // @ts-expect-error jsdom lacks createObjectURL
    URL.createObjectURL = createURL;
    // @ts-expect-error jsdom lacks revokeObjectURL
    URL.revokeObjectURL = revokeURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ExportOrgsButton label="Export" filename="orgs.csv" headers={HEADERS} rows={ROWS} />);

    const btn = screen.getByTestId('platform-export');
    expect(btn).toHaveTextContent('Export');
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);
    expect(createURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeURL).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
  });

  it('disables export when there are no orgs to export', () => {
    render(<ExportOrgsButton label="Export" filename="orgs.csv" headers={HEADERS} rows={[]} />);
    expect(screen.getByTestId('platform-export')).toBeDisabled();
  });
});
