/**
 * @vitest-environment jsdom
 *
 * RTL — BOM co-product row actions (edit modal payload + delete confirm flow +
 * disabled-on-active + inline error + RBAC). The 1:1 mirror of the Components-tab
 * BomLineRowActions test. Verifies the edit modal prefills qty / uom / allocation
 * / expected-yield, sends them through updateBomCoProduct, the delete confirm
 * calls deleteBomCoProduct, that a `{ ok: false }` server refusal surfaces INLINE
 * via role="alert" (never throws), that a non-editable version renders the buttons
 * disabled with an honest title, and that the island renders NOTHING without the
 * create permission (RBAC, server-authoritative).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { updateBomCoProduct, deleteBomCoProduct, refresh } = vi.hoisted(() => ({
  updateBomCoProduct: vi.fn(),
  deleteBomCoProduct: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../../_actions/co-product-actions', () => ({ updateBomCoProduct, deleteBomCoProduct }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('next-intl', () => {
  // Force the t.has-guard fallback path → readable English labels, no bundle.
  const t = (k: string) => k;
  t.has = () => false;
  t.raw = (k: string) => k;
  return { useTranslations: () => t };
});

import { BomCoProductRowActions, type BomCoProductRowActionTarget } from '../bom-coproduct-row-actions.client';

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  updateBomCoProduct.mockResolvedValue({ ok: true, data: { lineId: 'CP1', bomHeaderId: 'H1' } });
  deleteBomCoProduct.mockResolvedValue({ ok: true, data: { lineId: 'CP1', bomHeaderId: 'H1' } });
});

const TARGET: BomCoProductRowActionTarget = {
  bomHeaderId: 'H1',
  coProductId: 'CP1',
  coProductItemId: 'CP-9001',
  quantity: '0.1',
  uom: 'kg',
  allocationPct: '5',
  expectedYieldPct: '8',
  isByproduct: false,
};

describe('BomCoProductRowActions', () => {
  it('opens the edit modal prefilled and sends qty/uom/allocation/yield as strings', async () => {
    const user = userEvent.setup();
    render(<BomCoProductRowActions target={TARGET} editable={true} canEdit={true} />);

    await user.click(screen.getByTestId('bom-coproduct-edit'));
    expect(screen.getByLabelText('Quantity')).toHaveValue(0.1);
    expect(screen.getByLabelText('Unit of measure')).toHaveValue('kg');
    expect(screen.getByLabelText('Allocation %')).toHaveValue(5);
    expect(screen.getByLabelText('Expected yield %')).toHaveValue(8);

    // jsdom note: controlled type="number" inputs collapse leading-zero decimals
    // typed char-by-char (a known jsdom/userEvent artifact, fine in real browsers),
    // so the parity assertion uses an integer keystroke — the wire contract (every
    // field crosses as a trimmed STRING) is what matters here.
    const qty = screen.getByLabelText('Quantity');
    await user.clear(qty);
    await user.type(qty, '2');
    const alloc = screen.getByLabelText('Allocation %');
    await user.clear(alloc);
    await user.type(alloc, '7');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateBomCoProduct).toHaveBeenCalledTimes(1));
    const payload = updateBomCoProduct.mock.calls[0][0];
    expect(payload).toEqual({
      bomHeaderId: 'H1',
      coProductId: 'CP1',
      quantity: '2',
      uom: 'kg',
      allocationPct: '7',
      expectedYieldPct: '8',
    });
    expect(typeof payload.quantity).toBe('string');
    expect(typeof payload.allocationPct).toBe('string');
    expect(typeof payload.expectedYieldPct).toBe('string');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('omits expectedYieldPct from the payload when the field is cleared', async () => {
    const user = userEvent.setup();
    render(<BomCoProductRowActions target={TARGET} editable={true} canEdit={true} />);
    await user.click(screen.getByTestId('bom-coproduct-edit'));
    await user.clear(screen.getByLabelText('Expected yield %'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateBomCoProduct).toHaveBeenCalledTimes(1));
    expect(updateBomCoProduct.mock.calls[0][0]).not.toHaveProperty('expectedYieldPct', expect.anything());
    expect(updateBomCoProduct.mock.calls[0][0].expectedYieldPct).toBeUndefined();
  });

  it('blocks save when allocation is empty / invalid', async () => {
    const user = userEvent.setup();
    render(<BomCoProductRowActions target={TARGET} editable={true} canEdit={true} />);
    await user.click(screen.getByTestId('bom-coproduct-edit'));
    await user.clear(screen.getByLabelText('Allocation %'));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(updateBomCoProduct).not.toHaveBeenCalled();
  });

  it('blocks save when quantity is non-positive', async () => {
    const user = userEvent.setup();
    render(<BomCoProductRowActions target={TARGET} editable={true} canEdit={true} />);
    await user.click(screen.getByTestId('bom-coproduct-edit'));
    const qty = screen.getByLabelText('Quantity');
    await user.clear(qty);
    await user.type(qty, '0');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(updateBomCoProduct).not.toHaveBeenCalled();
  });

  it('runs the delete confirm flow and calls deleteBomCoProduct', async () => {
    const user = userEvent.setup();
    render(<BomCoProductRowActions target={TARGET} editable={true} canEdit={true} />);

    await user.click(screen.getByTestId('bom-coproduct-delete'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByTestId('bom-coproduct-delete-confirm'));

    await waitFor(() =>
      expect(deleteBomCoProduct).toHaveBeenCalledWith({ bomHeaderId: 'H1', coProductId: 'CP1' }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('surfaces a validation_failed (allocation > 100) refusal INLINE via role="alert", never throws', async () => {
    updateBomCoProduct.mockResolvedValueOnce({ ok: false, error: 'validation_failed' });
    const user = userEvent.setup();
    render(<BomCoProductRowActions target={TARGET} editable={true} canEdit={true} />);
    await user.click(screen.getByTestId('bom-coproduct-edit'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The non-by-product allocation across this BOM cannot exceed 100%.',
    );
    // Modal stays open on failure; refresh NOT called.
    expect(refresh).not.toHaveBeenCalled();
  });

  it('surfaces bom_not_editable inline on a delete refusal', async () => {
    deleteBomCoProduct.mockResolvedValueOnce({ ok: false, error: 'bom_not_editable' });
    const user = userEvent.setup();
    render(<BomCoProductRowActions target={TARGET} editable={true} canEdit={true} />);
    await user.click(screen.getByTestId('bom-coproduct-delete'));
    await user.click(screen.getByTestId('bom-coproduct-delete-confirm'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This BOM version is approved or active — its co-products can no longer be edited.',
    );
  });

  it('renders the buttons disabled with an honest title on a non-editable version', () => {
    render(<BomCoProductRowActions target={TARGET} editable={false} canEdit={true} />);
    const edit = screen.getByTestId('bom-coproduct-edit');
    const del = screen.getByTestId('bom-coproduct-delete');
    expect(edit).toBeDisabled();
    expect(del).toBeDisabled();
    expect(edit).toHaveAttribute(
      'title',
      'This BOM version is approved or active — its co-products can no longer be edited.',
    );
  });

  it('renders nothing without the create permission (RBAC, server-authoritative)', () => {
    const { container } = render(<BomCoProductRowActions target={TARGET} editable={true} canEdit={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
