/**
 * @vitest-environment jsdom
 * TW1-bom — button-wiring parity test (the user flagged dead CTAs).
 *
 * Parity anchors:
 *   - bom-list.jsx:33   ("+ New BOM" + Generate CTAs) → list opens the FG picker /
 *     batch generator modals (previously the New BOM Link went nowhere and the
 *     Generate button's onGenerate was never supplied → dead).
 *   - bom-detail.jsx:37-42 (sticky header CTA cluster) → BomDetailActions mounts
 *     Add component / Save version / Approve (previously the detail screen had ZERO
 *     action buttons, so the wired modals + approveBom were unreachable dead code).
 *
 * Asserts the CTAs are now wired: clicking them opens the right modal / calls the
 * real Server Action. Real data path is preserved (createBomDraft / approveBom /
 * listItems are the production actions; mocked here only to observe invocation).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listItems: vi.fn(),
  approveBom: vi.fn(),
  publishBom: vi.fn(),
  deleteBomVersion: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), prefetch: vi.fn(), refresh: mocks.refresh }),
  useParams: () => ({ locale: 'en' }),
}));
// The modal imports `listItems` from `bom/_components` → `../../items/_actions/...`
// which resolves to `technical/items/_actions/list-items`. From THIS test file
// (one level deeper, in `__tests__`) that same module is `../../../items/...`.
vi.mock('../../../items/_actions/list-items', () => ({ listItems: mocks.listItems }));
vi.mock('../../_actions/workflow', () => ({ approveBom: mocks.approveBom, publishBom: mocks.publishBom }));
vi.mock('../../_actions/delete-bom-version', () => ({ deleteBomVersion: mocks.deleteBomVersion }));

import { BomListScreen, type BomListData, type BomListLabels } from '../bom-list-screen';
import { BomDetailActions } from '../bom-detail-actions';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const LIST_LABELS = {
  breadcrumbRoot: 'Technical',
  title: 'BOMs & recipes',
  subtitle: 's',
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
  searchPlaceholder: 'Filter…',
  emptyTitle: 'No BOMs yet',
  emptyBody: 'b',
  noMatchTitle: 'No match',
  noMatchBody: 'b',
  loading: 'Loading…',
  error: 'err',
  forbidden: 'no',
} satisfies BomListLabels;

const LIST_DATA: BomListData = {
  items: [
    {
      productId: 'FG-1001',
      productName: 'Kabanosy',
      category: 'Sausage',
      version: 7,
      status: 'active',
      yieldPct: '91.000',
      componentCount: 8,
      updatedAt: '2026-04-14T00:00:00.000Z',
    },
  ],
  kpi: { activeCount: 1, totalCount: 1, draftCount: 0, inReviewCount: 0 },
  detailHrefBase: '/technical/bom',
};

describe('TW1-bom — list CTAs are wired', () => {
  it('New BOM opens the FG-picker modal (was a dead Link before)', async () => {
    const user = userEvent.setup();
    mocks.listItems.mockResolvedValue({ state: 'ready', items: [] });
    render(<BomListScreen state="ready" data={LIST_DATA} labels={LIST_LABELS} canCreate canGenerate />);

    expect(screen.queryByTestId('new-bom-modal')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('bom-new-cta'));
    expect(await screen.findByTestId('new-bom-modal')).toBeInTheDocument();
  });

  it('renders eligible + blocked FGs with status badges; blocked is disabled', async () => {
    const user = userEvent.setup();
    mocks.listItems.mockResolvedValue({
      state: 'ready',
      items: [
        { id: 'a', itemCode: 'FG-A', name: 'Active FG', itemType: 'fg', status: 'active' },
        { id: 'b', itemCode: 'FG-B', name: 'Blocked FG', itemType: 'fg', status: 'blocked' },
      ],
    });
    render(<BomListScreen state="ready" data={LIST_DATA} labels={LIST_LABELS} canCreate canGenerate />);
    await user.click(screen.getByTestId('bom-new-cta'));

    const options = await screen.findAllByTestId('new-bom-fg-option');
    expect(options).toHaveLength(2);
    // Active FG is selectable; blocked FG is disabled (visible, not hidden).
    const active = options.find((o) => o.getAttribute('data-eligible') === 'true')!;
    const blocked = options.find((o) => o.getAttribute('data-eligible') === 'false')!;
    expect(active).toHaveTextContent('FG-A');
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveTextContent('FG-B');

    // Continue stays disabled until an ELIGIBLE FG is picked.
    expect(screen.getByTestId('new-bom-confirm')).toBeDisabled();
    await user.click(active);
    expect(screen.getByTestId('new-bom-confirm')).not.toBeDisabled();
  });

  it('shows a proper empty-state with an items link when there are no FGs (no infinite loading)', async () => {
    const user = userEvent.setup();
    mocks.listItems.mockResolvedValue({ state: 'ready', items: [] });
    render(<BomListScreen state="ready" data={LIST_DATA} labels={LIST_LABELS} canCreate canGenerate />);
    await user.click(screen.getByTestId('bom-new-cta'));

    const empty = await screen.findByTestId('new-bom-empty');
    expect(empty).toBeInTheDocument();
    // The loading skeleton is gone (loading state was left) and a link is offered.
    expect(screen.queryByTestId('new-bom-loading')).not.toBeInTheDocument();
    expect(empty.querySelector('a')).toHaveAttribute('href', '/technical/items');
  });

  it('does NOT hang on loading when listItems rejects — surfaces the error state', async () => {
    const user = userEvent.setup();
    mocks.listItems.mockRejectedValue(new Error('RSC boundary blew up'));
    render(<BomListScreen state="ready" data={LIST_DATA} labels={LIST_LABELS} canCreate canGenerate />);
    await user.click(screen.getByTestId('bom-new-cta'));

    // The error branch renders (loading skeleton cleared) — the live forever-hang
    // happened because a rejected Server Action was never caught.
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('new-bom-loading')).not.toBeInTheDocument());
  });

  it('Generate BOMs opens the batch generator modal when no host override', async () => {
    const user = userEvent.setup();
    render(<BomListScreen state="ready" data={LIST_DATA} labels={LIST_LABELS} canCreate canGenerate />);

    await user.click(screen.getByTestId('bom-generate-cta'));
    // The generator Dialog renders its scope/output radios once open.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('hides both CTAs when the server denied create/generate', () => {
    render(<BomListScreen state="ready" data={LIST_DATA} labels={LIST_LABELS} />);
    expect(screen.queryByTestId('bom-new-cta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bom-generate-cta')).not.toBeInTheDocument();
  });
});

describe('TW1-bom — detail action bar is wired', () => {
  const baseProps = {
    productId: 'FG-1001',
    productName: 'Kabanosy',
    currentVersion: 3,
    snapshotCount: 0,
    lines: [{ componentCode: 'RM-1', quantity: 1, uom: 'kg' }],
    canPublish: false,
  };

  it('renders Add component + Save version when create is granted', () => {
    render(<BomDetailActions {...baseProps} status="draft" canCreate canApprove={false} />);
    expect(screen.getByTestId('bom-add-component-cta')).toBeInTheDocument();
    expect(screen.getByTestId('bom-save-version-cta')).toBeInTheDocument();
  });

  it('Approve calls the real approveBom action with the version ref', async () => {
    const user = userEvent.setup();
    mocks.approveBom.mockResolvedValue({ ok: true, data: { id: 'h1', status: 'technical_approved', version: 3 } });
    render(<BomDetailActions {...baseProps} status="draft" canCreate={false} canApprove />);

    await user.click(screen.getByTestId('bom-approve-cta'));
    await waitFor(() =>
      expect(mocks.approveBom).toHaveBeenCalledWith({ productId: 'FG-1001', version: 3 }),
    );
  });

  // Bug-5: a sourcing-validation block used to render the raw machine string
  // (`RM-002: SUPPLIER_SPEC_NOT_ACTIVE; …`) jammed into the button flex row.
  // It now renders a structured, full-width danger alert with one bullet per
  // failing component and translated reason labels.
  it('renders the structured failure alert (not a raw string) when approve is blocked on sourcing', async () => {
    const user = userEvent.setup();
    mocks.approveBom.mockResolvedValue({
      ok: false,
      error: 'validation',
      rmUsabilityFailures: [
        { componentCode: 'RM-002', itemId: 'i1', reasons: ['SUPPLIER_SPEC_NOT_ACTIVE'] },
        { componentCode: 'ING-001', itemId: 'i2', reasons: ['SUPPLIER_NOT_APPROVED', 'SUPPLIER_SPEC_NOT_ACTIVE'] },
      ],
    });
    render(<BomDetailActions {...baseProps} status="draft" canCreate={false} canApprove />);

    await user.click(screen.getByTestId('bom-approve-cta'));

    const card = await screen.findByTestId('bom-approve-failures');
    expect(card).toHaveClass('alert', 'alert-red');
    expect(card).toHaveAttribute('role', 'alert');
    // One <li> per failing component, keyed by code.
    const rows = card.querySelectorAll('li[data-component-code]');
    expect(rows).toHaveLength(2);
    // Friendly translated reason labels, NOT the raw enum codes.
    expect(card).toHaveTextContent('Supplier spec not active');
    expect(card).toHaveTextContent('Supplier not approved');
    expect(card).toHaveTextContent('RM-002');
    expect(card).toHaveTextContent('ING-001');
    // The raw machine string must NOT appear anywhere.
    expect(card.textContent).not.toContain('SUPPLIER_SPEC_NOT_ACTIVE');
  });

  it('renders nothing when the server denied both create and approve', () => {
    const { container } = render(
      <BomDetailActions {...baseProps} status="draft" canCreate={false} canApprove={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('hides Approve for an already-active version (not approvable)', () => {
    render(<BomDetailActions {...baseProps} status="active" canCreate={false} canApprove />);
    expect(screen.queryByTestId('bom-approve-cta')).not.toBeInTheDocument();
  });

  // B-1: a technical_approved BOM was a dead end — publishBom existed but no CTA
  // called it, so no BOM could become 'active' (and WO release needs an active BOM).
  it('Publish calls the real publishBom action on a technical_approved version', async () => {
    const user = userEvent.setup();
    mocks.publishBom.mockResolvedValue({ ok: true, data: { id: 'h1', status: 'active', version: 3 } });
    render(<BomDetailActions {...baseProps} status="technical_approved" canCreate={false} canApprove={false} canPublish />);

    await user.click(screen.getByTestId('bom-publish-cta'));
    await waitFor(() =>
      expect(mocks.publishBom).toHaveBeenCalledWith({ productId: 'FG-1001', version: 3 }),
    );
  });

  it('hides Publish unless the version is technical_approved', () => {
    render(<BomDetailActions {...baseProps} status="draft" canCreate={false} canApprove={false} canPublish />);
    expect(screen.queryByTestId('bom-publish-cta')).not.toBeInTheDocument();
  });

  it('hides Publish when the server denied version_publish', () => {
    render(<BomDetailActions {...baseProps} status="technical_approved" canCreate={false} canApprove={false} canPublish={false} />);
    expect(screen.queryByTestId('bom-publish-cta')).not.toBeInTheDocument();
  });
});
