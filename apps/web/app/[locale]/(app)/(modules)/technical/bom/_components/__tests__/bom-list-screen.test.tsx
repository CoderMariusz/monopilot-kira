/**
 * @vitest-environment jsdom
 * T-037 — BomListScreen (TEC-020) component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/bom-list.jsx:3-95 (BOMList)
 *
 * Asserts the parity checklist (column order FG code / Product / Category / Ver. /
 * Yield / Updated / Status, the status filter tabs All/Draft/Active/In review/
 * Archived with counts, the KPI strip, the "Generate BOMs" + "+ New BOM" CTAs),
 * client-side status filtering + search, the required UI states (loading / empty /
 * error / permission_denied + no-match), and that visible strings come from the
 * injected i18n labels (no default leak). FG is canonical (no FA labels leak).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BomListScreen,
  type BomListData,
  type BomListItem,
  type BomListLabels,
} from '../bom-list-screen';

afterEach(() => cleanup());

const LABELS: BomListLabels = {
  breadcrumbRoot: 'Technical',
  title: 'BOMs & recipes',
  subtitle: 'Bills of materials for finished goods.',
  newBom: '+ New BOM',
  generateBoms: 'Generate BOMs',
  kpiActive: 'Active BOMs',
  kpiTotalSuffix: 'of {n} total',
  kpiDraft: 'Draft',
  kpiInReview: 'In review',
  tabAll: 'All',
  tabDraft: 'Draft',
  tabActive: 'Active',
  tabInReview: 'In review',
  tabArchived: 'Archived',
  colCode: 'FG code',
  colProduct: 'Product',
  colCategory: 'Category',
  colVersion: 'Ver.',
  colYield: 'Yield',
  colUpdated: 'Updated',
  colStatus: 'Status',
  componentsMeta: '{n} components',
  statusDraft: 'Draft',
  statusInReview: 'In review',
  statusApproved: 'Approved',
  statusActive: 'Active',
  statusSuperseded: 'Superseded',
  statusArchived: 'Archived',
  searchPlaceholder: 'Filter by name or FG code…',
  emptyTitle: 'No BOMs yet',
  emptyBody: 'Create a BOM to get started.',
  noMatchTitle: 'No BOMs match this filter',
  noMatchBody: 'Clear the search or try a different status tab.',
  loading: 'Loading BOMs…',
  error: 'Unable to load BOMs. Please try again.',
  forbidden: 'You do not have permission to view BOMs.',
};

const ITEMS: BomListItem[] = [
  {
    productId: 'FG-1001',
    productName: 'Kielbasa slaska 450g',
    category: 'Sausages',
    version: 7,
    status: 'active',
    yieldPct: '91.000',
    componentCount: 8,
    updatedAt: '2026-04-14T00:00:00.000Z',
  },
  {
    productId: 'FG-2002',
    productName: 'Pasztet domowy 200g',
    category: 'Pates',
    version: 2,
    status: 'draft',
    yieldPct: '88.000',
    componentCount: 5,
    updatedAt: '2026-03-01T00:00:00.000Z',
  },
  {
    productId: 'FG-3003',
    productName: 'Szynka konserwowa 300g',
    category: 'Hams',
    version: 4,
    status: 'in_review',
    yieldPct: '85.000',
    componentCount: 6,
    updatedAt: '2026-02-20T00:00:00.000Z',
  },
];

const DATA: BomListData = {
  items: ITEMS,
  kpi: { activeCount: 1, totalCount: 3, draftCount: 1, inReviewCount: 1 },
  detailHrefBase: '/technical/bom',
};

function renderReady(extra?: Partial<React.ComponentProps<typeof BomListScreen>>) {
  return render(<BomListScreen state="ready" data={DATA} labels={LABELS} canCreate canGenerate {...extra} />);
}

describe('BomListScreen — parity', () => {
  it('renders the column headers in canonical order', () => {
    renderReady();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['FG code', 'Product', 'Category', 'Ver.', 'Yield', 'Updated', 'Status']);
  });

  it('renders one row per FG with code, version, yield and status badge', () => {
    renderReady();
    const rows = screen.getAllByTestId('bom-row');
    expect(rows).toHaveLength(3);
    const first = rows[0];
    expect(within(first).getByText('FG-1001')).toBeInTheDocument();
    expect(within(first).getByText('v7')).toBeInTheDocument();
    expect(within(first).getByText('91%')).toBeInTheDocument();
    // Status badge renders glyph + label (design-system semantic badge).
    expect(within(first).getByText(/Active/)).toBeInTheDocument();
  });

  it('renders the status filter tabs with counts', () => {
    renderReady();
    const tabs = screen.getByTestId('bom-status-tabs');
    const labels = within(tabs).getAllByRole('tab').map((t) => t.textContent);
    expect(labels[0]).toContain('All');
    expect(labels[0]).toContain('3');
  });

  it('renders the KPI strip + both top-right CTAs', () => {
    renderReady();
    expect(screen.getByText('Active BOMs')).toBeInTheDocument();
    expect(screen.getByText('of 3 total')).toBeInTheDocument();
    expect(screen.getByTestId('bom-generate-cta')).toHaveTextContent('Generate BOMs');
    expect(screen.getByTestId('bom-new-cta')).toHaveTextContent('+ New BOM');
  });

  it('does not leak the legacy FA label anywhere (FG is canonical)', () => {
    const { container } = renderReady();
    expect(container.textContent).not.toMatch(/\bFA\b/);
    expect(container.textContent).not.toMatch(/Factory Article/i);
  });
});

describe('BomListScreen — filter + search', () => {
  it('filters to only active BOMs when the Active tab is selected', () => {
    renderReady();
    fireEvent.click(screen.getByRole('tab', { name: /Active/ }));
    const rows = screen.getAllByTestId('bom-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('FG-1001')).toBeInTheDocument();
  });

  it('searches by FG code / product name', () => {
    renderReady();
    fireEvent.change(screen.getByLabelText(LABELS.searchPlaceholder), { target: { value: 'pasztet' } });
    const rows = screen.getAllByTestId('bom-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('FG-2002')).toBeInTheDocument();
  });

  it('shows the no-match empty state when nothing matches the search', () => {
    renderReady();
    fireEvent.change(screen.getByLabelText(LABELS.searchPlaceholder), { target: { value: 'zzz-none' } });
    expect(screen.getByText(LABELS.noMatchTitle)).toBeInTheDocument();
    expect(screen.queryAllByTestId('bom-row')).toHaveLength(0);
  });

  it('fires onGenerate when the Generate BOMs CTA is clicked', () => {
    const onGenerate = vi.fn();
    renderReady({ onGenerate });
    fireEvent.click(screen.getByTestId('bom-generate-cta'));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
});

describe('BomListScreen — required states', () => {
  it('loading shows a live status region and no table', () => {
    render(<BomListScreen state="loading" data={null} labels={LABELS} />);
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('empty shows the empty-state copy', () => {
    render(<BomListScreen state="empty" data={null} labels={LABELS} />);
    expect(screen.getByText(LABELS.emptyTitle)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('error shows an alert with the i18n error copy', () => {
    render(<BomListScreen state="error" data={null} labels={LABELS} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(LABELS.error)).toBeInTheDocument();
  });

  it('permission_denied shows the forbidden copy', () => {
    render(<BomListScreen state="permission_denied" data={null} labels={LABELS} />);
    expect(screen.getByText(LABELS.forbidden)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('BomListScreen — i18n', () => {
  it('renders only provided label strings (no default leak)', () => {
    renderReady();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(LABELS.title);
    expect(screen.getByText(LABELS.subtitle)).toBeInTheDocument();
  });
});

describe('BomListScreen — design-system conformance', () => {
  it('uses the locked chrome classes (breadcrumb, page-title) and no drift utilities', () => {
    const { container } = renderReady();
    expect(container.querySelector('.breadcrumb')).not.toBeNull();
    expect(container.querySelector('.page-title')).not.toBeNull();
    // Drift catalogue: no centred max-width, card shadow, or raw text-2xl heading.
    expect(container.querySelector('.max-w-6xl')).toBeNull();
    expect(container.querySelector('.shadow-sm')).toBeNull();
    expect(container.querySelector('h1.text-2xl')).toBeNull();
  });

  it('renders KPI tiles with the design-system .kpi class (3px accent) and Inter values', () => {
    const { container } = renderReady();
    const kpis = container.querySelectorAll('.kpi');
    expect(kpis.length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector('.kpi .kpi-value')).not.toBeNull();
    // KPI value must NOT be mono (golden rule 2/4).
    expect(container.querySelector('.kpi-value.mono')).toBeNull();
    expect(container.querySelector('.kpi-value.font-mono')).toBeNull();
  });

  it('uses TabsCounted with tone pills', () => {
    const { container } = renderReady();
    expect(container.querySelector('.tabs-counted')).not.toBeNull();
    expect(container.querySelector('.tabs-counted-pill')).not.toBeNull();
  });

  it('renders the lead code cell in mono and status as a semantic .badge', () => {
    renderReady();
    const rows = screen.getAllByTestId('bom-row');
    const codeCell = within(rows[0]).getByText('FG-1001').closest('td');
    expect(codeCell?.className).toContain('mono');
    const badge = within(rows[0]).getByText(/Active/);
    expect(badge.className).toContain('badge');
  });

  it('error state uses the .alert .alert-red component', () => {
    const { container } = render(<BomListScreen state="error" data={null} labels={LABELS} />);
    expect(container.querySelector('.alert.alert-red')).not.toBeNull();
  });

  it('empty/no-match uses the .empty-state component', () => {
    const { container } = render(<BomListScreen state="empty" data={null} labels={LABELS} />);
    expect(container.querySelector('.empty-state')).not.toBeNull();
  });
});
