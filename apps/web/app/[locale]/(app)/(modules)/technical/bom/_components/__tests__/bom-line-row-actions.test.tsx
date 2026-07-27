/**
 * @vitest-environment jsdom
 *
 * RTL — BOM component-line row actions (edit modal payload + delete confirm flow +
 * disabled-on-active). Verifies the edit modal sends qty as a DECIMAL STRING and
 * patches uom/manufacturingOperationName, the delete confirm calls deleteBomLine,
 * and that on a non-editable version the buttons render disabled with an honest title.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { updateBomLine, deleteBomLine, moveBomLine, refresh, listManufacturingOperations } = vi.hoisted(() => ({
  updateBomLine: vi.fn(),
  deleteBomLine: vi.fn(),
  moveBomLine: vi.fn(),
  refresh: vi.fn(),
  listManufacturingOperations: vi.fn(),
}));

vi.mock('../../_actions/line-actions', () => ({ updateBomLine, deleteBomLine, moveBomLine }));
vi.mock('../../../../../../../../actions/reference/manufacturing-ops/list', () => ({
  listManufacturingOperations,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('next-intl', () => {
  const t = (k: string) => k;
  t.has = () => false;
  t.raw = (k: string) => k;
  return { useTranslations: () => t };
});

import { BomLineRowActions, type BomLineRowActionTarget } from '../bom-line-row-actions';

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  listManufacturingOperations.mockResolvedValue({
    ok: true,
    data: [{ name: 'Packing' }, { name: 'Mixing' }],
  });
  updateBomLine.mockResolvedValue({ ok: true, data: { lineId: 'L1', bomHeaderId: 'H1' } });
  deleteBomLine.mockResolvedValue({ ok: true, data: { lineId: 'L1', bomHeaderId: 'H1' } });
  moveBomLine.mockResolvedValue({ ok: true, data: { lineId: 'L1', bomHeaderId: 'H1' } });
});

const TARGET: BomLineRowActionTarget = {
  bomHeaderId: 'H1',
  lineId: 'L1',
  componentCode: 'RM-002',
  quantity: '1.5',
  uom: 'kg',
  scrapPct: '1.00',
  manufacturingOperationName: 'Packing',
};

describe('BomLineRowActions', () => {
  it('opens the edit modal prefilled and sends qty as a decimal string', async () => {
    const user = userEvent.setup();
    render(<BomLineRowActions target={TARGET} editable={true} canEdit={true} />);

    await user.click(screen.getByTestId('bom-line-edit'));
    const qty = screen.getByLabelText('Quantity');
    expect(qty).toHaveValue(1.5);

    await user.clear(qty);
    await user.type(qty, '3');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateBomLine).toHaveBeenCalledTimes(1));
    const payload = updateBomLine.mock.calls[0][0];
    expect(payload).toEqual({
      bomHeaderId: 'H1',
      lineId: 'L1',
      qty: '3',
      uom: 'kg',
      scrapPct: 1,
      manufacturingOperationName: 'Packing',
    });
    expect(typeof payload.qty).toBe('string');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('loads manufacturing operations when the edit modal opens', async () => {
    const user = userEvent.setup();
    render(<BomLineRowActions target={TARGET} editable={true} canEdit={true} />);

    await user.click(screen.getByTestId('bom-line-edit'));
    await waitFor(() => expect(listManufacturingOperations).toHaveBeenCalled());
    expect(screen.getByText('Manufacturing operation')).toBeInTheDocument();
  });

  it('blocks save when qty is non-positive', async () => {
    const user = userEvent.setup();
    render(<BomLineRowActions target={TARGET} editable={true} canEdit={true} />);
    await user.click(screen.getByTestId('bom-line-edit'));
    const qty = screen.getByLabelText('Quantity');
    await user.clear(qty);
    await user.type(qty, '0');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(updateBomLine).not.toHaveBeenCalled();
  });

  it('runs the delete confirm flow and calls deleteBomLine', async () => {
    const user = userEvent.setup();
    render(<BomLineRowActions target={TARGET} editable={true} canEdit={true} />);

    await user.click(screen.getByTestId('bom-line-delete'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByTestId('bom-line-delete-confirm'));

    await waitFor(() => expect(deleteBomLine).toHaveBeenCalledWith({ bomHeaderId: 'H1', lineId: 'L1' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('surfaces bom_not_editable inline on a server refusal', async () => {
    updateBomLine.mockResolvedValueOnce({ ok: false, error: 'bom_not_editable' });
    const user = userEvent.setup();
    render(<BomLineRowActions target={TARGET} editable={true} canEdit={true} />);
    await user.click(screen.getByTestId('bom-line-edit'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This BOM version is approved or active — its components can no longer be edited.');
  });

  it('renders the buttons disabled with an honest title on a non-editable version', () => {
    render(<BomLineRowActions target={TARGET} editable={false} canEdit={true} />);
    const edit = screen.getByTestId('bom-line-edit');
    const del = screen.getByTestId('bom-line-delete');
    expect(edit).toBeDisabled();
    expect(del).toBeDisabled();
    expect(edit).toHaveAttribute('title', 'This BOM version is approved or active — its components can no longer be edited.');
  });

  it('renders nothing without the create permission', () => {
    const { container } = render(<BomLineRowActions target={TARGET} editable={true} canEdit={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  // ── PF-R06-03 — scrap % editable, with honest numeric(5,2) precision ──────────
  it('prefills scrap % from the row and sends the edited value', async () => {
    const user = userEvent.setup();
    render(<BomLineRowActions target={TARGET} editable={true} canEdit={true} />);

    await user.click(screen.getByTestId('bom-line-edit'));
    const scrap = screen.getByTestId('bom-line-scrap');
    expect(scrap).toHaveValue(1);
    expect(scrap).toHaveAttribute('step', '0.01');

    await user.clear(scrap);
    await user.type(scrap, '4.25');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateBomLine).toHaveBeenCalledTimes(1));
    expect(updateBomLine.mock.calls[0][0]).toMatchObject({ scrapPct: 4.25 });
  });

  it('refuses a 3rd decimal with an explicit message instead of silently truncating it', async () => {
    const user = userEvent.setup();
    render(<BomLineRowActions target={TARGET} editable={true} canEdit={true} />);

    await user.click(screen.getByTestId('bom-line-edit'));
    const scrap = screen.getByTestId('bom-line-scrap');
    await user.clear(scrap);
    await user.type(scrap, '2.3456');

    expect(screen.getByTestId('bom-line-scrap-precision-error')).toHaveTextContent(
      'Scrap % supports at most 2 decimal places.',
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(updateBomLine).not.toHaveBeenCalled();
  });

  it('accepts exactly 2 decimals (no float-dust false rejection on 2.35)', async () => {
    const user = userEvent.setup();
    render(<BomLineRowActions target={TARGET} editable={true} canEdit={true} />);

    await user.click(screen.getByTestId('bom-line-edit'));
    const scrap = screen.getByTestId('bom-line-scrap');
    await user.clear(scrap);
    await user.type(scrap, '2.35');

    expect(screen.queryByTestId('bom-line-scrap-precision-error')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('shows the V-TEC-11 advisory once scrap reaches 50% without blocking the save', async () => {
    const user = userEvent.setup();
    render(<BomLineRowActions target={TARGET} editable={true} canEdit={true} />);

    await user.click(screen.getByTestId('bom-line-edit'));
    const scrap = screen.getByTestId('bom-line-scrap');
    await user.clear(scrap);
    await user.type(scrap, '55');

    expect(document.querySelector('[data-warning-code="V-TEC-11"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  // ── [B-11] the manufacturing operation is OPTIONAL (over-blocking regression) ──
  // A draft authored by NPD/the generator has manufacturing_operation_name = NULL.
  // Requiring it here left Save permanently disabled, so such a line could not be
  // edited at all — not even to change its scrap %.
  it('lets a line with NO manufacturing operation be saved', async () => {
    const user = userEvent.setup();
    const noOperation = { ...TARGET, manufacturingOperationName: null };
    render(<BomLineRowActions target={noOperation} editable={true} canEdit={true} />);

    await user.click(screen.getByTestId('bom-line-edit'));
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeEnabled();

    const scrap = screen.getByTestId('bom-line-scrap');
    await user.clear(scrap);
    await user.type(scrap, '3.5');
    await user.click(save);

    await waitFor(() => expect(updateBomLine).toHaveBeenCalledTimes(1));
    // Empty on the wire — updateBomLine maps '' to NULL, which the column allows.
    expect(updateBomLine.mock.calls[0][0]).toMatchObject({
      manufacturingOperationName: '',
      scrapPct: 3.5,
    });
  });

  it('does not mark the manufacturing operation as required', async () => {
    const user = userEvent.setup();
    render(<BomLineRowActions target={{ ...TARGET, manufacturingOperationName: null }} editable={true} canEdit={true} />);
    await user.click(screen.getByTestId('bom-line-edit'));
    expect(screen.queryByText('Select a manufacturing operation.')).not.toBeInTheDocument();
    const label = screen.getByText('Manufacturing operation');
    expect(label.querySelector('.req')).toBeNull();
  });

  it('still blocks the save on a genuinely invalid field (guard removal was scoped)', async () => {
    const user = userEvent.setup();
    render(<BomLineRowActions target={{ ...TARGET, manufacturingOperationName: null }} editable={true} canEdit={true} />);
    await user.click(screen.getByTestId('bom-line-edit'));
    const scrap = screen.getByTestId('bom-line-scrap');
    await user.clear(scrap);
    await user.type(scrap, '2.3456');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  // ── PF-R06-04 — reorder controls ─────────────────────────────────────────────
  it('calls moveBomLine with direction "up" and refreshes', async () => {
    const user = userEvent.setup();
    render(<BomLineRowActions target={TARGET} editable={true} canEdit={true} isFirst={false} isLast={false} />);

    await user.click(screen.getByTestId('bom-line-move-up'));
    await waitFor(() =>
      expect(moveBomLine).toHaveBeenCalledWith({ bomHeaderId: 'H1', lineId: 'L1', direction: 'up' }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('calls moveBomLine with direction "down"', async () => {
    const user = userEvent.setup();
    render(<BomLineRowActions target={TARGET} editable={true} canEdit={true} isFirst={false} isLast={false} />);

    await user.click(screen.getByTestId('bom-line-move-down'));
    await waitFor(() =>
      expect(moveBomLine).toHaveBeenCalledWith({ bomHeaderId: 'H1', lineId: 'L1', direction: 'down' }),
    );
  });

  it('disables "up" on the first row and "down" on the last, with component-scoped aria-labels', () => {
    const { unmount } = render(
      <BomLineRowActions target={TARGET} editable={true} canEdit={true} isFirst={true} isLast={false} />,
    );
    expect(screen.getByTestId('bom-line-move-up')).toBeDisabled();
    expect(screen.getByTestId('bom-line-move-down')).toBeEnabled();
    expect(screen.getByTestId('bom-line-move-up')).toHaveAttribute('aria-label', 'Move RM-002 up');
    unmount();

    render(<BomLineRowActions target={TARGET} editable={true} canEdit={true} isFirst={false} isLast={true} />);
    expect(screen.getByTestId('bom-line-move-up')).toBeEnabled();
    expect(screen.getByTestId('bom-line-move-down')).toBeDisabled();
  });

  it('disables reorder entirely on a non-editable version', () => {
    render(<BomLineRowActions target={TARGET} editable={false} canEdit={true} />);
    expect(screen.getByTestId('bom-line-move-up')).toBeDisabled();
    expect(screen.getByTestId('bom-line-move-down')).toBeDisabled();
  });

  it('surfaces a reorder refusal on the row (no dialog is open to hold it)', async () => {
    moveBomLine.mockResolvedValueOnce({ ok: false, error: 'bom_not_editable' });
    const user = userEvent.setup();
    render(<BomLineRowActions target={TARGET} editable={true} canEdit={true} />);

    await user.click(screen.getByTestId('bom-line-move-down'));
    expect(await screen.findByTestId('bom-line-row-error')).toHaveTextContent(
      'This BOM version is approved or active — its components can no longer be edited.',
    );
  });
});
