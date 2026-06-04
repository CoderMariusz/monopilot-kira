/**
 * @vitest-environment jsdom
 * T-119 — Brief list table (brief_list prototype) component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/brief-screens.jsx:7-82 (BriefList)
 *
 * RED → GREEN: asserts the parity checklist (column order, status filter chip
 * region + search input + template filter, shadcn primitives), the e2e-spine
 * linked-project cell (DEV-NNN + current_gate → Stage-Gate project detail), the
 * five required UI states (loading / empty / populated / error / permission),
 * i18n-key resolution (no hard-coded user-facing strings), the RBAC create gate,
 * and the Create-button URL transition (?modal=briefCreate).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BriefListTable, type BriefListLabels, type BriefListRow } from '../brief-list-table';

// next/navigation is used by the Create button to push ?modal=briefCreate.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/briefs',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  pushMock.mockReset();
});

// Mirror the prototype's data shape (window.NPD_BRIEFS) → real brief columns
// joined to npd_projects for the e2e-spine linked-project cell.
const ROWS: BriefListRow[] = [
  {
    briefId: '11111111-1111-1111-1111-111111111111',
    devCode: 'DEV26-052',
    productName: 'Strawberry Yogurt 150g',
    template: 'single_component',
    status: 'draft',
    createdAt: '2026-05-01',
    owner: 'Ana Owner',
    projectCode: 'DEV-052',
    projectGate: 'G0',
    projectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  },
  {
    briefId: '22222222-2222-2222-2222-222222222222',
    devCode: 'DEV26-061',
    productName: 'Vanilla Custard 500g',
    template: 'multi_component',
    status: 'complete',
    createdAt: '2026-05-10',
    owner: 'Bo Owner',
    projectCode: 'DEV-061',
    projectGate: 'G1',
    projectId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  },
  {
    briefId: '33333333-3333-3333-3333-333333333333',
    devCode: 'DEV26-070',
    productName: 'Lemon Tart 90g',
    template: 'single_component',
    status: 'converted',
    createdAt: '2026-05-20',
    owner: null,
    projectCode: null,
    projectGate: null,
    projectId: null,
  },
];

// Distinct sentinel strings so the test proves the component renders LABELS
// (i18n message values), never inline English literals.
const LABELS: BriefListLabels = {
  title: 'lbl.title',
  subtitle: 'lbl.subtitle',
  createBrief: 'lbl.createBrief',
  searchPlaceholder: 'lbl.search',
  filterStatus: 'lbl.filterStatus',
  filterTemplate: 'lbl.filterTemplate',
  clearFilters: 'lbl.clear',
  statusAll: 'lbl.statusAll',
  templateAll: 'lbl.templateAll',
  colDevCode: 'lbl.colDevCode',
  colProductName: 'lbl.colProductName',
  colTemplate: 'lbl.colTemplate',
  colStatus: 'lbl.colStatus',
  colLinkedProject: 'lbl.colLinkedProject',
  colCreated: 'lbl.colCreated',
  colOwner: 'lbl.colOwner',
  colActions: 'lbl.colActions',
  open: 'lbl.open',
  convert: 'lbl.convert',
  templateSingle: 'lbl.templateSingle',
  templateMulti: 'lbl.templateMulti',
  statusDraft: 'lbl.statusDraft',
  statusComplete: 'lbl.statusComplete',
  statusConverted: 'lbl.statusConverted',
  statusAbandoned: 'lbl.statusAbandoned',
  noProject: 'lbl.noProject',
  noOwner: 'lbl.noOwner',
  loading: 'lbl.loading',
  empty: 'lbl.empty',
  emptyBody: 'lbl.emptyBody',
  error: 'lbl.error',
  forbidden: 'lbl.forbidden',
};

function renderTable(overrides: Partial<React.ComponentProps<typeof BriefListTable>> = {}) {
  return render(<BriefListTable rows={ROWS} labels={LABELS} canCreate state="ready" {...overrides} />);
}

describe('BriefListTable — prototype parity (brief-screens.jsx:7-82)', () => {
  it('renders the parity columns in the prototype order', () => {
    renderTable();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    const devIdx = headers.findIndex((h) => h.includes(LABELS.colDevCode));
    const nameIdx = headers.findIndex((h) => h.includes(LABELS.colProductName));
    const tmplIdx = headers.findIndex((h) => h.includes(LABELS.colTemplate));
    const statusIdx = headers.findIndex((h) => h.includes(LABELS.colStatus));
    const linkedIdx = headers.findIndex((h) => h.includes(LABELS.colLinkedProject));
    const createdIdx = headers.findIndex((h) => h.includes(LABELS.colCreated));
    const ownerIdx = headers.findIndex((h) => h.includes(LABELS.colOwner));

    // Prototype order: Dev Code → Product Name → Template → Status → Linked → Created → Owner → Actions
    expect(devIdx).toBeGreaterThanOrEqual(0);
    expect(devIdx).toBeLessThan(nameIdx);
    expect(nameIdx).toBeLessThan(tmplIdx);
    expect(tmplIdx).toBeLessThan(statusIdx);
    expect(statusIdx).toBeLessThan(linkedIdx);
    expect(linkedIdx).toBeLessThan(createdIdx);
    expect(createdIdx).toBeLessThan(ownerIdx);
  });

  it('renders a status filter region (search + status + template) with shadcn primitives, no raw <select>', () => {
    renderTable();
    expect(screen.getByRole('group', { name: LABELS.title })).toBeInTheDocument();
    // shadcn Select (combobox) for status + template — raw <select> is a red-line.
    const combos = screen.getAllByRole('combobox');
    expect(combos.length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector('select')).toBeNull();
    // search input present
    expect(screen.getByPlaceholderText(LABELS.searchPlaceholder)).toBeInTheDocument();
    // shadcn Table + Badge primitives
    expect(document.querySelector('[data-slot="table"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="badge"]')).not.toBeNull();
  });

  it('renders a status pill (shadcn Badge) per row mapped from status', () => {
    renderTable();
    const row = screen.getByTestId('brief-list-row-DEV26-052');
    expect(within(row).getByText(LABELS.statusDraft)).toBeInTheDocument();
  });

  it('links each row dev_code to the brief detail page', () => {
    renderTable();
    const link = screen.getByRole('link', { name: /DEV26-052/ });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('/briefs/11111111-1111-1111-1111-111111111111'),
    );
  });
});

describe('BriefListTable — e2e-spine linked-project cell', () => {
  it('renders DEV-NNN + current_gate and links to the Stage-Gate project detail (not FA)', () => {
    renderTable();
    const row = screen.getByTestId('brief-list-row-DEV26-061');
    expect(within(row).getByText(/DEV-061/)).toBeInTheDocument();
    expect(within(row).getByText(/G1/)).toBeInTheDocument();
    const projectLink = within(row).getByRole('link', { name: /DEV-061/ });
    expect(projectLink).toHaveAttribute(
      'href',
      expect.stringContaining('/pipeline/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
    );
    // must NOT point at an FA route
    expect(projectLink.getAttribute('href')).not.toContain('/fa/');
  });

  it('shows the no-project placeholder when a brief is not yet linked', () => {
    renderTable();
    const row = screen.getByTestId('brief-list-row-DEV26-070');
    expect(within(row).getByText(LABELS.noProject)).toBeInTheDocument();
  });
});

describe('BriefListTable — Create button URL transition', () => {
  it('pushes ?modal=briefCreate when the Create button is clicked', () => {
    renderTable({ canCreate: true });
    fireEvent.click(screen.getByRole('button', { name: LABELS.createBrief }));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(String(pushMock.mock.calls[0][0])).toContain('modal=briefCreate');
  });
});

describe('BriefListTable — required UI states', () => {
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

  it('populated: renders one row per brief', () => {
    renderTable();
    expect(screen.getAllByTestId(/^brief-list-row-/)).toHaveLength(ROWS.length);
  });
});

describe('BriefListTable — RBAC create gate (server-supplied canCreate)', () => {
  it('shows the Create button when canCreate is true', () => {
    renderTable({ canCreate: true });
    expect(screen.getByRole('button', { name: LABELS.createBrief })).toBeInTheDocument();
  });

  it('hides the Create button when canCreate is false (no render-then-disable)', () => {
    renderTable({ canCreate: false });
    expect(screen.queryByRole('button', { name: LABELS.createBrief })).toBeNull();
  });

  it('renders permission-denied state without leaking the table', () => {
    renderTable({ state: 'permission_denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
    expect(document.querySelector('[data-slot="table"]')).toBeNull();
  });

  it('shows the Convert action only for complete briefs (prototype gate)', () => {
    renderTable({ canConvert: true });
    const completeRow = screen.getByTestId('brief-list-row-DEV26-061');
    expect(within(completeRow).getByRole('button', { name: LABELS.convert })).toBeInTheDocument();
    const draftRow = screen.getByTestId('brief-list-row-DEV26-052');
    expect(within(draftRow).queryByRole('button', { name: LABELS.convert })).toBeNull();
  });
});
