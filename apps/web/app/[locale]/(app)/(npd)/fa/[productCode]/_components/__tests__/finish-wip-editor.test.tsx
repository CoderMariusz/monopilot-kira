/**
 * RTL — FinishWipEditor parity + behaviour.
 *   - rows render from real-shaped prod_detail props;
 *   - auto-derived RM/intermediate code cell is read-only (green);
 *   - add/remove ENABLED only when multi-component;
 *   - single-component shows exactly one locked row + add/remove gone;
 *   - 5 UI states render their notice;
 *   - optimistic add calls the Server Action prop.
 *
 * i18n: inline test messages (the page centralizes the real npd.finishWip.* keys).
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  FinishWipEditor,
  type FinishWipEditorLabels,
  type FinishWipEditorProps,
} from '../finish-wip-editor';
import type { FinishWipRow } from '../../_actions/finish-wip-types';

const labels: FinishWipEditorLabels = {
  title: 'Finish WIP (production components)',
  subtitle: 'Per-component finish WIP backed by ProdDetail',
  multiBadge: 'Multi component',
  singleBadge: 'Single component',
  componentHeader: 'Component',
  autoCodeHeader: 'RM / ingredient code (auto)',
  weightHeader: 'Weight (g)',
  actionsHeader: 'Actions',
  autoHint: 'Auto-derived',
  addRow: 'Add component',
  removeRow: 'Remove',
  componentPlaceholder: 'PR8801',
  singleLockedHint: 'Single-component product — one row mirrors the main table.',
  loading: 'Loading components…',
  empty: 'No components yet',
  emptyBody: 'Add the first finish-WIP component.',
  error: 'Could not load components.',
  forbidden: 'You do not have permission to view components.',
  saving: 'Saving…',
  saveError: 'Could not save the component.',
};

const realRows: FinishWipRow[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    componentIndex: 1,
    intermediateCode: 'PR8801',
    ingredientCode: 'RM8801',
    componentWeight: 70,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    componentIndex: 2,
    intermediateCode: 'PR8802',
    ingredientCode: 'RM8802',
    componentWeight: null,
  },
];

function setup(overrides: Partial<FinishWipEditorProps> = {}) {
  const onAddRow = vi.fn(async () => ({
    id: '33333333-3333-3333-3333-333333333333',
    componentIndex: 3,
    intermediateCode: 'PR8803',
    ingredientCode: 'RM8803',
    componentWeight: null,
  }));
  const onRemoveRow = vi.fn(async () => ({ removed: true }));
  render(
    <FinishWipEditor
      productCode="FA1234"
      rows={realRows}
      isMultiComponent
      labels={labels}
      onAddRow={onAddRow}
      onRemoveRow={onRemoveRow}
      {...overrides}
    />,
  );
  return { onAddRow, onRemoveRow };
}

afterEach(() => cleanup());

describe('FinishWipEditor', () => {
  it('renders one row per real prod_detail component', () => {
    setup();
    const rows = screen.getAllByTestId('finish-wip-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('PR8801')).toBeTruthy();
    expect(screen.getByText('PR8802')).toBeTruthy();
  });

  it('auto-derived RM/intermediate code cell is read-only', () => {
    setup();
    const autoCells = screen.getAllByTestId('finish-wip-auto-code') as HTMLInputElement[];
    expect(autoCells[0].value).toBe('RM8801');
    expect(autoCells[0].readOnly).toBe(true);
    // green styling (parity with Core "auto" field)
    expect(autoCells[0].className).toContain('bg-green-50');
  });

  it('enables add + remove when multi-component', async () => {
    const { onAddRow, onRemoveRow } = setup();
    expect(screen.getByTestId('finish-wip-add')).toBeTruthy();
    expect(screen.getAllByTestId('finish-wip-remove')).toHaveLength(2);

    fireEvent.change(screen.getByTestId('finish-wip-new-code'), { target: { value: 'PR8803' } });
    fireEvent.click(screen.getByTestId('finish-wip-add'));
    await waitFor(() => expect(onAddRow).toHaveBeenCalledWith({ productCode: 'FA1234', intermediateCode: 'PR8803' }));

    fireEvent.click(screen.getAllByTestId('finish-wip-remove')[0]);
    await waitFor(() => expect(onRemoveRow).toHaveBeenCalled());
  });

  it('single-component shows exactly one locked row, no add/remove', () => {
    setup({ isMultiComponent: false });
    expect(screen.getAllByTestId('finish-wip-row')).toHaveLength(1);
    expect(screen.queryByTestId('finish-wip-add')).toBeNull();
    expect(screen.queryByTestId('finish-wip-remove')).toBeNull();
    expect(screen.getByTestId('finish-wip-single-hint')).toBeTruthy();
  });

  it('renders the empty state when there are no rows', () => {
    setup({ rows: [] });
    expect(screen.getByText(labels.empty)).toBeTruthy();
  });

  it.each([
    ['loading', labels.loading],
    ['error', labels.error],
    ['permission_denied', labels.forbidden],
  ] as const)('renders the %s state notice', (state, text) => {
    setup({ state });
    expect(screen.getByText(text)).toBeTruthy();
  });
});
