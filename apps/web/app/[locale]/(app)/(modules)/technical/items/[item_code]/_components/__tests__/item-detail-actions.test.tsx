/**
 * @vitest-environment jsdom
 *
 * Wave 8b Lane IA — item detail header status-transition flow (audit finding #8).
 *
 * Behaviour checklist:
 *   - draft item + technical.items.edit ⇒ primary "Activate" button; confirm
 *     dialog (role="dialog", labelled title, body copy) → transitionItemStatus
 *     called with { id, toStatus: 'active' } and router.refresh() on success.
 *   - active ⇒ "Deprecate" (toStatus 'deprecated'); deprecated ⇒ "Reactivate"
 *     (toStatus 'active'); blocked ⇒ no transition trigger (TEC-081 owns it).
 *   - canEdit=false hides the trigger; action error renders role="alert".
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const transitionItemStatus = vi.fn();
vi.mock('../../../_actions/transition-item-status', () => ({
  transitionItemStatus: (...args: unknown[]) => transitionItemStatus(...args),
}));

// Heavy siblings are out of scope here — the wizard pulls the full form stack.
vi.mock('../../../_components/item-create-wizard', () => ({
  ItemWizard: () => null,
}));
vi.mock('../../../_components/deactivate-modal', () => ({
  DeactivateItemModal: () => null,
}));

import type { ItemDetail } from '../../../_actions/get-item';
import { ItemDetailActions } from '../item-detail-actions';

const baseItem: ItemDetail = {
  id: '11111111-1111-1111-1111-111111111111',
  itemCode: 'RM-1001',
  name: 'Pork shoulder',
  itemType: 'rm',
  status: 'draft',
  description: null,
  productGroup: null,
  uomBase: 'kg',
  uomSecondary: null,
  gs1Gtin: null,
  weightMode: 'fixed',
  nominalWeight: null,
  tareWeight: null,
  grossWeightMax: null,
  varianceTolerancePct: null,
  shelfLifeDays: null,
  shelfLifeMode: null,
  outputUom: 'base',
  netQtyPerEach: null,
  eachPerBox: null,
  boxesPerPallet: null,
  costPerKg: null,
  updatedAt: '2026-06-11T00:00:00.000Z',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderActions(overrides?: Partial<ItemDetail>, props?: Partial<React.ComponentProps<typeof ItemDetailActions>>) {
  return render(
    <ItemDetailActions
      item={{ ...baseItem, ...overrides }}
      canEdit
      canDeactivate
      editLabel="Edit"
      deactivateLabel="Deactivate"
      {...props}
    />,
  );
}

describe('ItemDetailActions status transition (Wave 8b Lane IA)', () => {
  it('draft: Activate button opens the confirm dialog and submits draft→active', async () => {
    const user = userEvent.setup();
    transitionItemStatus.mockResolvedValue({ ok: true, data: { id: baseItem.id, status: 'active' } });
    renderActions();

    const trigger = screen.getByRole('button', { name: 'Activate' });
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Activate item' })).toBeInTheDocument();
    expect(
      screen.getByText('Activate this item? It becomes available for BOMs, purchasing and production.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(transitionItemStatus).toHaveBeenCalledTimes(1);
    expect(transitionItemStatus).toHaveBeenCalledWith({ id: baseItem.id, toStatus: 'active' });
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('active: Deprecate submits active→deprecated', async () => {
    const user = userEvent.setup();
    transitionItemStatus.mockResolvedValue({ ok: true, data: { id: baseItem.id, status: 'deprecated' } });
    renderActions({ status: 'active' });

    await user.click(screen.getByRole('button', { name: 'Deprecate' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));

    expect(transitionItemStatus).toHaveBeenCalledWith({ id: baseItem.id, toStatus: 'deprecated' });
  });

  it('deprecated: Reactivate submits deprecated→active', async () => {
    const user = userEvent.setup();
    transitionItemStatus.mockResolvedValue({ ok: true, data: { id: baseItem.id, status: 'active' } });
    renderActions({ status: 'deprecated' });

    await user.click(screen.getByRole('button', { name: 'Reactivate' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));

    expect(transitionItemStatus).toHaveBeenCalledWith({ id: baseItem.id, toStatus: 'active' });
  });

  it('blocked: no transition trigger is offered', () => {
    renderActions({ status: 'blocked' });
    expect(screen.queryByRole('button', { name: 'Activate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deprecate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument();
  });

  it('without technical.items.edit the transition trigger is hidden', () => {
    renderActions({ status: 'draft' }, { canEdit: false });
    expect(screen.queryByRole('button', { name: 'Activate' })).not.toBeInTheDocument();
  });

  it('action error surfaces as role="alert" and keeps the dialog open', async () => {
    const user = userEvent.setup();
    transitionItemStatus.mockResolvedValue({ ok: false, error: 'invalid_transition' });
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Activate' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("This status change is not allowed from the item's current status.");
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
