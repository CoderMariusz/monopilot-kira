/**
 * @vitest-environment jsdom
 * T-119 — BriefListTable parity evidence harness (RTL/DOM-snapshot fallback).
 *
 * Playwright happy-path capture needs a running Next server + Supabase auth +
 * seeded brief/npd_projects rows (the module-level Gate-5 live-deploy
 * verification). At the component-task layer that stack is unavailable, so — per
 * the costing/compliance evidence convention in this repo and
 * `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md` ("Playwright trace/video/
 * artifacts where applicable; OR a documented blocker") — this harness renders
 * every required UI state (loading / empty / populated / error /
 * permission-denied) and writes the resulting DOM to
 * apps/web/e2e/parity-evidence/npd/T-119/<state>.html.
 *
 * These artifacts are the parity-diff source (prototype brief-screens.jsx:7-82
 * BriefList → production DOM) and the per-state evidence. The optimistic state
 * (Create → ?modal=briefCreate URL transition) is exercised in
 * brief-list-table.test.tsx (router.push assertion).
 *
 * a11y: no axe-core in the jsdom UI env (documented blocker — same as T-075).
 * This harness asserts the structural a11y baseline instead (semantic <th
 * scope>, labelled search input, aria-labelled toolbar group, role=alert/status
 * notices). A full axe scan is deferred to the module-level Playwright pass.
 */

import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BriefListTable,
  type BriefListLabels,
  type BriefListRow,
  type PageState,
} from '../brief-list-table';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/briefs',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => cleanup());

const OUT_DIR = path.resolve(__dirname, '../../../../../../../e2e/parity-evidence/npd/T-119');

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

// Production English labels (mirrors page.tsx DEFAULT_LABELS / npd.briefList).
const LABELS: BriefListLabels = {
  title: 'NPD Briefs',
  subtitle: 'Briefs are pre-FA intake',
  createBrief: '+ New Brief',
  searchPlaceholder: 'Search brief name or dev code…',
  filterStatus: 'Status',
  filterTemplate: 'Template',
  clearFilters: 'Clear filters',
  statusAll: 'All statuses',
  templateAll: 'All templates',
  colDevCode: 'Dev Code',
  colProductName: 'Product Name',
  colTemplate: 'Template',
  colStatus: 'Status',
  colLinkedProject: 'Linked Project',
  colCreated: 'Created',
  colOwner: 'Owner',
  colActions: 'Actions',
  open: 'Open',
  convert: 'Convert',
  templateSingle: 'Single',
  templateMulti: 'Multi',
  statusDraft: 'Draft',
  statusComplete: 'Complete',
  statusConverted: '✓ Converted',
  statusAbandoned: 'Abandoned',
  noProject: '—',
  noOwner: '—',
  loading: 'Loading briefs…',
  empty: 'No briefs match your filters',
  emptyBody:
    'Briefs are pre-FA intake records. Start a new one or clear your filters to see existing briefs.',
  error: 'Unable to load briefs. Try again after the backend is available.',
  forbidden: 'You do not have permission to view briefs.',
};

function write(state: string, html: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${state}.html`), html, 'utf8');
}

describe('BriefListTable — parity evidence capture (brief-screens.jsx:7-82)', () => {
  const cases: Array<{ state: PageState; rows: BriefListRow[]; canCreate: boolean }> = [
    { state: 'loading', rows: ROWS, canCreate: true },
    { state: 'empty', rows: [], canCreate: true },
    { state: 'ready', rows: ROWS, canCreate: true },
    { state: 'error', rows: ROWS, canCreate: true },
    { state: 'permission_denied', rows: [], canCreate: false },
  ];

  it.each(cases)('captures DOM for state=$state', ({ state, rows, canCreate }) => {
    const { container } = render(
      <BriefListTable rows={rows} labels={LABELS} canCreate={canCreate} canConvert state={state} />,
    );
    write(state === 'ready' ? 'populated' : state, container.innerHTML);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('a11y baseline (axe blocker documented): semantic table + labelled controls', () => {
    render(<BriefListTable rows={ROWS} labels={LABELS} canCreate canConvert state="ready" />);
    // Toolbar group is aria-labelled.
    expect(screen.getByRole('group', { name: LABELS.title })).toBeInTheDocument();
    // Search input has an accessible name.
    expect(screen.getByPlaceholderText(LABELS.searchPlaceholder)).toBeInTheDocument();
    // Every header cell carries scope=col.
    const headers = screen.getAllByRole('columnheader');
    for (const th of headers) expect(th).toHaveAttribute('scope', 'col');
    // Status is conveyed by text (color is never the sole signal).
    const row = screen.getByTestId('brief-list-row-DEV26-061');
    expect(within(row).getByText(LABELS.statusComplete)).toBeInTheDocument();
  });

  it('error/permission notices use assertive a11y roles', () => {
    const { unmount } = render(
      <BriefListTable rows={[]} labels={LABELS} canCreate={false} state="error" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.error);
    unmount();
    render(<BriefListTable rows={[]} labels={LABELS} canCreate={false} state="permission_denied" />);
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
  });
});
