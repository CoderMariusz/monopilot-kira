/**
 * @vitest-environment jsdom
 * Lane 12 — FaBomTab component test (SCR-03h BOM computed view).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:840-886 (FABOMTab)
 *
 * Asserts:
 *  - Parity: 7 columns (Type/Code/Name/Qty/Stage/Source/D365 status) + RM→blue /
 *    PM→violet type badges + D365 status badges (Found/No cost/Missing) + the
 *    version header line + the read-only note.
 *  - The five required UI states (loading / empty / ready / error / permission_denied).
 *  - Empty state: read-only note + a Technical BOM shortcut link (READ-ONLY — writes
 *    stay in Technical).
 *  - Export CSV: the button calls the wired (previously dead-code) bom_export_csv
 *    action exactly once and blob-downloads the result.
 *  - i18n: the component renders LABELS (message values), never inline English literals.
 *  - RBAC: permission_denied is a server-resolved state (rendered, not client-trusted).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FaBomTab, type FaBomTabLabels } from '../fa-bom-tab';
import type { FaBomLine, FaBomVersion } from '../../_actions/get-fa-bom';

afterEach(() => cleanup());

// Distinct sentinel strings prove the component renders LABELS (i18n message
// values), never inline English literals.
const LABELS: FaBomTabLabels = {
  title: 'lbl.title',
  readOnlyNote: 'lbl.readOnlyNote',
  exportCsv: 'lbl.exportCsv',
  exporting: 'lbl.exporting',
  exportError: 'lbl.exportError',
  versionLine: 'v{version} · {status} · {count} lines',
  statusLabels: { active: 'lbl.active', draft: 'lbl.draft' },
  colType: 'lbl.colType',
  colCode: 'lbl.colCode',
  colName: 'lbl.colName',
  colQty: 'lbl.colQty',
  colStage: 'lbl.colStage',
  colSource: 'lbl.colSource',
  colD365: 'lbl.colD365',
  d365Found: 'lbl.found',
  d365NoCost: 'lbl.nocost',
  d365Missing: 'lbl.missing',
  d365Empty: 'lbl.notind365',
  loading: 'lbl.loading',
  error: 'lbl.error',
  forbidden: 'lbl.forbidden',
  empty: 'lbl.empty',
  emptyBody: 'lbl.emptyBody',
  technicalLink: 'lbl.technicalLink',
};

const VERSION: FaBomVersion = {
  bomHeaderId: 'bom-1',
  status: 'active',
  version: 2,
  lineCount: 3,
};

const LINES: FaBomLine[] = [
  {
    componentType: 'RM',
    componentCode: 'RM1939',
    componentName: 'Main component',
    quantity: '1.000000',
    processStage: 'Input',
    source: 'Core',
    d365Status: 'Found',
  },
  {
    componentType: 'PM',
    componentCode: 'BX-PL-240',
    componentName: 'Box',
    quantity: '1.000000',
    processStage: 'Pack',
    source: 'MRP',
    d365Status: 'No cost',
  },
  {
    componentType: 'PM',
    componentCode: 'MRP-FLM-005',
    componentName: 'Film',
    quantity: '0.060000',
    processStage: 'Pack',
    source: 'MRP',
    d365Status: 'Missing',
  },
];

describe('FaBomTab — SCR-03h BOM computed view (Lane 12)', () => {
  it('renders the 7 prototype columns, type badges, D365 badges + version header (ready)', () => {
    render(<FaBomTab productCode="FG-NPD-003" version={VERSION} lines={LINES} labels={LABELS} state="ready" />);

    // Card title + read-only note (parity).
    expect(screen.getByText('lbl.title')).toBeInTheDocument();
    expect(screen.getByTestId('fa-bom-readonly-note')).toHaveTextContent('lbl.readOnlyNote');

    // Version header: v2 · active(→lbl.active) · 3 lines.
    expect(screen.getByTestId('fa-bom-version')).toHaveTextContent('v2 · lbl.active · 3 lines');

    // 7 column headers (labels, not inline literals).
    const table = screen.getByTestId('fa-bom-table');
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'lbl.colType',
      'lbl.colCode',
      'lbl.colName',
      'lbl.colQty',
      'lbl.colStage',
      'lbl.colSource',
      'lbl.colD365',
    ]);

    // One row per line.
    const rows = screen.getAllByTestId('fa-bom-row');
    expect(rows).toHaveLength(3);

    // RM → blue badge, PM → violet badge (prototype parity).
    const firstRow = rows[0];
    expect(within(firstRow).getByText('RM')).toHaveClass('badge', 'badge-blue');
    expect(within(rows[1]).getByText('PM')).toHaveClass('badge', 'badge-violet');

    // D365 status badges: Found→green / No cost→amber / Missing→red.
    expect(within(firstRow).getByText(/lbl.found/)).toHaveClass('badge', 'badge-green');
    expect(within(rows[1]).getByText(/lbl.nocost/)).toHaveClass('badge', 'badge-amber');
    expect(within(rows[2]).getByText(/lbl.missing/)).toHaveClass('badge', 'badge-red');

    // Mono code + name cells render the real data.
    expect(within(firstRow).getByText('RM1939')).toBeInTheDocument();
    expect(within(firstRow).getByText('Main component')).toBeInTheDocument();
  });

  it('renders the read-only empty state with a Technical BOM shortcut link', () => {
    render(<FaBomTab productCode="FG-NPD-003" version={null} lines={[]} labels={LABELS} state="empty" />);

    expect(screen.getByTestId('fa-bom-empty')).toBeInTheDocument();
    expect(screen.getByText('lbl.empty')).toBeInTheDocument();
    expect(screen.getByText('lbl.emptyBody')).toBeInTheDocument();
    expect(screen.getByText('lbl.readOnlyNote')).toBeInTheDocument();

    const link = screen.getByTestId('fa-bom-technical-link');
    expect(link).toHaveAttribute('href', '/technical/bom');
    expect(link).toHaveTextContent('lbl.technicalLink');

    // No table / no export button in the empty state.
    expect(screen.queryByTestId('fa-bom-table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fa-bom-export')).not.toBeInTheDocument();
  });

  it('renders the loading state (role=status)', () => {
    render(<FaBomTab productCode="FG-NPD-003" version={null} lines={[]} labels={LABELS} state="loading" />);
    expect(screen.getByRole('status')).toHaveTextContent('lbl.loading');
  });

  it('renders the error state (role=alert)', () => {
    render(<FaBomTab productCode="FG-NPD-003" version={null} lines={[]} labels={LABELS} state="error" />);
    expect(screen.getByTestId('fa-bom-error')).toHaveTextContent('lbl.error');
  });

  it('renders the permission_denied state (server-resolved, not client-trusted)', () => {
    render(
      <FaBomTab productCode="FG-NPD-003" version={null} lines={[]} labels={LABELS} state="permission_denied" />,
    );
    expect(screen.getByTestId('fa-bom-forbidden')).toHaveTextContent('lbl.forbidden');
  });

  it('Export CSV button calls the wired bom_export_csv action once and downloads the result', async () => {
    const user = userEvent.setup();

    // Stub the URL.createObjectURL / anchor.click download path.
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    // @ts-expect-error jsdom URL has no createObjectURL by default
    URL.createObjectURL = createObjectURL;
    // @ts-expect-error jsdom URL has no revokeObjectURL by default
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const onExportCsv = vi.fn(async (_code: string) => new Response('a,b,c\n1,2,3\n', { status: 200 }));

    render(
      <FaBomTab
        productCode="FG-NPD-003"
        version={VERSION}
        lines={LINES}
        labels={LABELS}
        state="ready"
        onExportCsv={onExportCsv}
      />,
    );

    const exportBtn = screen.getByTestId('fa-bom-export');
    expect(exportBtn).toHaveTextContent('lbl.exportCsv');

    await user.click(exportBtn);

    await waitFor(() => expect(onExportCsv).toHaveBeenCalledTimes(1));
    expect(onExportCsv).toHaveBeenCalledWith('FG-NPD-003');
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
  });

  it('shows an export error notice when the action throws', async () => {
    const user = userEvent.setup();
    const onExportCsv = vi.fn(async () => {
      throw new Error('boom');
    });

    render(
      <FaBomTab
        productCode="FG-NPD-003"
        version={VERSION}
        lines={LINES}
        labels={LABELS}
        state="ready"
        onExportCsv={onExportCsv}
      />,
    );

    await user.click(screen.getByTestId('fa-bom-export'));
    await waitFor(() =>
      expect(screen.getByTestId('fa-bom-export-error')).toHaveTextContent('lbl.exportError'),
    );
  });
});
