/**
 * B-2 — Changeover register list RTL: prototype parity (other-screens.jsx:298-397
 * + dashboard.jsx:249-267) — rows, status filter chips, empty state, and the
 * "+ New changeover" modal (line <Select> + product ItemPicker + cleaning
 * checkbox + ATP + notes; createChangeoverEvent payload).
 *
 * createChangeoverEvent / signChangeover / searchItems are injected vi.fn() stubs.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

import enMessages from '../../../../../../../i18n/en.json';
import { ChangeoversList } from '../_components/changeovers-list.client';
import { buildChangeoversLabels } from '../_components/build-labels';
import type { ChangeoverListRow } from '../_components/changeovers-contract';

const enCo = (enMessages as Record<string, any>).production.changeovers;
const t = (key: string): string => {
  let node: any = enCo;
  for (const p of key.split('.')) node = node?.[p];
  if (typeof node !== 'string') throw new Error(`MISSING en key production.changeovers.${key}`);
  return node;
};
const all = buildChangeoversLabels(t);

const ROWS: ChangeoverListRow[] = [
  {
    id: 'co-pending',
    lineId: 'l1',
    lineCode: 'LINE-01',
    toProduct: { id: 'p2', code: 'FG5302', name: 'B' },
    fromProduct: { id: 'p1', code: 'FG5301', name: 'A' },
    allergenRisk: 'medium',
    cleaningCompleted: false,
    dualSignOffStatus: 'pending',
    createdAt: '2026-04-20T08:00:00.000Z',
  },
  {
    id: 'co-first',
    lineId: 'l2',
    lineCode: 'LINE-02',
    toProduct: { id: 'p4', code: 'FG6001', name: 'D' },
    cleaningCompleted: true,
    atpResult: '7 RLU',
    dualSignOffStatus: 'first_signed',
    firstSigner: { id: 'u1', name: 'M. Szymczak', email: 'm@x', signedAt: '2026-04-20T08:24:00.000Z' },
    createdAt: '2026-04-20T08:10:00.000Z',
  },
  {
    id: 'co-complete',
    lineId: 'l3',
    lineCode: 'LINE-03',
    toProduct: { id: 'p6', code: 'FG7001', name: 'F' },
    cleaningCompleted: true,
    dualSignOffStatus: 'complete',
    createdAt: '2026-04-20T08:20:00.000Z',
  },
];

const LINES = [
  { id: 'l1', code: 'LINE-01' },
  { id: 'l2', code: 'LINE-02' },
];

function renderList(props: Partial<React.ComponentProps<typeof ChangeoversList>> = {}) {
  const createChangeoverAction = props.createChangeoverAction ?? vi.fn().mockResolvedValue({ ok: true });
  const searchItemsAction =
    props.searchItemsAction ??
    vi.fn().mockResolvedValue([{ id: 'fg-1', itemCode: 'FG9999', name: 'New FG', itemType: 'fg', status: 'active', costPerKgEur: null, uomBase: 'kg' }]);
  render(
    <ChangeoversList
      rows={ROWS}
      lines={LINES}
      initialFilter="all"
      labels={all.list}
      createLabels={all.create}
      signLabels={all.sign}
      createChangeoverAction={createChangeoverAction}
      signChangeoverAction={props.signChangeoverAction ?? vi.fn()}
      searchItemsAction={searchItemsAction}
    />,
  );
  return { createChangeoverAction, searchItemsAction };
}

describe('ChangeoversList — rows + filters', () => {
  it('renders all rows with the status badge + cleaning marker', () => {
    renderList();
    expect(screen.getByTestId('changeover-row-co-pending')).toBeInTheDocument();
    expect(screen.getByTestId('changeover-status-co-complete')).toHaveTextContent(all.list.status.complete);
    expect(screen.getByTestId('changeover-cleaning-co-first')).toHaveTextContent(all.list.cleaningYes);
    expect(screen.getByTestId('changeover-cleaning-co-pending')).toHaveTextContent(all.list.cleaningNo);
  });

  it('the four filter chips exist (Pending / Awaiting 2nd / Complete + All)', () => {
    renderList();
    expect(screen.getByTestId('changeover-filter-all')).toBeInTheDocument();
    expect(screen.getByTestId('changeover-filter-pending')).toBeInTheDocument();
    expect(screen.getByTestId('changeover-filter-first_signed')).toHaveTextContent('Awaiting 2nd signature');
    expect(screen.getByTestId('changeover-filter-complete')).toBeInTheDocument();
  });

  it('filtering to "complete" hides the other rows', () => {
    renderList();
    fireEvent.click(screen.getByTestId('changeover-filter-complete'));
    expect(screen.getByTestId('changeover-row-co-complete')).toBeInTheDocument();
    expect(screen.queryByTestId('changeover-row-co-pending')).not.toBeInTheDocument();
  });

  it('a filter with no matching rows shows the empty state', () => {
    render(
      <ChangeoversList
        rows={[ROWS[0]]}
        lines={LINES}
        initialFilter="complete"
        labels={all.list}
        createLabels={all.create}
        signLabels={all.sign}
        createChangeoverAction={vi.fn()}
        signChangeoverAction={vi.fn()}
        searchItemsAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId('changeover-empty')).toHaveTextContent(all.list.empty);
  });

  it('the review button expands the inline dual-sign panel', () => {
    renderList();
    fireEvent.click(screen.getByTestId('changeover-review-co-pending'));
    expect(screen.getByTestId('changeover-sign-panel-co-pending')).toBeInTheDocument();
  });
});

describe('ChangeoversList — new-changeover modal', () => {
  it('opens the modal and blocks submit until a line + to-product are chosen', async () => {
    const { createChangeoverAction } = renderList();
    fireEvent.click(screen.getByTestId('changeover-new'));
    const form = await screen.findByTestId('changeover-create-form');
    expect(form).toBeInTheDocument();
    // Submit with nothing selected → validation error, no action call.
    fireEvent.click(screen.getByTestId('changeover-create-submit'));
    await waitFor(() => expect(screen.getByTestId('changeover-create-error')).toHaveTextContent(all.create.validation.lineRequired));
    expect(createChangeoverAction).not.toHaveBeenCalled();
  });

  it('submits the create payload with the chosen line + to-product + cleaning flag', async () => {
    const { createChangeoverAction, searchItemsAction } = renderList();
    fireEvent.click(screen.getByTestId('changeover-new'));
    await screen.findByTestId('changeover-create-form');

    // Line select: the @monopilot/ui <Select> is a role="combobox" button that
    // opens a role="listbox" — click the trigger, then click the LINE-02 option.
    const lineTrigger = screen.getByRole('combobox');
    fireEvent.click(lineTrigger);
    fireEvent.click(await screen.findByRole('option', { name: 'LINE-02' }));

    // To-product via the ItemPicker: open → search returns one fg → pick it.
    const triggers = screen.getAllByRole('button', { name: all.create.picker.trigger });
    // Two pickers (from + to); the second is the required "to" product.
    fireEvent.click(triggers[triggers.length - 1]);
    await waitFor(() => expect(searchItemsAction).toHaveBeenCalled());
    const option = await screen.findByText(/FG9999/);
    fireEvent.click(option);
    await screen.findByTestId('changeover-to-product');

    fireEvent.click(screen.getByTestId('changeover-cleaning'));
    fireEvent.change(screen.getByTestId('changeover-atp'), { target: { value: '6 RLU' } });

    fireEvent.click(screen.getByTestId('changeover-create-submit'));
    await waitFor(() => expect(createChangeoverAction).toHaveBeenCalledTimes(1));
    expect(createChangeoverAction).toHaveBeenCalledWith(
      expect.objectContaining({ lineId: 'l2', toProductId: 'fg-1', cleaningCompleted: true, atpResult: '6 RLU' }),
    );
  });
});
