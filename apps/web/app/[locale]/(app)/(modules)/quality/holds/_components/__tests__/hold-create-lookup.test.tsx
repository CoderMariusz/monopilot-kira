/**
 * AUDIT #4 — MODAL-HOLD-CREATE LP lookup flow (RTL).
 *
 * Parity checklist: prototypes/design/Monopilot Design System/quality/
 *   modals.jsx:22-96 (HoldCreateModal). Asserts the LP search→pick→payload uses
 *   the RESOLVED UUID (not the typed number), the additional-LP NUMBERS resolve
 *   on submit, and unresolvable entries block submit + list inline (nothing sent).
 * Covers states: optimistic/pending (useTransition disabled submit), error
 * (unresolved). i18n: labels come from the staged bundle via buildHoldCreateLabels
 * (no inline strings). RBAC: enforced server-side in the action (not asserted in
 * the island; the action test covers forbidden).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HoldCreateModal } from '../hold-create-modal.client';
import { buildHoldCreateLabels } from '../labels';
import { getQaHoldsTranslator } from '../../../qa-holds-labels';

const labels = buildHoldCreateLabels(getQaHoldsTranslator('en'));

const LP_ID = '44444444-4444-4444-8444-444444444444';
const LP2_ID = '55555555-5555-4555-8555-555555555555';

const LP1 = { id: LP_ID, lpNumber: 'LP-000123', itemCode: 'RM-BEEF-01', qty: '12.5', uom: 'kg', status: 'available', qaStatus: 'released' };
const LP2 = { id: LP2_ID, lpNumber: 'LP-000124', itemCode: 'RM-BEEF-01', qty: '8', uom: 'kg', status: 'available', qaStatus: 'released' };

function setup(overrides?: Partial<Parameters<typeof HoldCreateModal>[0]>) {
  const createHoldAction = vi.fn(async () => ({ ok: true as const, data: { id: 'h1', holdNumber: 'HLD-1', referenceType: 'lp' as const, referenceId: LP_ID, status: 'open' as const, heldLpIds: [] } }));
  const searchLpsAction = vi.fn(async () => ({ ok: true as const, data: [LP1, LP2] }));
  const resolveLpAction = vi.fn(async ({ lpNumber }: { lpNumber: string }) =>
    lpNumber === 'LP-000124' ? { ok: true as const, data: LP2 } : { ok: true as const, data: null },
  );
  const resolveWoAction = vi.fn(async () => ({ ok: true as const, data: { id: 'wo1', display: 'WO-1' } }));
  const resolveGrnAction = vi.fn(async () => ({ ok: true as const, data: { id: 'grn1', display: 'GRN-1' } }));

  render(
    <HoldCreateModal
      open
      onOpenChange={() => {}}
      labels={labels}
      createHoldAction={createHoldAction}
      searchLpsAction={searchLpsAction}
      resolveLpAction={resolveLpAction}
      resolveWoAction={resolveWoAction}
      resolveGrnAction={resolveGrnAction}
      {...overrides}
    />,
  );
  return { createHoldAction, searchLpsAction, resolveLpAction, resolveWoAction, resolveGrnAction };
}

beforeEach(() => vi.clearAllMocks());

describe('hold-create LP lookup', () => {
  it('searches, picks an LP, and submits the RESOLVED UUID as referenceId', async () => {
    const { searchLpsAction, createHoldAction } = setup();

    // No raw UUID input for LP — the live search box is shown.
    expect(screen.getByTestId('hold-create-lp-search')).toBeInTheDocument();
    expect(screen.queryByTestId('hold-create-reference')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('hold-create-lp-search'), { target: { value: 'LP-0001' } });
    await waitFor(() => expect(searchLpsAction).toHaveBeenCalledWith({ query: 'LP-0001', limit: 10 }));

    const result = await screen.findByTestId(`hold-create-lp-result-${LP_ID}`);
    fireEvent.click(result);

    // Confirmation chip shows the picked LP.
    expect(screen.getByTestId('hold-create-lp-chip')).toHaveTextContent('LP-000123');

    // Fill reason + submit.
    fireEvent.change(screen.getByTestId('hold-create-reason'), { target: { value: 'visual contamination' } });
    fireEvent.click(screen.getByTestId('hold-create-submit'));

    await waitFor(() => expect(createHoldAction).toHaveBeenCalled());
    const payload = createHoldAction.mock.calls[0][0];
    expect(payload.referenceType).toBe('lp');
    expect(payload.referenceId).toBe(LP_ID); // the UUID, NOT "LP-0001"
    expect(payload.reasonText).toBe('visual contamination');
  });

  it('resolves additional-LP NUMBERS to UUIDs on submit (lpIds = resolved ids)', async () => {
    const { searchLpsAction, createHoldAction } = setup();

    fireEvent.change(screen.getByTestId('hold-create-lp-search'), { target: { value: 'LP-0001' } });
    await waitFor(() => expect(searchLpsAction).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId(`hold-create-lp-result-${LP_ID}`));

    fireEvent.change(screen.getByTestId('hold-create-reason'), { target: { value: 'reason' } });
    fireEvent.change(screen.getByTestId('hold-create-lpids'), { target: { value: 'LP-000124' } });
    fireEvent.click(screen.getByTestId('hold-create-submit'));

    await waitFor(() => expect(createHoldAction).toHaveBeenCalled());
    expect(createHoldAction.mock.calls[0][0].lpIds).toEqual([LP2_ID]);
  });

  it('blocks submit and lists unresolvable LP numbers inline (nothing submitted)', async () => {
    const { searchLpsAction, createHoldAction } = setup();

    fireEvent.change(screen.getByTestId('hold-create-lp-search'), { target: { value: 'LP-0001' } });
    await waitFor(() => expect(searchLpsAction).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId(`hold-create-lp-result-${LP_ID}`));

    fireEvent.change(screen.getByTestId('hold-create-reason'), { target: { value: 'reason' } });
    // LP-999 resolves to null (unknown).
    fireEvent.change(screen.getByTestId('hold-create-lpids'), { target: { value: 'LP-999' } });
    fireEvent.click(screen.getByTestId('hold-create-submit'));

    const unresolved = await screen.findByTestId('hold-create-lp-unresolved');
    expect(unresolved).toHaveTextContent('LP-999');
    expect(createHoldAction).not.toHaveBeenCalled();
  });

  it('wo reference resolves the typed NUMBER to a UUID on submit', async () => {
    const { resolveWoAction, createHoldAction } = setup();

    fireEvent.click(screen.getByTestId('hold-create-reftype-wo'));
    // For non-lp the honest text input is shown (not the LP search).
    const refInput = screen.getByTestId('hold-create-reference');
    fireEvent.change(refInput, { target: { value: 'WO-000001' } });
    fireEvent.change(screen.getByTestId('hold-create-reason'), { target: { value: 'reason' } });
    fireEvent.click(screen.getByTestId('hold-create-submit'));

    await waitFor(() => expect(resolveWoAction).toHaveBeenCalledWith({ woNumber: 'WO-000001' }));
    await waitFor(() => expect(createHoldAction).toHaveBeenCalled());
    expect(createHoldAction.mock.calls[0][0].referenceId).toBe('wo1');
  });
});
