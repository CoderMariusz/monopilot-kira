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
  deleteBomVersion: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), prefetch: vi.fn(), refresh: mocks.refresh }),
}));
vi.mock('../../items/_actions/list-items', () => ({ listItems: mocks.listItems }));
vi.mock('../../_actions/workflow', () => ({ approveBom: mocks.approveBom }));
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
});
