/**
 * @vitest-environment jsdom
 * T-038 — BomDetailScreen (TEC-021) component test — 7 tabs.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/bom-detail.jsx:3-65 (7-tab shell)
 *
 * Asserts the 7-tab bar (Components / Co-products / Snapshots / Versions /
 * Approval / Where-used / Recipe sheet) with count badges, tab switching reveals
 * the matching panel, each tab renders its real-data table (or empty copy), the
 * required UI states (loading / error / not_found / permission_denied), and that
 * visible strings come from injected i18n labels. FG canonical (no FA labels).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BomDetailScreen,
  type BomDetailData,
  type BomDetailLabels,
} from '../bom-detail-screen';

afterEach(() => cleanup());

const LABELS: BomDetailLabels = {
  breadcrumbRoot: 'BOMs & recipes',
  versionBadge: 'v{n}',
  yieldLabel: 'Yield',
  tabComponents: 'Components',
  tabCoProducts: 'Co-products',
  tabSnapshots: 'Snapshots',
  tabVersions: 'Versions',
  tabApproval: 'Approval',
  tabWhereUsed: 'Where-used',
  tabRecipeSheet: 'Recipe sheet',
  colLine: '#',
  colComponent: 'Component',
  colType: 'Type',
  colQty: 'Qty',
  colUom: 'UoM',
  colScrap: 'Scrap',
  colOperation: 'Operation',
  phantomBadge: 'phantom',
  colCoProduct: 'Co-product item',
  colAllocation: 'Allocation',
  byproductBadge: 'By-product',
  coProductBadge: 'Co-product',
  colSnapshot: 'Snapshot',
  colWorkOrder: 'Work order',
  colSnapshotAt: 'Taken at',
  noWorkOrder: '—',
  colVersion: 'Version',
  colStatus: 'Status',
  colEffective: 'Effective from',
  colApprovedBy: 'Approved by',
  current: 'Current',
  approvalTitle: 'Approval',
  approvalStatus: 'Status',
  approvalApprovedBy: 'Approved by',
  approvalApprovedAt: 'Approved at',
  approvalPending: 'Pending approval',
  approvalChainTitle: 'Approval chain',
  approvalChain: 'NPD → Technologist → QA → Production lead',
  colParent: 'Used in (FG)',
  colParentVersion: 'Version',
  colUsageQty: 'Qty per parent',
  recipeTitle: 'Recipe sheet',
  recipeBatch: 'BOM {code} · v{version} · Yield {yield}%',
  recipeComponents: 'Components',
  recipeNotes: 'Notes',
  statusDraft: 'Draft',
  statusInReview: 'In review',
  statusApproved: 'Approved',
  statusActive: 'Active',
  statusSuperseded: 'Superseded',
  statusArchived: 'Archived',
  emptyComponents: 'This BOM version has no component lines.',
  emptyCoProducts: 'No co-products or by-products on this BOM version.',
  emptySnapshots: 'No work-order snapshots have been taken for this version yet.',
  emptyWhereUsed: 'This FG is not used as a component in any other BOM.',
  loading: 'Loading BOM…',
  error: 'Unable to load this BOM. Please try again.',
  notFound: 'BOM not found.',
  forbidden: 'You do not have permission to view this BOM.',
};

const DATA: BomDetailData = {
  productId: 'FG-1001',
  productName: 'Kielbasa slaska 450g',
  category: 'Sausages',
  selectedVersion: 7,
  status: 'active',
  yieldPct: '91.000',
  effectiveFrom: '2026-04-14',
  notes: 'Standard batch 100 kg.',
  lines: [
    {
      id: 'l1',
      lineNo: 1,
      componentCode: 'R-1001',
      componentType: 'RM',
      quantity: '0.540000',
      uom: 'kg',
      scrapPct: '2.00',
      manufacturingOperationName: 'Mince',
      isPhantom: false,
    },
    {
      id: 'l2',
      lineNo: 2,
      componentCode: 'WIP-002',
      componentType: 'WIP',
      quantity: '0.022000',
      uom: 'kg',
      scrapPct: '0.00',
      manufacturingOperationName: null,
      isPhantom: true,
    },
  ],
  coProducts: [
    {
      id: 'cp1',
      coProductItemId: 'CP-9001',
      quantity: '0.100000',
      uom: 'kg',
      allocationPct: '5.00',
      isByproduct: false,
    },
  ],
  versions: [
    {
      id: 'v7',
      version: 7,
      status: 'active',
      effectiveFrom: '2026-04-14',
      effectiveTo: null,
      approvedByName: 'A. Majewska',
      approvedAt: '2026-04-14T10:00:00.000Z',
      notes: null,
      isSelected: true,
    },
    {
      id: 'v6',
      version: 6,
      status: 'superseded',
      effectiveFrom: '2026-01-22',
      effectiveTo: '2026-04-13',
      approvedByName: 'A. Majewska',
      approvedAt: '2026-01-22T10:00:00.000Z',
      notes: null,
      isSelected: false,
    },
  ],
  snapshots: [
    { id: 'snap-aaaaaaaa-1111', workOrderId: 'WO-555', snapshotAt: '2026-04-15T08:00:00.000Z' },
  ],
  whereUsed: [
    {
      parentProductId: 'FG-9999',
      parentProductName: 'Zestaw mieszany',
      parentVersion: 1,
      parentStatus: 'active',
      quantity: '2.000000',
      uom: 'szt',
    },
  ],
  detailHrefBase: '/technical/bom',
};

function renderReady(extra?: Partial<React.ComponentProps<typeof BomDetailScreen>>) {
  return render(<BomDetailScreen state="ready" data={DATA} labels={LABELS} {...extra} />);
}

describe('BomDetailScreen — 7 tabs parity', () => {
  it('renders exactly 7 tabs in canonical order with the right labels', () => {
    renderReady();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(7);
    const labels = tabs.map((t) => t.textContent);
    expect(labels[0]).toContain('Components');
    expect(labels[1]).toContain('Co-products');
    expect(labels[2]).toContain('Snapshots');
    expect(labels[3]).toContain('Versions');
    expect(labels[4]).toContain('Approval');
    expect(labels[5]).toContain('Where-used');
    expect(labels[6]).toContain('Recipe sheet');
  });

  it('renders count badges for the data-backed tabs', () => {
    renderReady();
    expect(screen.getByTestId('bom-tab-components').textContent).toContain('2');
    expect(screen.getByTestId('bom-tab-co-products').textContent).toContain('1');
    expect(screen.getByTestId('bom-tab-versions').textContent).toContain('2');
    expect(screen.getByTestId('bom-tab-where-used').textContent).toContain('1');
  });

  it('shows the header with FG code, status and version badge', () => {
    renderReady();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toContain('Kielbasa slaska 450g');
    expect(screen.getByText('v7')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});

describe('BomDetailScreen — tab content', () => {
  it('Components tab renders the line rows by default', () => {
    renderReady();
    const rows = screen.getAllByTestId('bom-line-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('R-1001')).toBeInTheDocument();
    expect(within(rows[1]).getByText(LABELS.phantomBadge)).toBeInTheDocument();
  });

  it('switching to Versions reveals the version history rows', async () => {
    const user = userEvent.setup();
    renderReady();
    await user.click(screen.getByTestId('bom-tab-versions'));
    const rows = screen.getAllByTestId('bom-version-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(LABELS.current)).toBeInTheDocument();
  });

  it('switching to Where-used reveals the parent FG rows', async () => {
    const user = userEvent.setup();
    renderReady();
    await user.click(screen.getByTestId('bom-tab-where-used'));
    const rows = screen.getAllByTestId('bom-whereused-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('FG-9999')).toBeInTheDocument();
  });

  it('Approval tab shows the approver and the approval chain', () => {
    renderReady({ defaultTab: 'approval' });
    expect(screen.getByText('A. Majewska')).toBeInTheDocument();
    expect(screen.getByText(LABELS.approvalChain)).toBeInTheDocument();
  });

  it('empty Snapshots renders the empty copy', () => {
    renderReady({ defaultTab: 'snapshots', data: { ...DATA, snapshots: [] } });
    expect(screen.getByText(LABELS.emptySnapshots)).toBeInTheDocument();
  });

  it('does not leak the legacy FA label (FG is canonical)', () => {
    const { container } = renderReady();
    expect(container.textContent).not.toMatch(/Factory Article/i);
  });
});

describe('BomDetailScreen — design-system conformance', () => {
  it('uses chrome classes and no drift utilities', () => {
    const { container } = renderReady();
    expect(container.querySelector('.breadcrumb')).not.toBeNull();
    expect(container.querySelector('.page-title')).not.toBeNull();
    expect(container.querySelector('.max-w-6xl')).toBeNull();
    expect(container.querySelector('.shadow-sm')).toBeNull();
    expect(container.querySelector('h1.text-2xl')).toBeNull();
  });

  it('uses TabsCounted for the 7-tab bar and semantic .badge for status', () => {
    const { container } = renderReady();
    expect(container.querySelector('.tabs-counted')).not.toBeNull();
    expect(container.querySelector('.tabs-counted-pill')).not.toBeNull();
    // Header status badge must be a design-system .badge.
    const headerBadge = within(container.querySelector('header')!).getByText('Active');
    expect(headerBadge.className).toContain('badge');
  });

  it('renders tab panels inside the .card surface', () => {
    const { container } = renderReady();
    expect(container.querySelector('.card')).not.toBeNull();
  });

  it('error state uses the .alert .alert-red component', () => {
    const { container } = render(<BomDetailScreen state="error" data={null} labels={LABELS} />);
    expect(container.querySelector('.alert.alert-red')).not.toBeNull();
  });
});

describe('BomDetailScreen — required states', () => {
  it('loading shows a live status region', () => {
    render(<BomDetailScreen state="loading" data={null} labels={LABELS} />);
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('not_found shows an alert with the i18n copy', () => {
    render(<BomDetailScreen state="not_found" data={null} labels={LABELS} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(LABELS.notFound)).toBeInTheDocument();
  });

  it('error shows an alert', () => {
    render(<BomDetailScreen state="error" data={null} labels={LABELS} />);
    expect(within(screen.getByRole('alert')).getByText(LABELS.error)).toBeInTheDocument();
  });

  it('permission_denied shows the forbidden copy', () => {
    render(<BomDetailScreen state="permission_denied" data={null} labels={LABELS} />);
    expect(screen.getByText(LABELS.forbidden)).toBeInTheDocument();
  });
});
