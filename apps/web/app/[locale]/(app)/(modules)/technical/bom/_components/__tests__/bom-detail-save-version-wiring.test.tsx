/**
 * @vitest-environment jsdom
 * [B-1] "Save version" must not drop the recipe — asserted through the REAL wiring.
 *
 * The regression this guards was invisible to a modal-level test: VersionSaveModal
 * took `coProducts` as its own prop, and the only production caller
 * (BomDetailActions) never passed it. A test that hands the prop to the modal
 * directly passes while every real save ships `coProducts: []` and no yield, and the
 * server's `yieldPct ?? 100` silently rewrites a 95 % recipe to 100 %.
 *
 * So this file renders BomDetailActions — the component the page mounts — clicks the
 * real CTA, and inspects what createBomDraft actually receives.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBomDraft: vi.fn(),
  addBomLine: vi.fn(),
  listItems: vi.fn(),
  listManufacturingOperations: vi.fn(),
  validateBomComponent: vi.fn(),
  approveBom: vi.fn(),
  publishBom: vi.fn(),
  deleteBomVersion: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: mocks.refresh }),
  useParams: () => ({ locale: 'en' }),
}));
vi.mock('../../_actions/create-draft', () => ({ createBomDraft: mocks.createBomDraft }));
vi.mock('../../_actions/line-actions', () => ({ addBomLine: mocks.addBomLine }));
vi.mock('../../_actions/workflow', () => ({ approveBom: mocks.approveBom, publishBom: mocks.publishBom }));
vi.mock('../../_actions/delete-bom-version', () => ({ deleteBomVersion: mocks.deleteBomVersion }));
vi.mock('../../../items/_actions/list-items', () => ({ listItems: mocks.listItems }));
vi.mock('../../../../../../../../actions/reference/manufacturing-ops/list', () => ({
  listManufacturingOperations: mocks.listManufacturingOperations,
}));
vi.mock('../../../../../../../../actions/technical/boms/validate-component', () => ({
  validateBomComponent: mocks.validateBomComponent,
}));

import { BomDetailActions } from '../bom-detail-actions';

const LINES = [
  { componentCode: 'RM-0001', quantity: 0.7, uom: 'kg' },
  { componentCode: 'RM-0002', quantity: 0.2, uom: 'kg' },
];

const CO_PRODUCTS = [
  { coProductItemId: 'cp-1', quantity: 2, uom: 'kg', allocationPct: 30, isByproduct: false },
  { coProductItemId: 'cp-2', quantity: 1, uom: 'kg', allocationPct: 0, isByproduct: true },
];

const baseProps = {
  productId: 'FG-1001',
  productName: 'Kabanosy',
  currentVersion: 3,
  bomHeaderId: 'header-1',
  snapshotCount: 0,
  versionCount: 3,
  lines: LINES,
  coProducts: CO_PRODUCTS,
  yieldPct: 95,
  canCreate: true,
  canApprove: false,
  canPublish: false,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function saveVersion(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('bom-save-version-cta'));
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText('Change reason'), 'Recipe correction after trial run');
  await user.click(within(dialog).getByRole('button', { name: 'Save version' }));
  await waitFor(() => expect(mocks.createBomDraft).toHaveBeenCalledTimes(1));
  return mocks.createBomDraft.mock.calls[0][0];
}

describe('BomDetailActions → Save version (real wiring)', () => {
  it('carries the source co-products and yield into createBomDraft', async () => {
    mocks.createBomDraft.mockResolvedValue({ ok: true, data: { id: 'new-1', version: 4, warnings: [] } });
    const user = userEvent.setup();
    render(<BomDetailActions {...baseProps} status="draft" />);

    const payload = await saveVersion(user);
    expect(payload.coProducts).toEqual(CO_PRODUCTS);
    expect(payload.yieldPct).toBe(95);
    // V-TEC-12 stays satisfied: parent share = 100 − Σ non-byproduct allocations.
    expect(payload.parentAllocationPct).toBe(70);
    expect(payload.lines).toEqual(LINES);
    expect(payload.sourceBomHeaderId).toBe('header-1');
  });

  it('does not invent a 100 % yield or an empty co-product list', async () => {
    mocks.createBomDraft.mockResolvedValue({ ok: true, data: { id: 'new-1', version: 4, warnings: [] } });
    const user = userEvent.setup();
    render(<BomDetailActions {...baseProps} status="draft" />);

    const payload = await saveVersion(user);
    expect(payload.yieldPct).not.toBe(100);
    expect(payload.coProducts).not.toEqual([]);
  });

  it('still saves a BOM that genuinely has no co-products (no new blocking)', async () => {
    mocks.createBomDraft.mockResolvedValue({ ok: true, data: { id: 'new-1', version: 4, warnings: [] } });
    const user = userEvent.setup();
    render(<BomDetailActions {...baseProps} coProducts={[]} yieldPct={100} status="draft" />);

    const payload = await saveVersion(user);
    expect(payload.coProducts).toEqual([]);
    expect(payload.parentAllocationPct).toBe(100);
    expect(payload.yieldPct).toBe(100);
  });

  // [B-4] reachability: the modal the CTA opens states which status results.
  it('renders the draft-fork notice for a draft source', async () => {
    const user = userEvent.setup();
    render(<BomDetailActions {...baseProps} status="draft" />);
    await user.click(screen.getByTestId('bom-save-version-cta'));
    expect(await screen.findByTestId('bom-save-version-notice')).toHaveTextContent(/draft version/i);
  });

  it('renders the in-review notice for an active source', async () => {
    const user = userEvent.setup();
    render(<BomDetailActions {...baseProps} status="active" />);
    await user.click(screen.getByTestId('bom-save-version-cta'));
    expect(await screen.findByTestId('bom-save-version-notice')).toHaveTextContent(/in review/i);
  });
});
