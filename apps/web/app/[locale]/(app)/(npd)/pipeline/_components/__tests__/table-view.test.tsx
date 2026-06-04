/**
 * @vitest-environment jsdom
 * T-128 — Pipeline TableView (pipeline_table prototype) component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:54-88 (TableView)
 *
 * RED → GREEN. Asserts:
 *   - PARITY: the 8 dense columns (Code, Name, Type, Current Gate, Priority,
 *     Owner, Target Launch, Progress) rendered through the shadcn Table family
 *     (data-slot="table" — no hand-rolled <table>), gate + priority Badges, and
 *     the accessible progressbar (same projection as the merged Kanban view, on
 *     the REAL ProjectSummary shape from listProjects).
 *   - FUNCTIONAL: clicking a sortable header pushes ?sort=<col>&dir=<asc|desc>
 *     into the URL (useRouter + useSearchParams) and re-orders the rows; a second
 *     click on the same column flips the direction.
 *   - BULK: checking one or more rows reveals the bulk-actions toolbar with the
 *     Assign Owner / Set Priority / Move Gate Buttons (shadcn Button primitives).
 *   - STATES: loading / empty / error / permission_denied render their notices;
 *     populated renders the grid.
 *   - i18n: every visible string comes from the injected labels (no hard-coded
 *     user-facing copy).
 *
 * Conflict deviation (documented in the closeout deviation log):
 *   The canonical prototype TableView (pipeline.jsx:54-88) is @deprecated
 *   (BL-NPD-02, legacy R&D stage model brief/recipe/…). The production pipeline is
 *   the Stage-Gate model (G0..Launched, gate-helpers.ts); the "Stage" column is
 *   the current GATE and the row labels use the merged ProjectSummary fields. The
 *   sortable headers + URL persistence + bulk-actions toolbar are the T-128
 *   contract (?sort=&dir=) layered on top of the prototype's static table.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TableView } from '../table-view';
import type { TableLabels, TableProject } from '../table-view';

const pushMock = vi.fn();
let currentParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/pipeline',
  useSearchParams: () => currentParams,
}));

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  currentParams = new URLSearchParams();
});

const LABELS: TableLabels = {
  title: 'Pipeline',
  caption: 'NPD projects',
  colCode: 'Code',
  colName: 'Name',
  colType: 'Type',
  colGate: 'Current Gate',
  colPriority: 'Priority',
  colOwner: 'Owner',
  colTarget: 'Target Launch',
  colProgress: 'Progress',
  gateG0: 'G0 · Concept',
  gateG1: 'G1 · Brief',
  gateG2: 'G2 · Recipe',
  gateG3: 'G3 · Trial',
  gateG4: 'G4 · Approval',
  gateLaunched: 'Launched',
  prioHigh: 'High',
  prioNormal: 'Normal',
  prioLow: 'Low',
  noOwner: 'Unassigned',
  noTarget: 'No target',
  sortAsc: 'sorted ascending',
  sortDesc: 'sorted descending',
  sortNone: 'not sorted',
  selectAll: 'Select all rows',
  selectRow: 'Select row',
  selectedCount: '{count} selected',
  bulkAssignOwner: 'Assign Owner',
  bulkSetPriority: 'Set Priority',
  bulkMoveGate: 'Move Gate',
  loading: 'Loading pipeline…',
  empty: 'No projects in the pipeline',
  emptyBody: 'Start a new Stage-Gate project to populate the board.',
  error: 'Unable to load the pipeline.',
  forbidden: 'You do not have permission to view the pipeline.',
};

const PROJECTS: TableProject[] = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    code: 'DEV-052',
    name: 'Strawberry Yogurt 150g',
    type: 'single',
    currentGate: 'G0',
    prio: 'high',
    owner: 'Ana Owner',
    targetLaunch: '2026-09-01',
    progressPercent: 20,
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    code: 'DEV-061',
    name: 'Vanilla Custard 500g',
    type: 'multi',
    currentGate: 'G2',
    prio: 'normal',
    owner: 'Bo Owner',
    targetLaunch: '2026-07-01',
    progressPercent: 55,
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    code: 'DEV-007',
    name: 'Almond Drink 1L',
    type: 'single',
    currentGate: 'Launched',
    prio: 'low',
    owner: null,
    targetLaunch: null,
    progressPercent: 100,
  },
];

function renderView(overrides: Partial<React.ComponentProps<typeof TableView>> = {}) {
  return render(<TableView projects={PROJECTS} labels={LABELS} {...overrides} />);
}

describe('T-128 Pipeline TableView — parity', () => {
  it('renders the 8 prototype columns through the shadcn Table family', () => {
    const { container } = renderView();
    // shadcn Table primitive (data-slot), not a hand-rolled <table>.
    expect(container.querySelector('[data-slot="table"]')).not.toBeNull();

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    for (const label of [
      LABELS.colCode,
      LABELS.colName,
      LABELS.colType,
      LABELS.colGate,
      LABELS.colPriority,
      LABELS.colOwner,
      LABELS.colTarget,
      LABELS.colProgress,
    ]) {
      expect(headers.some((h) => h.includes(label))).toBe(true);
    }
  });

  it('renders gate + priority Badges and an accessible progressbar per row', () => {
    renderView();
    const row = screen.getByTestId('pipeline-table-row-DEV-052');
    expect(within(row).getByText(LABELS.gateG0)).toBeInTheDocument();
    expect(within(row).getByText(LABELS.prioHigh)).toBeInTheDocument();
    const bar = within(row).getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '20');
  });

  it('falls back to the no-owner / no-target labels (real nullable fields)', () => {
    renderView();
    const row = screen.getByTestId('pipeline-table-row-DEV-007');
    expect(within(row).getByText(LABELS.noOwner)).toBeInTheDocument();
    expect(within(row).getByText(LABELS.noTarget)).toBeInTheDocument();
  });
});

describe('T-128 Pipeline TableView — sort + URL persistence', () => {
  it('pushes ?sort=code&dir=asc on first header click and flips to desc on the second', () => {
    renderView();
    const codeHeaderBtn = screen.getByRole('button', { name: new RegExp(LABELS.colCode) });

    fireEvent.click(codeHeaderBtn);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0][0]).toContain('sort=code');
    expect(pushMock.mock.calls[0][0]).toContain('dir=asc');

    // Simulate the URL having settled at asc, then click again → desc.
    currentParams = new URLSearchParams('sort=code&dir=asc');
    cleanup();
    renderView();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(LABELS.colCode) }));
    expect(pushMock.mock.calls.at(-1)?.[0]).toContain('dir=desc');
  });

  it('orders the rows by the active sort param read from the URL', () => {
    currentParams = new URLSearchParams('sort=code&dir=asc');
    renderView();
    const rows = screen.getAllByTestId(/^pipeline-table-row-/);
    const codes = rows.map((r) => r.getAttribute('data-code'));
    expect(codes).toEqual(['DEV-007', 'DEV-052', 'DEV-061']);
  });
});

describe('T-128 Pipeline TableView — bulk actions', () => {
  it('hides the bulk toolbar until a row is selected, then shows the three actions', () => {
    renderView();
    expect(screen.queryByRole('toolbar', { name: /selected/i })).not.toBeInTheDocument();

    const rowCheckbox = within(screen.getByTestId('pipeline-table-row-DEV-052')).getByRole('checkbox');
    fireEvent.click(rowCheckbox);

    const toolbar = screen.getByRole('toolbar');
    expect(within(toolbar).getByRole('button', { name: LABELS.bulkAssignOwner })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: LABELS.bulkSetPriority })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: LABELS.bulkMoveGate })).toBeInTheDocument();
  });

  it('select-all header checkbox selects every row', () => {
    renderView();
    const selectAll = screen.getByRole('checkbox', { name: LABELS.selectAll });
    fireEvent.click(selectAll);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.textContent).toContain('3');
  });
});

describe('T-128 Pipeline TableView — states', () => {
  it('renders the loading notice', () => {
    renderView({ projects: [], state: 'loading' });
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('renders the empty notice', () => {
    renderView({ projects: [], state: 'empty' });
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
  });

  it('renders the error notice', () => {
    renderView({ projects: [], state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.error);
  });

  it('renders the permission-denied notice', () => {
    renderView({ projects: [], state: 'permission_denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
  });
});

describe('T-128 Pipeline TableView — row selection callback', () => {
  it('invokes onSelect with the project id when a row is activated', () => {
    const onSelect = vi.fn();
    renderView({ onSelect });
    fireEvent.click(screen.getByTestId('pipeline-table-row-DEV-061'));
    expect(onSelect).toHaveBeenCalledWith('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  });
});
