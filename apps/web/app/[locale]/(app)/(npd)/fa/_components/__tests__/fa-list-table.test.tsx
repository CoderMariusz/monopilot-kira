/**
 * @vitest-environment jsdom
 * T-019 — FA list table (fa_list prototype) component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:177-297 (FAList)
 *
 * RED → GREEN: asserts the parity checklist (column order, dept filter chip
 * region, shadcn primitives), the four required UI states (loading / empty /
 * populated / error), i18n-key resolution (no hard-coded user-facing strings
 * leak through default labels), and the RBAC create gate.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FaListTable, type FaListRow, type FaListLabels } from '../fa-list-table';

afterEach(() => cleanup());

// Mirror the prototype's data shape (window.NPD_FAS) → real product columns.
const ROWS: FaListRow[] = [
  {
    productCode: 'FA1001',
    productName: 'Strawberry Yogurt 150g',
    packSize: '150g',
    statusOverall: 'Complete',
    daysToLaunch: 30,
    built: false,
    dept: {
      core: 'done',
      planning: 'done',
      commercial: 'done',
      production: 'inprog',
      technical: 'pending',
      mrp: 'blocked',
      procurement: 'pending',
    },
  },
  {
    productCode: 'FA1002',
    productName: 'Vanilla Custard 500g',
    packSize: '500g',
    statusOverall: 'Built',
    daysToLaunch: 5,
    built: true,
    dept: {
      core: 'done',
      planning: 'done',
      commercial: 'done',
      production: 'done',
      technical: 'done',
      mrp: 'done',
      procurement: 'done',
    },
  },
];

// Distinct sentinel strings so the test proves the component renders LABELS
// (i18n message values), never inline English literals.
const LABELS: FaListLabels = {
  title: 'lbl.title',
  subtitle: 'lbl.subtitle',
  createFa: 'lbl.createFa',
  searchPlaceholder: 'lbl.search',
  filterDept: 'lbl.filterDept',
  filterStatus: 'lbl.filterStatus',
  clearFilters: 'lbl.clear',
  showClosed: 'lbl.showClosed',
  deptAll: 'lbl.deptAll',
  statusAll: 'lbl.statusAll',
  colProductCode: 'lbl.colProductCode',
  colProductName: 'lbl.colProductName',
  colPackSize: 'lbl.colPackSize',
  colStatus: 'lbl.colStatus',
  colLaunch: 'lbl.colLaunch',
  colDaysToLaunch: 'lbl.colDaysToLaunch',
  colBuilt: 'lbl.colBuilt',
  colActions: 'lbl.colActions',
  open: 'lbl.open',
  deptCore: 'lbl.deptCore',
  deptPlanning: 'lbl.deptPlanning',
  deptCommercial: 'lbl.deptCommercial',
  deptProduction: 'lbl.deptProduction',
  deptTechnical: 'lbl.deptTechnical',
  deptMrp: 'lbl.deptMrp',
  deptProcurement: 'lbl.deptProcurement',
  statusBuilt: 'lbl.statusBuilt',
  statusComplete: 'lbl.statusComplete',
  statusAlert: 'lbl.statusAlert',
  statusInProgress: 'lbl.statusInProgress',
  statusPending: 'lbl.statusPending',
  noDate: 'lbl.noDate',
  loading: 'lbl.loading',
  empty: 'lbl.empty',
  emptyBody: 'lbl.emptyBody',
  error: 'lbl.error',
  forbidden: 'lbl.forbidden',
};

function renderTable(overrides: Partial<React.ComponentProps<typeof FaListTable>> = {}) {
  return render(
    <FaListTable rows={ROWS} labels={LABELS} canCreate state="ready" {...overrides} />,
  );
}

describe('FaListTable — prototype parity (fa-screens.jsx:177-297)', () => {
  it('renders the 6 named parity columns in the prototype order', () => {
    renderTable();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    const codeIdx = headers.indexOf(LABELS.colProductCode);
    const nameIdx = headers.indexOf(LABELS.colProductName);
    const packIdx = headers.indexOf(LABELS.colPackSize);
    const statusIdx = headers.indexOf(LABELS.colStatus);
    const daysIdx = headers.indexOf(LABELS.colDaysToLaunch);
    const builtIdx = headers.indexOf(LABELS.colBuilt);

    expect(codeIdx).toBeGreaterThanOrEqual(0);
    // Prototype column order: FA Code → Product Name → Pack → Status → … → Days left → … → Built
    expect(codeIdx).toBeLessThan(nameIdx);
    expect(nameIdx).toBeLessThan(packIdx);
    expect(packIdx).toBeLessThan(statusIdx);
    expect(statusIdx).toBeLessThan(daysIdx);
    expect(daysIdx).toBeLessThan(builtIdx);
  });

  it('renders the 7 dept columns from the prototype (Co Pl Cm Pr Tc Mr Pc)', () => {
    renderTable();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    for (const dept of [
      LABELS.deptCore,
      LABELS.deptPlanning,
      LABELS.deptCommercial,
      LABELS.deptProduction,
      LABELS.deptTechnical,
      LABELS.deptMrp,
      LABELS.deptProcurement,
    ]) {
      expect(headers.some((h) => h.includes(dept))).toBe(true);
    }
  });

  it('renders a dept filter chip/region region above the table using shadcn primitives', () => {
    renderTable();
    // Toolbar region present
    expect(screen.getByRole('group', { name: LABELS.title })).toBeInTheDocument();
    // shadcn Select (combobox) for dept + status — NO raw <select>
    const combos = screen.getAllByRole('combobox');
    expect(combos.length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector('select')).toBeNull();
    // shadcn Table primitive
    expect(document.querySelector('[data-slot="table"]')).not.toBeNull();
    // shadcn Badge for status pill
    expect(document.querySelector('[data-slot="badge"]')).not.toBeNull();
  });

  it('renders a status pill (shadcn Badge) per row mapped from status_overall', () => {
    renderTable();
    const row = screen.getByTestId('fa-list-row-FA1001');
    expect(within(row).getByText(LABELS.statusComplete)).toBeInTheDocument();
  });

  it('links each row to /(npd)/fa/[productCode]', () => {
    renderTable();
    const link = screen.getByRole('link', { name: /FA1001/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('/fa/FA1001'));
  });
});

describe('FaListTable — required UI states', () => {
  it('loading: shows a polite status with the loading label', () => {
    renderTable({ state: 'loading' });
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('empty: shows the empty-state copy from the prototype EmptyState', () => {
    renderTable({ rows: [], state: 'empty' });
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
  });

  it('error: shows an alert with the error label', () => {
    renderTable({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.error);
  });

  it('populated: renders one row per product', () => {
    renderTable();
    expect(screen.getAllByTestId(/^fa-list-row-/)).toHaveLength(ROWS.length);
  });
});

describe('FaListTable — RBAC create gate (server-supplied canCreate)', () => {
  it('shows the Create FA button when canCreate is true', () => {
    renderTable({ canCreate: true });
    expect(screen.getByRole('button', { name: LABELS.createFa })).toBeInTheDocument();
  });

  it('hides the Create FA button when canCreate is false (no render-then-disable)', () => {
    renderTable({ canCreate: false });
    expect(screen.queryByRole('button', { name: LABELS.createFa })).toBeNull();
  });

  it('renders permission-denied state without leaking the table', () => {
    renderTable({ state: 'permission_denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
    expect(document.querySelector('[data-slot="table"]')).toBeNull();
  });
});
