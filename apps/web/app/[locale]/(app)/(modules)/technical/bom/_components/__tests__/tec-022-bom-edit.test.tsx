/**
 * @vitest-environment jsdom
 * T-039 / TEC-022 — BOM Edit modals (component add + version save) RTL.
 *
 * Parity anchors:
 *   - modals.jsx:192-243 (bom_component_add_modal) → ComponentAddModal
 *   - modals.jsx:168-190 (bom_version_save_modal)  → VersionSaveModal
 *
 * Asserts structural parity (field set + Cancel/primary button order), the
 * mandatory states, the RM-usability hard gate (AC5 — blocked component must
 * not persist a line), the released → clone-on-write copy (AC6), and that a
 * successful save calls the real createBomDraft + closes + refreshes (AC4).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBomDraft: vi.fn(),
  validateBomComponent: vi.fn(),
  listItems: vi.fn(),
  listManufacturingOperations: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: mocks.refresh }),
}));

vi.mock('../../_actions/create-draft', () => ({ createBomDraft: mocks.createBomDraft }));
vi.mock('../../../items/_actions/list-items', () => ({ listItems: mocks.listItems }));
vi.mock('../../../../../../../../actions/reference/manufacturing-ops/list', () => ({
  listManufacturingOperations: mocks.listManufacturingOperations,
}));
vi.mock('../../../../../../../../actions/technical/boms/validate-component', () => ({
  validateBomComponent: mocks.validateBomComponent,
}));

import { ComponentAddModal, VersionSaveModal, type BomEditContext } from '../bom-edit-dialog';

const ITEM = {
  id: '11111111-1111-1111-1111-111111111111',
  itemCode: 'RM-1001',
  name: 'Salt',
  itemType: 'rm' as const,
  status: 'active' as const,
  uomBase: 'kg',
  weightMode: 'fixed' as const,
  costPerKg: '1.20',
  updatedAt: '2026-01-01T00:00:00Z',
};

function usableVerdict(usable: boolean) {
  return {
    usable,
    context: 'bom_edit' as const,
    itemId: ITEM.id,
    blockingReasons: usable ? [] : (['ITEM_BLOCKED'] as const),
    warnings: [],
    checks: usable
      ? [{ code: 'OK', label: 'Item active', severity: 'pass', source: 'items', remediationHref: null, evidenceAt: null }]
      : [{ code: 'ITEM_BLOCKED', label: 'Item is blocked', severity: 'block', source: 'items', remediationHref: null, evidenceAt: null }],
    evaluatedAt: '2026-01-01T00:00:00Z',
  };
}

const DRAFT_CTX: BomEditContext = { productId: 'FG-900', productName: 'Sausage 450g', currentVersion: 7, sourceStatus: 'draft' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listItems.mockResolvedValue({ items: [ITEM], canCreate: true, canEdit: true, canDeactivate: true, state: 'ready' });
  mocks.listManufacturingOperations.mockResolvedValue({
    ok: true,
    data: [{ operation_name: 'Mixing' }, { operation_name: 'Baking' }],
  });
  mocks.validateBomComponent.mockResolvedValue({ ok: true, verdict: usableVerdict(true) });
  mocks.createBomDraft.mockResolvedValue({ ok: true, data: { id: 'bom-1', version: 8, warnings: [] } });
});

afterEach(() => cleanup());

describe('ComponentAddModal (TEC-022 parity + behavior)', () => {
  it('renders search picker + Cancel/Add buttons (parity modals.jsx:192-243)', async () => {
    render(<ComponentAddModal open onClose={() => {}} context={DRAFT_CTX} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Add component to BOM' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /RM-1001/ })).toBeInTheDocument();
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toContain('Cancel');
    expect(buttons).toContain('Add component');
  });

  it('blocks Save and shows inline error for invalid quantity (AC3)', async () => {
    const user = userEvent.setup();
    render(<ComponentAddModal open onClose={() => {}} context={DRAFT_CTX} />);
    await user.click(await screen.findByRole('option', { name: /RM-1001/ }));
    const qty = await screen.findByLabelText('Quantity');
    await user.clear(qty);
    await user.type(qty, '0');
    expect(await screen.findByText('Quantity must be greater than 0.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add component' })).toBeDisabled();
  });

  it('rejects a Save when RM usability fails — no createBomDraft line mutation (AC5)', async () => {
    const user = userEvent.setup();
    mocks.validateBomComponent.mockResolvedValue({ ok: false, error: 'blocked', verdict: usableVerdict(false) });
    render(<ComponentAddModal open onClose={() => {}} context={DRAFT_CTX} />);
    await user.click(await screen.findByRole('option', { name: /RM-1001/ }));
    expect(await screen.findByText(/ITEM_BLOCKED/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add component' })).toBeDisabled();
    expect(mocks.createBomDraft).not.toHaveBeenCalled();
  });

  it('saves a usable component, closes + refreshes (AC4)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ComponentAddModal open onClose={onClose} context={DRAFT_CTX} />);
    await user.click(await screen.findByRole('option', { name: /RM-1001/ }));
    await screen.findByText('Component is usable.');
    // pick the manufacturing operation (@monopilot/ui Select → role="combobox")
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Mixing' }));
    await user.click(screen.getByRole('button', { name: 'Add component' }));
    await waitFor(() => expect(mocks.createBomDraft).toHaveBeenCalledTimes(1));
    const arg = mocks.createBomDraft.mock.calls[0][0];
    expect(arg.productId).toBe('FG-900');
    expect(arg.lines[0]).toMatchObject({ itemId: ITEM.id, componentCode: 'RM-1001', uom: 'kg', manufacturingOperationName: 'Mixing' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('infers component_type from the item master type (rm → RM)', async () => {
    const user = userEvent.setup();
    render(<ComponentAddModal open onClose={vi.fn()} context={DRAFT_CTX} />);
    await user.click(await screen.findByRole('option', { name: /RM-1001/ }));
    await screen.findByText('Component is usable.');
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Mixing' }));
    await user.click(screen.getByRole('button', { name: 'Add component' }));
    await waitFor(() => expect(mocks.createBomDraft).toHaveBeenCalledTimes(1));
    expect(mocks.createBomDraft.mock.calls[0][0].lines[0].componentType).toBe('RM');
  });

  it('infers component_type for a packaging item (packaging → PM)', async () => {
    const user = userEvent.setup();
    const PM_ITEM = { ...ITEM, id: '22222222-2222-2222-2222-222222222222', itemCode: 'PM-2001', name: 'Pouch', itemType: 'packaging' as const, uomBase: 'ea' };
    mocks.listItems.mockResolvedValue({ items: [PM_ITEM], canCreate: true, canEdit: true, canDeactivate: true, state: 'ready' });
    mocks.validateBomComponent.mockResolvedValue({ ok: true, verdict: usableVerdict(true) });
    render(<ComponentAddModal open onClose={vi.fn()} context={DRAFT_CTX} />);
    await user.click(await screen.findByRole('option', { name: /PM-2001/ }));
    await screen.findByText('Component is usable.');
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Mixing' }));
    await user.click(screen.getByRole('button', { name: 'Add component' }));
    await waitFor(() => expect(mocks.createBomDraft).toHaveBeenCalledTimes(1));
    const line = mocks.createBomDraft.mock.calls[0][0].lines[0];
    expect(line).toMatchObject({ componentCode: 'PM-2001', componentType: 'PM' });
  });

  it('keeps the dialog open and surfaces createBomDraft invalid-reference failures', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mocks.createBomDraft.mockResolvedValue({ ok: false, error: 'invalid_input', message: 'invalid reference' });
    render(<ComponentAddModal open onClose={onClose} context={DRAFT_CTX} />);
    await user.click(await screen.findByRole('option', { name: /RM-1001/ }));
    await screen.findByText('Component is usable.');
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Mixing' }));
    await user.click(screen.getByRole('button', { name: 'Add component' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid reference');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows clone-on-write notice when the source BOM is released/active (AC6)', async () => {
    render(<ComponentAddModal open onClose={() => {}} context={{ ...DRAFT_CTX, sourceStatus: 'active' }} />);
    expect(await screen.findByText(/Saving creates a new draft version/)).toBeInTheDocument();
  });
});

describe('VersionSaveModal (TEC-022 parity + behavior)', () => {
  const ctx: BomEditContext = { ...DRAFT_CTX };
  const lines = [{ itemId: ITEM.id, componentCode: 'RM-1001', quantity: 0.1, uom: 'kg' }];

  it('renders Version label + Change reason + Cancel/Save order (parity modals.jsx:168-190)', () => {
    render(<VersionSaveModal open onClose={() => {}} context={ctx} lines={lines} />);
    expect(screen.getByRole('heading', { name: 'Save BOM version' })).toBeInTheDocument();
    expect(screen.getByLabelText('Version label')).toBeInTheDocument();
    expect(screen.getByLabelText('Change reason')).toBeInTheDocument();
    expect(screen.getByText(/stays available read-only/)).toBeInTheDocument();
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons.indexOf('Cancel')).toBeLessThan(buttons.indexOf('Save version'));
  });

  it('disables Save until reason >= 10 chars, then persists a new draft (clone-on-write)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<VersionSaveModal open onClose={onClose} context={ctx} lines={lines} />);
    const save = screen.getByRole('button', { name: 'Save version' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Change reason'), 'Updated fat pct 22 to 21');
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(mocks.createBomDraft).toHaveBeenCalledTimes(1));
    const arg = mocks.createBomDraft.mock.calls[0][0];
    expect(arg.productId).toBe('FG-900');
    expect(arg.lines).toHaveLength(1);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
