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

const { updateBomLine, deleteBomLine, refresh, listManufacturingOperations } = vi.hoisted(() => ({
  updateBomLine: vi.fn(),
  deleteBomLine: vi.fn(),
  refresh: vi.fn(),
  listManufacturingOperations: vi.fn(),
}));

vi.mock('../../_actions/line-actions', () => ({ updateBomLine, deleteBomLine }));
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
});

const TARGET: BomLineRowActionTarget = {
  bomHeaderId: 'H1',
  lineId: 'L1',
  componentCode: 'RM-002',
  quantity: '1.5',
  uom: 'kg',
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
});
