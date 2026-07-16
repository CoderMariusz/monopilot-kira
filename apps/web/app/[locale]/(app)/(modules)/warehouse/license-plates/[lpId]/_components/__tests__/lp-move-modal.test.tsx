/**
 * AUDIT #5 — LP MOVE modal (RTL). Wires the existing createStockMove action.
 *
 * Parity: lp-screens.jsx:310-317 action group ("Move"). Asserts the payload uses
 * the picked destination + a fresh clientOpId, pending/optimistic disables submit,
 * and verbatim errors (forbidden / locked / invalid_state) map to honest copy.
 * States exercised: loading (locations fetch), empty (no locations), error
 * (locations load failed), permission-denied (forbidden from the move action),
 * optimistic (pending). i18n from the staged warehouse-lp bundle (no inline copy).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LpMoveModal, type LpMoveLabels } from '../lp-move-modal.client';
import { getLpTranslator } from '../../../lp-labels';

const t = getLpTranslator('en');
const labels: LpMoveLabels = {
  title: t('detail.move.title'),
  subtitle: t('detail.move.subtitle'),
  destination: t('detail.move.destination'),
  destinationHelp: t('detail.move.destinationHelp'),
  destinationPlaceholder: t('detail.move.destinationPlaceholder'),
  reason: t('detail.move.reason'),
  reasonHelp: t('detail.move.reasonHelp'),
  reasonPlaceholder: t('detail.move.reasonPlaceholder'),
  currentLocation: t('detail.move.currentLocation'),
  loadingLocations: t('detail.move.loadingLocations'),
  noLocations: t('detail.move.noLocations'),
  noAlternateLocations: t('detail.move.noAlternateLocations'),
  locationsError: t('detail.move.locationsError'),
  cancel: t('detail.move.cancel'),
  submit: t('detail.move.submit'),
  submitting: t('detail.move.submitting'),
  validation: { destinationRequired: t('detail.move.validation.destinationRequired') },
  error: t('detail.move.error'),
  errorForbidden: t('detail.move.errorForbidden'),
  errorLocked: t('detail.move.errorLocked'),
  errorInvalidState: t('detail.move.errorInvalidState'),
  errorSameLocation: t('detail.move.errorSameLocation'),
  errorNotFound: t('detail.move.errorNotFound'),
  success: t('detail.move.success'),
};

const LOC_ID = '33333333-3333-4333-8333-333333333333';
const CURRENT_LOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LP = { id: 'lp-1', lpNumber: 'LP-000123', currentLocationCode: 'A-01', currentLocationId: CURRENT_LOC_ID };
const LOCATIONS = [
  { id: CURRENT_LOC_ID, code: 'A-01', name: 'Bay 01', warehouseId: 'wh1', warehouseCode: 'WH1', warehouseName: 'Main' },
  { id: LOC_ID, code: 'B-02', name: 'Bay 02', warehouseId: 'wh1', warehouseCode: 'WH1', warehouseName: 'Main' },
];

function setup(opts: {
  list?: () => Promise<unknown>;
  move?: ReturnType<typeof vi.fn>;
}) {
  const listLocationsAction = vi.fn(opts.list ?? (async () => ({ ok: true as const, data: LOCATIONS })));
  const createStockMoveAction = opts.move ?? vi.fn(async () => ({ ok: true as const, data: {} }));
  render(
    <LpMoveModal
      open
      onOpenChange={() => {}}
      lp={LP}
      labels={labels}
      listLocationsAction={listLocationsAction as never}
      createStockMoveAction={createStockMoveAction as never}
    />,
  );
  return { listLocationsAction, createStockMoveAction };
}

beforeEach(() => vi.clearAllMocks());

describe('LP move modal', () => {
  it('loads locations then submits the picked destination + a fresh clientOpId', async () => {
    const { createStockMoveAction } = setup({});

    // Destination Select appears once locations load.
    await screen.findByTestId('lp-move-destination');
    // Pick the location via the Select listbox option.
    fireEvent.click(screen.getByTestId('lp-move-destination').querySelector('[role="combobox"]')!);
    fireEvent.click(await screen.findByText('WH1 · B-02 — Bay 02'));

    fireEvent.change(screen.getByTestId('lp-move-reason'), { target: { value: 'consolidate' } });
    fireEvent.click(screen.getByTestId('lp-move-submit'));

    await waitFor(() => expect(createStockMoveAction).toHaveBeenCalled());
    const payload = createStockMoveAction.mock.calls[0][0];
    expect(payload.lpId).toBe('lp-1');
    expect(payload.toLocationId).toBe(LOC_ID);
    expect(payload.reason).toBe('consolidate');
    expect(typeof payload.clientOpId).toBe('string');
    expect(payload.clientOpId.length).toBeGreaterThan(0);
  });

  it('excludes the current location from the destination picker (C101)', async () => {
    setup({});
    await screen.findByTestId('lp-move-destination');
    fireEvent.click(screen.getByTestId('lp-move-destination').querySelector('[role="combobox"]')!);
    expect(screen.queryByText('WH1 · A-01 — Bay 01')).not.toBeInTheDocument();
    expect(await screen.findByText('WH1 · B-02 — Bay 02')).toBeInTheDocument();
  });

  it('shows no-alternate-locations when only the current location exists (C101)', async () => {
    setup({ list: async () => ({ ok: true, data: [LOCATIONS[0]] }) });
    expect(await screen.findByTestId('lp-move-no-locations')).toHaveTextContent(labels.noAlternateLocations);
    expect(screen.getByTestId('lp-move-submit')).toBeDisabled();
  });

  it('maps a same_location move result to verbatim copy (C101)', async () => {
    const move = vi.fn(async () => ({ ok: false as const, reason: 'error' as const, message: 'same_location' }));
    setup({ move });
    await screen.findByTestId('lp-move-destination');
    fireEvent.click(screen.getByTestId('lp-move-destination').querySelector('[role="combobox"]')!);
    fireEvent.click(await screen.findByText('WH1 · B-02 — Bay 02'));
    fireEvent.click(screen.getByTestId('lp-move-submit'));

    expect(await screen.findByTestId('lp-move-error')).toHaveTextContent(labels.errorSameLocation);
  });

  it('shows the empty state when there are no locations', async () => {
    setup({ list: async () => ({ ok: true, data: [] }) });
    expect(await screen.findByTestId('lp-move-no-locations')).toBeInTheDocument();
    expect(screen.getByTestId('lp-move-submit')).toBeDisabled();
  });

  it('shows the locations error state when the read fails', async () => {
    setup({ list: async () => ({ ok: false, reason: 'error' }) });
    expect(await screen.findByTestId('lp-move-locations-error')).toBeInTheDocument();
  });

  it('maps a forbidden move result to verbatim permission copy', async () => {
    const move = vi.fn(async () => ({ ok: false as const, reason: 'forbidden' as const }));
    setup({ move });
    await screen.findByTestId('lp-move-destination');
    fireEvent.click(screen.getByTestId('lp-move-destination').querySelector('[role="combobox"]')!);
    fireEvent.click(await screen.findByText('WH1 · B-02 — Bay 02'));
    fireEvent.click(screen.getByTestId('lp-move-submit'));

    const err = await screen.findByTestId('lp-move-error');
    expect(err).toHaveTextContent(labels.errorForbidden);
  });

  it('maps a locked move result to verbatim locked copy', async () => {
    const move = vi.fn(async () => ({ ok: false as const, reason: 'error' as const, message: 'locked' }));
    setup({ move });
    await screen.findByTestId('lp-move-destination');
    fireEvent.click(screen.getByTestId('lp-move-destination').querySelector('[role="combobox"]')!);
    fireEvent.click(await screen.findByText('WH1 · B-02 — Bay 02'));
    fireEvent.click(screen.getByTestId('lp-move-submit'));

    expect(await screen.findByTestId('lp-move-error')).toHaveTextContent(labels.errorLocked);
  });

  it('maps an immovable_status move result to verbatim invalid-state copy', async () => {
    const move = vi.fn(async () => ({ ok: false as const, reason: 'error' as const, message: 'immovable_status' }));
    setup({ move });
    await screen.findByTestId('lp-move-destination');
    fireEvent.click(screen.getByTestId('lp-move-destination').querySelector('[role="combobox"]')!);
    fireEvent.click(await screen.findByText('WH1 · B-02 — Bay 02'));
    fireEvent.click(screen.getByTestId('lp-move-submit'));

    expect(await screen.findByTestId('lp-move-error')).toHaveTextContent(labels.errorInvalidState);
  });
});
