import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Modal from '@monopilot/ui/Modal';

import type { ItemPickerOption } from '../../../../(npd)/fa/actions/search-items-types';
import { ItemPicker } from './item-picker';

const ITEMS: ItemPickerOption[] = [
  {
    id: 'item-1',
    itemCode: 'RM-SALT',
    name: 'Salt',
    itemType: 'rm',
    status: 'active',
    costPerKgEur: null,
    listPriceGbp: '1.00',
    uomBase: 'kg',
  },
  {
    id: 'item-2',
    itemCode: 'RM-SUGAR',
    name: 'Sugar',
    itemType: 'rm',
    status: 'active',
    costPerKgEur: null,
    listPriceGbp: '2.00',
    uomBase: 'kg',
  },
];

const labels = {
  trigger: 'Add item',
  searchLabel: 'Search items',
  searchPlaceholder: 'Search by code or name',
  loading: 'Searching',
  empty: 'No items',
  cancel: 'Cancel',
  error: 'Search failed',
};

function Harness({
  onSelect,
  searchItemsAction,
}: {
  onSelect: (item: ItemPickerOption) => void;
  searchItemsAction: (input: { query?: string }) => Promise<ItemPickerOption[]>;
}) {
  const [open, setOpen] = useState(true);
  const [notes, setNotes] = useState('');

  return (
    <Modal open={open} onOpenChange={setOpen} size="md">
      <Modal.Header title="Create PO" />
      <Modal.Body>
        <ItemPicker labels={labels} onSelect={onSelect} searchItemsAction={searchItemsAction} />
        <label htmlFor="po-notes">Notes</label>
        <textarea id="po-notes" aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Modal.Body>
    </Modal>
  );
}

describe('ItemPicker inside Modal focus scope', () => {
  it('keeps search keystrokes in the picker, leaves Notes unchanged, and supports ArrowDown+Enter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSelect = vi.fn();
    const searchItemsAction = vi.fn(async ({ query }: { query?: string }) => {
      const term = (query ?? '').toLowerCase();
      return ITEMS.filter(
        (item) => item.itemCode.toLowerCase().includes(term) || item.name.toLowerCase().includes(term),
      );
    });

    render(<Harness onSelect={onSelect} searchItemsAction={searchItemsAction} />);

    const notes = screen.getByRole('textbox', { name: 'Notes' });
    await user.click(screen.getByTestId('item-picker-trigger'));

    const search = await screen.findByRole('combobox', { name: labels.searchLabel });
    await user.type(search, 'salt');
    await vi.advanceTimersByTimeAsync(300);

    await waitFor(() => {
      expect(search).toHaveValue('salt');
      expect(screen.getAllByTestId('item-picker-option')).toHaveLength(1);
    });
    expect(notes).toHaveValue('');

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ itemCode: 'RM-SALT' }));
    });

    vi.useRealTimers();
  });
});
