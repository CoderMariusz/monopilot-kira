/**
 * @vitest-environment jsdom
 *
 * BenchmarkEditor RTL tests — FA Core multi-benchmark editor (migration 241).
 *
 * Prototype source (literal anchor):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:513-514
 *   (Core form-grid "Benchmark" + "Price (Brief)"). This component replaces the
 *   single Benchmark field with a repeatable {label, price} list + "+ Add".
 *
 * No DB: the Server Actions are passed as PROPS (Next16-safe) and stubbed with
 * vi.fn(). i18n labels are inline test messages (we do NOT edit i18n/*.json).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BenchmarkEditor, type BenchmarkEditorLabels, type BenchmarkRow } from '../benchmark-editor';

const labels: BenchmarkEditorLabels = {
  title: 'Benchmarks',
  subtitle: 'Competitor reference prices',
  countBadge: '{n} benchmarks',
  labelHeader: 'Benchmark',
  priceHeader: 'Price',
  labelPlaceholder: 'e.g. Tesco Finest',
  pricePlaceholder: '0.00',
  add: 'Add benchmark',
  save: 'Save',
  saving: 'Saving…',
  remove: 'Remove',
  saved: 'Saved',
  saveError: 'Could not save',
  loading: 'Loading…',
  empty: 'No benchmarks yet',
  emptyBody: 'Add a competitor benchmark price.',
  error: 'Something went wrong',
  forbidden: 'You do not have permission',
};

const row = (over: Partial<BenchmarkRow> = {}): BenchmarkRow => ({
  id: '11111111-1111-1111-1111-111111111111',
  label: 'Tesco Finest',
  price: '2.49',
  displayOrder: 0,
  ...over,
});

afterEach(cleanup);

describe('BenchmarkEditor', () => {
  it('renders existing rows with label + price and a count badge', () => {
    render(
      <BenchmarkEditor
        productCode="FA1"
        initialRows={[row(), row({ id: '22222222-2222-2222-2222-222222222222', label: 'Aldi', price: '1.99', displayOrder: 1 })]}
        labels={labels}
        onUpsert={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByTestId('fa-benchmarks-count')).toHaveTextContent('2 benchmarks');
    expect(screen.getAllByTestId('fa-benchmark-row')).toHaveLength(2);
    expect(screen.getByDisplayValue('Tesco Finest')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2.49')).toBeInTheDocument();
  });

  it('shows the empty state with an add action when there are no rows', () => {
    render(
      <BenchmarkEditor productCode="FA1" initialRows={[]} labels={labels} onUpsert={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText('No benchmarks yet')).toBeInTheDocument();
    expect(screen.getByTestId('fa-benchmarks-add-empty')).toBeInTheDocument();
  });

  it('renders the loading / error / permission_denied states', () => {
    const { rerender } = render(
      <BenchmarkEditor productCode="FA1" initialRows={[]} labels={labels} state="loading" onUpsert={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');

    rerender(
      <BenchmarkEditor productCode="FA1" initialRows={[]} labels={labels} state="error" onUpsert={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');

    rerender(
      <BenchmarkEditor productCode="FA1" initialRows={[]} labels={labels} state="permission_denied" onUpsert={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have permission');
  });

  it('adds a new row and persists it via onUpsert, promoting the temp row to its id', async () => {
    const user = userEvent.setup();
    const onUpsert = vi
      .fn()
      .mockResolvedValue(row({ id: '99999999-9999-9999-9999-999999999999', label: 'Sainsbury', price: '3.00', displayOrder: 1 }));
    render(
      <BenchmarkEditor productCode="FA1" initialRows={[row()]} labels={labels} onUpsert={onUpsert} onDelete={vi.fn()} />,
    );

    await user.click(screen.getByTestId('fa-benchmarks-add'));
    const rows = screen.getAllByTestId('fa-benchmark-row');
    expect(rows).toHaveLength(2);

    const newRow = rows[1];
    await user.type(within(newRow).getByLabelText('Benchmark'), 'Sainsbury');
    // type=number normalizes '3.00' to '3' in the DOM value; the component forwards
    // the field value verbatim (the Server Action + DB CHECK are the numeric guard).
    await user.type(within(newRow).getByLabelText('Price'), '3.00');
    await user.click(within(newRow).getByTestId('fa-benchmark-save'));

    await waitFor(() => expect(onUpsert).toHaveBeenCalledTimes(1));
    expect(onUpsert).toHaveBeenCalledWith({
      productCode: 'FA1',
      id: undefined,
      label: 'Sainsbury',
      price: '3',
      displayOrder: 1,
    });
    expect(screen.getByTestId('fa-benchmarks-feedback-success')).toHaveTextContent('Saved');
  });

  it('sends price=null when the price field is blank', async () => {
    const user = userEvent.setup();
    const onUpsert = vi.fn().mockResolvedValue(row({ price: null }));
    render(
      <BenchmarkEditor productCode="FA1" initialRows={[]} labels={labels} onUpsert={onUpsert} onDelete={vi.fn()} />,
    );
    await user.click(screen.getByTestId('fa-benchmarks-add-empty'));
    const onlyRow = screen.getByTestId('fa-benchmark-row');
    await user.type(within(onlyRow).getByLabelText('Benchmark'), 'No price ref');
    await user.click(within(onlyRow).getByTestId('fa-benchmark-save'));

    await waitFor(() => expect(onUpsert).toHaveBeenCalledTimes(1));
    expect(onUpsert).toHaveBeenCalledWith(expect.objectContaining({ label: 'No price ref', price: null }));
  });

  it('removes a persisted row via onDelete; drops an unsaved row locally without a call', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue({ removed: true });
    render(
      <BenchmarkEditor productCode="FA1" initialRows={[row()]} labels={labels} onUpsert={vi.fn()} onDelete={onDelete} />,
    );

    // Add an unsaved row, then remove it — no onDelete call (no id yet).
    await user.click(screen.getByTestId('fa-benchmarks-add'));
    expect(screen.getAllByTestId('fa-benchmark-row')).toHaveLength(2);
    const unsaved = screen.getAllByTestId('fa-benchmark-row')[1];
    await user.click(within(unsaved).getByTestId('fa-benchmark-remove'));
    expect(screen.getAllByTestId('fa-benchmark-row')).toHaveLength(1);
    expect(onDelete).not.toHaveBeenCalled();

    // Remove the persisted row — onDelete is called with its id.
    const persisted = screen.getByTestId('fa-benchmark-row');
    await user.click(within(persisted).getByTestId('fa-benchmark-remove'));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith({ productCode: 'FA1', id: row().id }));
  });

  it('surfaces a save error and does not promote the row', async () => {
    const user = userEvent.setup();
    const onUpsert = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <BenchmarkEditor productCode="FA1" initialRows={[]} labels={labels} onUpsert={onUpsert} onDelete={vi.fn()} />,
    );
    await user.click(screen.getByTestId('fa-benchmarks-add-empty'));
    const onlyRow = screen.getByTestId('fa-benchmark-row');
    await user.type(within(onlyRow).getByLabelText('Benchmark'), 'Will fail');
    await user.click(within(onlyRow).getByTestId('fa-benchmark-save'));
    await waitFor(() => expect(screen.getByTestId('fa-benchmarks-feedback-error')).toHaveTextContent('Could not save'));
  });
});
