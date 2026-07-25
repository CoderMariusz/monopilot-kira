/**
 * PF-R05-07 — picker cost label must use v_item_effective_cost currency via symbolFor,
 * never a hardcoded €. Unknown currency → no fabricated symbol.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ItemPickerOption } from '../../../../(npd)/fa/actions/search-items-types';
import { symbolFor } from '../pipeline/[projectId]/formulation/_components/cost-panel';
import { ItemPicker } from './item-picker';

const labels = {
  trigger: 'Add item',
  searchLabel: 'Search items',
  searchPlaceholder: 'Search by code or name',
  loading: 'Searching',
  empty: 'No items',
  cancel: 'Cancel',
  error: 'Search failed',
};

const GBP_ITEM: ItemPickerOption = {
  id: 'wip-019',
  itemCode: 'WIP-019',
  name: 'Sugar syrup',
  itemType: 'intermediate',
  status: 'active',
  costPerKgEur: '217.230000',
  costCurrency: 'GBP',
  uomBase: 'kg',
};

const UNKNOWN_CURRENCY_ITEM: ItemPickerOption = {
  ...GBP_ITEM,
  id: 'item-unknown',
  itemCode: 'RM-UNK',
  costCurrency: null,
};

describe('ItemPicker — cost currency label (PF-R05-07)', () => {
  it('renders the same GBP symbol as the formulation cost panel for the same item', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const searchItemsAction = vi.fn(async () => [GBP_ITEM]);
    const onSelect = vi.fn();

    render(<ItemPicker labels={labels} onSelect={onSelect} searchItemsAction={searchItemsAction} />);
    fireEvent.click(screen.getByRole('button', { name: labels.trigger }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'WIP' } });
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      const expected = `${symbolFor('GBP')}217.230000/kg`;
      expect(screen.getByText(expected)).toBeInTheDocument();
    });
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('does not render € or £ when the item currency is unknown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const searchItemsAction = vi.fn(async () => [UNKNOWN_CURRENCY_ITEM]);
    const onSelect = vi.fn();

    render(<ItemPicker labels={labels} onSelect={onSelect} searchItemsAction={searchItemsAction} />);
    fireEvent.click(screen.getByRole('button', { name: labels.trigger }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'RM' } });
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByText('217.230000/kg')).toBeInTheDocument();
    });
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(screen.queryByText(/£/)).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
