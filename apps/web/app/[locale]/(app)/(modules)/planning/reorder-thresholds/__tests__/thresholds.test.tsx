/**
 * CL2 slice 2 — /planning/reorder-thresholds screen RTL tests (jsdom,
 * vitest.ui.config.ts).
 *
 * The async RSC page composes labels + the supplier options server-side and
 * injects the Server Actions; here we exercise the client view against
 * injected seams: list states (loading/denied/error/empty/table), the
 * add/edit modal (validation + upsert payload), and delete-with-reload.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ThresholdsView, type ThresholdsLabels } from '../_components/thresholds-view';
import type { ReorderThresholdRow, ThresholdResult } from '../../_actions/reorder-thresholds';

const LABELS: ThresholdsLabels = {
  add: '+ Add threshold',
  empty: 'No reorder thresholds configured',
  emptyHint: 'Add a threshold to get below-minimum alerts in MRP runs.',
  loading: 'Loading…',
  denied: "You don't have permission to view reorder thresholds.",
  error: 'Failed to load reorder thresholds.',
  edit: 'Edit',
  remove: 'Delete',
  removing: 'Deleting…',
  days: 'days',
  noSupplier: 'No preferred supplier',
  columns: {
    item: 'Item',
    minQty: 'Min qty',
    reorderQty: 'Reorder qty',
    supplier: 'Preferred supplier',
    leadTime: 'Lead time',
    updated: 'Updated',
  },
  modal: {
    titleAdd: 'Add reorder threshold',
    titleEdit: 'Edit reorder threshold',
    itemLabel: 'Item',
    minQtyLabel: 'Minimum quantity (base UoM)',
    reorderQtyLabel: 'Reorder quantity (base UoM)',
    reorderQtyHint: '0 = no fixed lot.',
    supplierLabel: 'Preferred supplier',
    supplierNone: 'None',
    submit: 'Save',
    submitting: 'Saving…',
    cancel: 'Cancel',
    clearItem: 'Clear item',
    errors: {
      itemRequired: 'Pick an item.',
      qtyInvalid: 'Quantities must be non-negative numbers (up to 6 decimals).',
      invalid_input: 'Invalid input.',
      forbidden: "You don't have permission to edit reorder thresholds.",
      not_found: 'Item or supplier not found.',
      persistence_failed: 'Saving failed. Try again.',
    },
    picker: {
      trigger: '+ Pick item',
      searchLabel: 'Search items',
      searchPlaceholder: 'Search by code or name…',
      loading: 'Searching…',
      empty: 'No matching items',
      cancel: 'Cancel',
      error: 'Item search failed',
    },
  },
};

const ROW: ReorderThresholdRow = {
  id: 'th-1',
  itemId: 'i1',
  itemCode: 'RM-FLOUR',
  itemName: 'Wheat flour',
  uomBase: 'kg',
  minQty: '20.000000',
  reorderQty: '50.000000',
  preferredSupplierId: 'sup-1',
  supplierCode: 'SUP-01',
  supplierName: 'Mill & Co',
  leadTimeDays: 7,
  updatedAt: '2026-06-11T09:00:00.000Z',
};

const SUPPLIERS = [{ id: 'sup-1', code: 'SUP-01', name: 'Mill & Co', leadTimeDays: 7 }];

const okList =
  (rows: ReorderThresholdRow[]) => (): Promise<ThresholdResult<ReorderThresholdRow[]>> =>
    Promise.resolve({ ok: true, data: rows });

function renderView(over: Partial<React.ComponentProps<typeof ThresholdsView>> = {}) {
  return render(
    <ThresholdsView
      labels={LABELS}
      suppliers={SUPPLIERS}
      listAction={vi.fn(okList([ROW]))}
      upsertAction={vi.fn(async () => ({ ok: true as const, data: ROW }))}
      deleteAction={vi.fn(async () => ({ ok: true as const, data: { id: 'th-1' } }))}
      searchItemsAction={vi.fn(async () => [])}
      {...over}
    />,
  );
}

describe('/planning/reorder-thresholds — ThresholdsView', () => {
  it('lists configured thresholds with supplier + lead time', async () => {
    renderView();
    await waitFor(() => expect(screen.getByTestId('thresholds-table')).toBeInTheDocument());

    const row = screen.getByTestId('threshold-row-RM-FLOUR');
    expect(row).toHaveTextContent('RM-FLOUR');
    expect(row).toHaveTextContent('Wheat flour');
    expect(row).toHaveTextContent('20.000000 kg');
    expect(row).toHaveTextContent('50.000000 kg');
    expect(row).toHaveTextContent('SUP-01');
    expect(row).toHaveTextContent('7 days');
  });

  it('shows the honest empty state', async () => {
    renderView({ listAction: vi.fn(okList([])) });
    await waitFor(() => expect(screen.getByTestId('thresholds-empty')).toBeInTheDocument());
    expect(screen.getByTestId('thresholds-empty')).toHaveTextContent('No reorder thresholds configured');
  });

  it('surfaces permission-denied from the list read', async () => {
    renderView({
      listAction: vi.fn(async () => ({ ok: false as const, error: 'forbidden' as const })),
    });
    await waitFor(() => expect(screen.getByTestId('thresholds-denied')).toBeInTheDocument());
    expect(screen.queryByTestId('thresholds-table')).toBeNull();
  });

  it('surfaces the error state without a 500', async () => {
    renderView({
      listAction: vi.fn(async () => ({ ok: false as const, error: 'persistence_failed' as const })),
    });
    await waitFor(() => expect(screen.getByTestId('thresholds-error')).toBeInTheDocument());
  });

  it('requires an item before submitting the add modal', async () => {
    const upsertAction = vi.fn();
    renderView({ upsertAction });
    await waitFor(() => expect(screen.getByTestId('thresholds-table')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('thresholds-add'));
    await waitFor(() => expect(screen.getByTestId('threshold-form')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('threshold-submit'));
    await waitFor(() => expect(screen.getByTestId('threshold-form-error')).toBeInTheDocument());
    expect(screen.getByTestId('threshold-form-error')).toHaveTextContent('Pick an item.');
    expect(upsertAction).not.toHaveBeenCalled();
  });

  it('edits an existing threshold — locked item, prefilled values, upsert payload', async () => {
    const upsertAction = vi.fn(async () => ({ ok: true as const, data: ROW }));
    const listAction = vi.fn(okList([ROW]));
    renderView({ upsertAction, listAction });
    await waitFor(() => expect(screen.getByTestId('thresholds-table')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('threshold-edit-RM-FLOUR'));
    await waitFor(() => expect(screen.getByTestId('threshold-form')).toBeInTheDocument());

    // Prefilled from the row; the item is locked while editing (no clear button).
    expect(screen.getByTestId('threshold-item')).toHaveTextContent('RM-FLOUR');
    expect(screen.queryByTestId('threshold-item-clear')).toBeNull();
    expect(screen.getByTestId('threshold-min-qty')).toHaveValue('20.000000');
    expect(screen.getByTestId('threshold-reorder-qty')).toHaveValue('50.000000');

    fireEvent.change(screen.getByTestId('threshold-min-qty'), { target: { value: '25.5' } });
    fireEvent.click(screen.getByTestId('threshold-submit'));

    await waitFor(() =>
      expect(upsertAction).toHaveBeenCalledWith({
        itemId: 'i1',
        minQty: '25.5',
        reorderQty: '50.000000',
        preferredSupplierId: 'sup-1',
      }),
    );
    // Saved → modal closes and the list reloads.
    await waitFor(() => expect(screen.queryByTestId('threshold-form')).toBeNull());
    expect(listAction).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed quantities client-side before calling the action', async () => {
    const upsertAction = vi.fn();
    renderView({ upsertAction });
    await waitFor(() => expect(screen.getByTestId('thresholds-table')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('threshold-edit-RM-FLOUR'));
    await waitFor(() => expect(screen.getByTestId('threshold-form')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('threshold-min-qty'), { target: { value: '-3' } });
    fireEvent.click(screen.getByTestId('threshold-submit'));

    await waitFor(() => expect(screen.getByTestId('threshold-form-error')).toBeInTheDocument());
    expect(upsertAction).not.toHaveBeenCalled();
  });

  it('maps a forbidden upsert to the inline error', async () => {
    const upsertAction = vi.fn(async () => ({ ok: false as const, error: 'forbidden' as const }));
    renderView({ upsertAction });
    await waitFor(() => expect(screen.getByTestId('thresholds-table')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('threshold-edit-RM-FLOUR'));
    await waitFor(() => expect(screen.getByTestId('threshold-form')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('threshold-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('threshold-form-error')).toHaveTextContent(
        "You don't have permission to edit reorder thresholds.",
      ),
    );
  });

  it('deletes a threshold and reloads the list', async () => {
    const deleteAction = vi.fn(async () => ({ ok: true as const, data: { id: 'th-1' } }));
    const listAction = vi.fn(okList([ROW]));
    renderView({ deleteAction, listAction });
    await waitFor(() => expect(screen.getByTestId('thresholds-table')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('threshold-delete-RM-FLOUR'));
    await waitFor(() => expect(deleteAction).toHaveBeenCalledWith('th-1'));
    await waitFor(() => expect(listAction).toHaveBeenCalledTimes(2));
  });
});
