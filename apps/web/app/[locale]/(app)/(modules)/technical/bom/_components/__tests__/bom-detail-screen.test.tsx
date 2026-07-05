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
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BomDetailScreen,
  type BomDetailData,
  type BomDetailLabels,
} from '../bom-detail-screen';

const loadWipSubBomMock = vi.fn();
vi.mock('../../_actions/wip-sub-bom', () => ({
  loadWipSubBom: (...args: unknown[]) => loadWipSubBomMock(...args),
}));

afterEach(() => {
  cleanup();
  loadWipSubBomMock.mockReset();
});

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
  colActions: 'Actions',
  phantomBadge: 'phantom',
  perBoxBasis: 'per box (× {n} packs)',
  perPackValue: '{value} / pack',
  substituteLabel: 'Substitute:',
  expandWip: 'Show WIP sub-BOM',
  collapseWip: 'Hide WIP sub-BOM',
  wipSubBomLoading: 'Loading WIP sub-BOM…',
  wipSubBomEmpty: 'No active BOM for this WIP.',
  wipSubBomError: 'Unable to load this WIP sub-BOM.',
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
  originNpdProject: 'Origin: NPD project →',
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

// Phase-3 (Lane 16) — NPD↔Technical shortcut: source-NPD-project origin link.
describe('BomDetailScreen — NPD origin shortcut (Phase-3)', () => {
  it('renders a muted "Origin: NPD project →" link to /pipeline/<id> when the BOM has an NPD origin', () => {
    render(
      <BomDetailScreen
        state="ready"
        data={{ ...DATA, npdProjectId: 'c5cf521b-1111-2222-3333-444455556666' }}
        labels={LABELS}
      />,
    );
    const link = screen.getByTestId('bom-origin-npd-link');
    expect(link).toHaveTextContent('Origin: NPD project →');
    expect(link).toHaveAttribute('href', '/pipeline/c5cf521b-1111-2222-3333-444455556666');
    // i18n: label comes from injected labels, never a hardcoded inline string.
    expect(link).toHaveTextContent(LABELS.originNpdProject as string);
  });

  it('omits the origin link when the BOM has no NPD origin (null)', () => {
    render(
      <BomDetailScreen state="ready" data={{ ...DATA, npdProjectId: null }} labels={LABELS} />,
    );
    expect(screen.queryByTestId('bom-origin-npd-link')).not.toBeInTheDocument();
  });

  it('omits the origin link when npdProjectId is absent (back-compat default data)', () => {
    // DATA has no npdProjectId key at all — the link must not render.
    render(<BomDetailScreen state="ready" data={DATA} labels={LABELS} />);
    expect(screen.queryByTestId('bom-origin-npd-link')).not.toBeInTheDocument();
  });
});

// W5 / T5 ruling — per-box basis annotation, substitutes, WIP expansion.
describe('BomDetailScreen — per-box basis annotation', () => {
  it('annotates "per box (× N packs)" + a muted per-pack value when line_basis=per_box', () => {
    render(
      <BomDetailScreen
        state="ready"
        data={{ ...DATA, lineBasis: 'per_box', eachPerBox: 4 }}
        labels={LABELS}
      />,
    );
    expect(screen.getByTestId('bom-line-perbox-l1')).toHaveTextContent('per box (× 4 packs)');
    // 0.540000 / 4 = 0.135 per pack.
    expect(screen.getByTestId('bom-line-perpack-l1')).toHaveTextContent('0.135 / pack');
  });

  it('omits the per-box annotation for per_base BOMs', () => {
    render(
      <BomDetailScreen state="ready" data={{ ...DATA, lineBasis: 'per_base', eachPerBox: 4 }} labels={LABELS} />,
    );
    expect(screen.queryByTestId('bom-line-perbox-l1')).not.toBeInTheDocument();
  });
});

describe('BomDetailScreen — substitutes', () => {
  it('shows the substitute item on an RM line labelled "Substitute:"', () => {
    const lines = [
      { ...DATA.lines[0], substituteCode: 'R-2002', substituteName: 'Alt beef' },
      DATA.lines[1],
    ];
    render(<BomDetailScreen state="ready" data={{ ...DATA, lines }} labels={LABELS} />);
    const sub = screen.getByTestId('bom-line-substitute-l1');
    expect(sub).toHaveTextContent('Substitute:');
    expect(sub).toHaveTextContent('R-2002');
    expect(sub).toHaveTextContent('Alt beef');
  });
});

describe('BomDetailScreen — WIP expansion', () => {
  it('lazy-loads the WIP sub-BOM on expand and renders nested lines', async () => {
    loadWipSubBomMock.mockResolvedValue({
      ok: true,
      lines: [
        {
          id: 'sub1',
          lineNo: 1,
          componentCode: 'R-3003',
          componentType: 'RM',
          quantity: '0.010000',
          uom: 'kg',
          scrapPct: '0.00',
          isPhantom: false,
          substituteCode: null,
          substituteName: null,
        },
      ],
    });
    const user = userEvent.setup();
    // l2 is a WIP line with itemId set.
    const lines = [DATA.lines[0], { ...DATA.lines[1], itemId: 'wip-item-uuid' }];
    render(<BomDetailScreen state="ready" data={{ ...DATA, lines }} labels={LABELS} />);
    await user.click(screen.getByTestId('bom-wip-toggle-l2'));
    expect(await screen.findByText('R-3003')).toBeInTheDocument();
    expect(loadWipSubBomMock).toHaveBeenCalledWith('wip-item-uuid');
    const subRows = screen.getAllByTestId('bom-wip-subline-row');
    expect(subRows).toHaveLength(1);
  });

  it('shows the honest empty state when the WIP has no active BOM', async () => {
    loadWipSubBomMock.mockResolvedValue({ ok: true, lines: [] });
    const user = userEvent.setup();
    const lines = [DATA.lines[0], { ...DATA.lines[1], itemId: 'wip-item-uuid' }];
    render(<BomDetailScreen state="ready" data={{ ...DATA, lines }} labels={LABELS} />);
    await user.click(screen.getByTestId('bom-wip-toggle-l2'));
    expect(await screen.findByTestId('bom-wip-subbom-empty')).toHaveTextContent(
      'No active BOM for this WIP.',
    );
  });
});
