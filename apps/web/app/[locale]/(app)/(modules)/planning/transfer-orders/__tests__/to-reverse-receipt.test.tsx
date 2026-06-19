/**
 * R4-CL1 — TO "reverse received line" reversibility UI: RTL parity + behaviour.
 *
 * Spec-driven off the in-repo production void/reverse-consumption correction modals
 * (no prototype reverse-receipt screen exists under
 * prototypes/design/Monopilot Design System/planning/). Asserts the parity checklist:
 *   - the affordance appears only on RECEIVED lines (those carrying a destination LP);
 *   - the modal collects a reason (no raw <select>) + a mandatory e-sign password/PIN;
 *   - the human-readable target (TO number, item code/name, LP NUMBER, qty) is shown —
 *     never a raw UUID;
 *   - RBAC: the button is disabled with a tooltip when the caller lacks
 *     warehouse.transfer.correct (server re-checks; the client never trusts itself);
 *   - typed errors map to honest copy (lp_active gets the bespoke "reserved/…/shipped"
 *     line); a successful reversal calls reverseToReceiveLine with the dest-LP id + full
 *     received qty and refreshes the route.
 *
 * The reverseToReceiveLine Server Action is OWNED by the planning lane and threaded as a
 * prop — this test mocks the seam (the action has its own DB-gated suite).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToDetailView, type ToDetailLabels, type TransferOrderDetail } from '../_components/to-detail-view';
import type { WarehouseOption } from '../_actions/to-form-data';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

const warehouses: WarehouseOption[] = [
  { id: 'wh-1', code: 'WH-A', name: 'Factory A' },
  { id: 'wh-2', code: 'WH-B', name: 'Dist Central' },
];

const errors = {
  invalid_input: 'invalid',
  forbidden: 'no permission',
  not_found: 'gone',
  already_exists: 'dup',
  invalid_state: 'no longer a draft',
  last_line: 'must keep one line',
  persistence_failed: 'save failed',
};

const labels: ToDetailLabels = {
  status: { draft: 'Draft', in_transit: 'In transit', received: 'Received', partially_received: 'Partially received', cancelled: 'Cancelled' },
  summary: { title: 'TO summary', toNumber: 'TO number', from: 'From', to: 'To', status: 'Status', scheduled: 'Scheduled', created: 'Created', updated: 'Updated', notes: 'Notes', none: '—' },
  lines: { title: 'TO lines', seq: '#', product: 'Product', qty: 'Qty', uom: 'UoM', empty: 'No lines.' },
  transitions: { title: 'Status', ship: 'Ship', receive: 'Receive', cancel: 'Cancel', confirm: 'Change {to} to {status}?', pending: 'Updating…', none: 'No actions' },
  errors,
  edit: {
    editOrder: 'Edit order',
    addLine: '+ Add line',
    editLine: 'Edit',
    deleteLine: 'Delete',
    deleteLinePrompt: 'Delete line {line}?',
    lastLineRefused: 'must keep one line',
    // The edit sub-modal labels are irrelevant for a received (non-draft) TO; the
    // edit affordances are hidden, so a stub shape is enough.
    modal: {} as ToDetailLabels['edit']['modal'],
    lineModal: {} as ToDetailLabels['edit']['lineModal'],
  },
  reverseReceipt: {
    received: 'Received',
    destLp: 'Destination pallet',
    action: 'Reverse receipt…',
    permissionTooltip: 'You need the warehouse transfer correction permission to reverse a received line.',
    notReceivableTooltip: 'Only received lines with a destination pallet can be reversed.',
    modal: {
      title: 'Reverse receipt · line {line}',
      intro: 'Reversing returns the destination pallet to the source and reopens this line.',
      summary: { toNumber: 'Transfer order', product: 'Product', destLp: 'Destination pallet', quantity: 'Quantity to reverse' },
      reasonCode: 'Reason',
      reasonPlaceholder: 'Select a reason',
      reasonOptions: { entry_error: 'Entry error', wrong_quantity: 'Wrong quantity', wrong_batch: 'Wrong batch / lot', wrong_product: 'Wrong product', other: 'Other' },
      note: 'Note',
      noteOptional: 'optional',
      notePlaceholder: 'Add context for the reversal',
      esign: { title: 'Electronic signature', meaning: 'Re-enter your account password or supervisor PIN.', password: 'Password or PIN', passwordPlaceholder: 'Account password or supervisor PIN', passwordHelp: 'Use your account password, or a supervisor PIN.' },
      cancel: 'Cancel',
      submit: 'Reverse receipt',
      submitting: 'Reversing…',
      formIncomplete: 'Pick a reason and enter your password or PIN.',
      errors: {
        forbidden: 'You do not have permission to reverse this receipt.',
        not_found: 'This received line no longer exists.',
        invalid_input: 'Check the fields and try again.',
        invalid_state: 'This transfer order is no longer in a state that allows reversing a receipt.',
        invalid_quantity: 'The reverse quantity must equal the received destination pallet quantity.',
        lp_active: "This pallet is reserved, allocated, consumed or shipped and can't be reversed.",
        esign_failed: 'Signature failed — check your password or PIN and retry.',
        persistence_failed: 'Unable to reverse this receipt.',
        generic: 'Unable to reverse this receipt.',
      },
    },
  },
};

function makeReceivedTo(over: Partial<TransferOrderDetail> = {}): TransferOrderDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    toNumber: 'TO-202606-0007',
    fromWarehouseId: 'wh-1',
    toWarehouseId: 'wh-2',
    status: 'received',
    scheduledDate: '2026-07-02',
    notes: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    lines: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        toId: '11111111-1111-4111-8111-111111111111',
        itemId: '33333333-3333-4333-8333-333333333333',
        itemCode: 'RM-001',
        itemName: 'Pork shoulder',
        qty: '50',
        uom: 'kg',
        lineNo: 1,
        receivedDestLpId: '44444444-4444-4444-8444-444444444444',
        receivedDestLpNumber: 'LP-000123',
        receivedQty: '50',
      },
      // A not-yet-received line: must NOT get a reverse affordance.
      {
        id: '55555555-5555-4555-8555-555555555555',
        toId: '11111111-1111-4111-8111-111111111111',
        itemId: '66666666-6666-4666-8666-666666666666',
        itemCode: 'RM-002',
        itemName: 'Casing',
        qty: '10',
        uom: 'm',
        lineNo: 2,
        receivedDestLpId: null,
        receivedDestLpNumber: null,
        receivedQty: null,
      },
    ],
    ...over,
  };
}

function renderDetail(opts: { canReverseReceipt?: boolean; reverse?: ReturnType<typeof vi.fn> } = {}) {
  const reverse = opts.reverse ?? vi.fn().mockResolvedValue({ ok: true, data: {} });
  const transition = vi.fn().mockResolvedValue({ ok: true, data: {} });
  const utils = render(
    <ToDetailView
      locale="en"
      transferOrder={makeReceivedTo()}
      warehouses={warehouses}
      labels={labels}
      transitionTransferOrderStatusAction={transition}
      canReverseReceipt={opts.canReverseReceipt ?? true}
      reverseToReceiveLineAction={reverse}
    />,
  );
  return { ...utils, reverse };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('R4-CL1 — TO reverse received line', () => {
  it('shows the reverse affordance only on the received line (with the destination LP code)', () => {
    renderDetail();
    // Received line 1 carries the affordance + the LP number (human-readable, not UUID).
    expect(screen.getByTestId('to-line-reverse-22222222-2222-4222-8222-222222222222')).toBeInTheDocument();
    expect(screen.getByTestId('to-line-received-22222222-2222-4222-8222-222222222222')).toHaveTextContent('LP-000123');
    // Not-yet-received line 2 must NOT carry the affordance.
    expect(screen.queryByTestId('to-line-reverse-55555555-5555-4555-8555-555555555555')).not.toBeInTheDocument();
    // No raw UUID rendered anywhere.
    expect(screen.queryByText(/44444444-4444-4444-8444-444444444444/)).not.toBeInTheDocument();
  });

  it('disables the reverse button with a permission tooltip when canReverseReceipt is false', () => {
    renderDetail({ canReverseReceipt: false });
    const btn = screen.getByTestId('to-line-reverse-22222222-2222-4222-8222-222222222222');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', labels.reverseReceipt.permissionTooltip);
  });

  it('opens the modal with the human-readable target summary and a reason + e-sign field', () => {
    renderDetail();
    fireEvent.click(screen.getByTestId('to-line-reverse-22222222-2222-4222-8222-222222222222'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Reverse receipt · line 1')).toBeInTheDocument();
    const summary = screen.getByTestId('to-reverse-summary');
    expect(summary).toHaveTextContent('TO-202606-0007');
    expect(summary).toHaveTextContent('Pork shoulder');
    expect(summary).toHaveTextContent('LP-000123');
    expect(summary).toHaveTextContent('50 kg');
    // Reason select (no raw <select>) + mandatory e-sign password field present.
    expect(screen.getByTestId('to-reverse-reason')).toBeInTheDocument();
    expect(screen.getByTestId('to-reverse-password')).toBeInTheDocument();
    // Submit is disabled until a reason + password are entered.
    expect(screen.getByTestId('to-reverse-submit')).toBeDisabled();
  });

  it('submits the reversal with the dest-LP id + full received qty and refreshes on success', async () => {
    const reverse = vi.fn().mockResolvedValue({ ok: true, data: { status: 'in_transit' } });
    renderDetail({ reverse });
    fireEvent.click(screen.getByTestId('to-line-reverse-22222222-2222-4222-8222-222222222222'));

    fireEvent.click(screen.getByLabelText('Reason'));
    fireEvent.click(await screen.findByText('Entry error'));
    fireEvent.change(screen.getByTestId('to-reverse-password'), { target: { value: 'Sup3rPIN' } });
    fireEvent.click(screen.getByTestId('to-reverse-submit'));

    await waitFor(() =>
      expect(reverse).toHaveBeenCalledWith({
        toId: '11111111-1111-4111-8111-111111111111',
        lineId: '22222222-2222-4222-8222-222222222222',
        destLpId: '44444444-4444-4444-8444-444444444444',
        quantity: '50',
        reasonCode: 'entry_error',
        note: undefined,
        signature: { password: 'Sup3rPIN' },
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('maps the lp_active typed error to the bespoke reserved/allocated/shipped copy', async () => {
    const reverse = vi.fn().mockResolvedValue({ ok: false, error: 'lp_active' });
    renderDetail({ reverse });
    fireEvent.click(screen.getByTestId('to-line-reverse-22222222-2222-4222-8222-222222222222'));

    fireEvent.click(screen.getByLabelText('Reason'));
    fireEvent.click(await screen.findByText('Wrong quantity'));
    fireEvent.change(screen.getByTestId('to-reverse-password'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('to-reverse-submit'));

    expect(await screen.findByTestId('to-reverse-error')).toHaveTextContent(
      "This pallet is reserved, allocated, consumed or shipped and can't be reversed.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
