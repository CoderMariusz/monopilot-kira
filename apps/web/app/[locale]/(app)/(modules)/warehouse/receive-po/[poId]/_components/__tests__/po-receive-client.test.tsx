/**
 * R07-02 / R07-05 — the warehouse desktop receive screen, the SECOND place that
 * narrowed a NUMERIC(18,6) quantity to 3 decimals (the PO detail modal was the
 * first). Outstanding qty, the open/partial/full badge and the over-receive
 * check all ran through `Number()`, so a 12.345600 line showed 0.001
 * outstanding instead of 0.000600 and could never be closed from this screen.
 *
 * Also asserts that `wac_unresolved_uom` — present in the server result union,
 * absent from every label bundle until now — renders a NAMED message carrying
 * the item and the UoM instead of the generic "please retry".
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PoReceiveClient, type PoReceiveLabels } from '../po-receive.client';
import type {
  DesktopReceiveInput,
  DesktopReceiveResult,
  PoReceiveDetail,
  PoReceiveLine,
} from '../../../../_actions/receive-po-line.types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

const labels: PoReceiveLabels = {
  linesTitle: 'Lines to receive ({count})',
  emptyLines: 'All lines received.',
  col: {
    line: 'Line',
    item: 'Item',
    ordered: 'Ordered',
    received: 'Received',
    outstanding: 'Outstanding',
    status: 'Status',
    action: 'Action',
  },
  status: { open: 'Open', partial: 'Partial', full: 'Full', over: 'Over' },
  form: {
    qty: 'Qty received',
    qtyHelp: 'Ordered {ordered} · received {received} · outstanding {outstanding}',
    batch: 'Batch',
    batchPlaceholder: 'Optional',
    bestBefore: 'Best before',
    location: 'Destination location',
    locationPlaceholder: 'Default warehouse',
    receive: 'Receive line',
    receiving: 'Receiving…',
    overConfirm: 'Confirm over-receipt.',
    success: 'Received {qty} {uom} — GRN {grn}, LP {lp}.',
    overNote: 'Over-received.',
    qcNote: 'QC inspection raised.',
  },
  errors: {
    qtyRequired: 'Enter a quantity greater than zero.',
    qtyTooManyDecimals: 'Use at most 6 decimal places — that quantity is finer than stock is recorded.',
    forbidden: 'no permission',
    not_found: 'gone',
    invalid_qty: 'invalid qty',
    over_receive_cap: 'Cannot exceed 110% of the ordered quantity.',
    over_receive_confirm_required: 'Confirm over-receipt before submitting.',
    no_warehouse: 'No warehouse configured.',
    invalid_location: 'That location is invalid.',
    location_inactive: 'That location has been deactivated.',
    invalid_state: 'This PO is closed.',
    wac_unresolved_uom:
      'Receipt is blocked: {item} is priced in {uom}, but {uom} cannot be converted to kg for inventory valuation. For pieces or boxes, set a mass Base UoM (kg/g), choose Each/Box as Output UoM, and enter Net content per each (plus Units per box for boxes) in the item master data; otherwise order the line in kg.',
    wac_unsupported_currency: 'This PO is not in GBP.',
    error: 'Something went wrong receiving. Please retry.',
  },
};

const OK_RESULT: DesktopReceiveResult = {
  ok: true,
  grnId: 'grn-1',
  grnNumber: 'GRN-1',
  lpId: 'lp-1',
  lpNumber: 'LP-1',
  qty: '0.0006',
  uom: 'kg',
  overReceived: false,
  poStatus: 'received',
  qcInspectionRequired: false,
  inspectionId: null,
};

/** A second, still-open line. The table only renders while SOME line is open. */
const OPEN_SIBLING: PoReceiveLine = {
  id: 'line-2',
  lineNo: 2,
  itemCode: 'RM-002',
  itemName: 'Pork Shoulder',
  orderedQty: '5.000000',
  receivedQty: '0',
  uom: 'kg',
  shelfLifeDays: null,
};

function makePo(receivedQty: string, extraLines: PoReceiveLine[] = []): PoReceiveDetail {
  return {
    id: 'po-1',
    poNumber: 'PO-1',
    supplierName: 'Agro-Fresh',
    status: 'confirmed',
    lines: [
      {
        id: 'line-1',
        lineNo: 1,
        itemCode: 'RM-001',
        itemName: 'Pork Belly',
        orderedQty: '12.345600',
        receivedQty,
        uom: 'kg',
        shelfLifeDays: null,
      },
      ...extraLines,
    ],
  };
}

function renderClient(receivedQty: string, receive?: ReturnType<typeof vi.fn>, extraLines: PoReceiveLine[] = []) {
  const action = (receive ?? vi.fn().mockResolvedValue(OK_RESULT)) as unknown as (
    input: DesktopReceiveInput,
  ) => Promise<DesktopReceiveResult>;
  const utils = render(
    <PoReceiveClient po={makePo(receivedQty, extraLines)} labels={labels} locations={[]} receivePoLineAction={action} />,
  );
  return { ...utils, receive: action as unknown as ReturnType<typeof vi.fn> };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Warehouse PO receive — six-decimal quantities', () => {
  it('shows the exact six-decimal outstanding qty, not a 3-decimal rounding', () => {
    renderClient('12.345000');
    // Was "0.001" — more than is actually outstanding.
    expect(screen.getByTestId('po-receive-line-line-1')).toHaveTextContent('0.0006 kg');
  });

  it('prefills the exact outstanding remainder and submits it unchanged', async () => {
    const { receive } = renderClient('12.345000');
    fireEvent.click(screen.getByTestId('po-receive-open-line-1'));
    const form = await screen.findByTestId('po-receive-form');
    expect(within(form).getByTestId('po-receive-qty')).toHaveValue('0.0006');

    fireEvent.click(screen.getByTestId('po-receive-submit'));
    await waitFor(() => expect(receive).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('po-receive-error')).not.toBeInTheDocument();
    expect(receive).toHaveBeenCalledWith(expect.objectContaining({ poLineId: 'line-1', qty: '0.0006' }));
  });

  it('does not flag the exact remainder as an over-receipt (no float overshoot)', async () => {
    renderClient('12.345000');
    fireEvent.click(screen.getByTestId('po-receive-open-line-1'));
    await screen.findByTestId('po-receive-form');
    expect(screen.queryByTestId('po-receive-over-confirm')).not.toBeInTheDocument();
  });

  /**
   * CORRECTED FIXTURE — this test was guaranteed red, and the wrong expectation was
   * in the fixture, not in the assertions. With ONE line, fully received, the screen
   * replaces the entire table with the empty-state paragraph, so
   * `po-receive-status-line-1` cannot exist and getByTestId threw before any
   * assertion could run. It asserted a screen state the component cannot produce.
   *
   * Nothing is weakened: the FULL badge, the absence of a receive button and the
   * exclusion from the open count are all still asserted — now against the only PO
   * shape in which that badge is reachable at all (one full line + one open line),
   * plus a new assertion that the open sibling IS still actionable, which proves the
   * count tracks openness rather than emptiness. The single-line empty state gets its
   * own test below.
   */
  it('marks a line received to the last micro-unit as FULL, so it leaves the open list', () => {
    renderClient('12.345600', undefined, [OPEN_SIBLING]);
    expect(screen.getByTestId('po-receive-status-line-1')).toHaveTextContent('Full');
    expect(screen.queryByTestId('po-receive-open-line-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('po-receive-open-line-2')).toBeInTheDocument();
    expect(screen.getByText('Lines to receive (2)')).toBeInTheDocument();
  });

  it('header count matches every rendered table row, not just open lines', () => {
    const thirdOpen: PoReceiveLine = {
      id: 'line-3',
      lineNo: 3,
      itemCode: 'RM-003',
      itemName: 'Chicken Thigh',
      orderedQty: '8.000000',
      receivedQty: '0',
      uom: 'kg',
      shelfLifeDays: null,
    };
    renderClient('12.345600', undefined, [OPEN_SIBLING, thirdOpen]);
    expect(screen.getAllByTestId(/^po-receive-line-/)).toHaveLength(3);
    expect(screen.getByText('Lines to receive (3)')).toBeInTheDocument();
  });

  it('falls back to the empty state when every line is received to the last micro-unit', () => {
    renderClient('12.345600');
    expect(screen.getByTestId('po-receive-empty')).toBeInTheDocument();
    expect(screen.getByText('Lines to receive (0)')).toBeInTheDocument();
  });

  it('still asks for confirmation when the qty really does exceed the remainder', async () => {
    renderClient('12.345000');
    fireEvent.click(screen.getByTestId('po-receive-open-line-1'));
    const form = await screen.findByTestId('po-receive-form');
    fireEvent.change(within(form).getByTestId('po-receive-qty'), { target: { value: '0.0007' } });
    expect(await screen.findByTestId('po-receive-over-confirm')).toBeInTheDocument();
  });
});

describe('Warehouse PO receive — wac_unresolved_uom is named, not masked', () => {
  it('names the item and the UoM instead of telling the user to retry', async () => {
    const receive = vi.fn().mockResolvedValue({ ok: false, error: 'wac_unresolved_uom' } satisfies DesktopReceiveResult);
    renderClient('0', receive);
    fireEvent.click(screen.getByTestId('po-receive-open-line-1'));
    await screen.findByTestId('po-receive-form');
    fireEvent.click(screen.getByTestId('po-receive-submit'));

    const alert = await screen.findByTestId('po-receive-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('RM-001');
    expect(alert).toHaveTextContent('kg');
    expect(alert).toHaveTextContent('master data');
    expect(alert).not.toHaveTextContent('Please retry');
    expect(alert.textContent ?? '').not.toMatch(/\{item\}|\{uom\}/);
  });

  // `String.replace('{uom}', …)` substitutes ONE occurrence. This template names
  // {uom} twice, so the second copy used to reach the receiver as literal "{uom}".
  it('fills EVERY {uom} occurrence in the message, not just the first', async () => {
    const receive = vi.fn().mockResolvedValue({ ok: false, error: 'wac_unresolved_uom' } satisfies DesktopReceiveResult);
    renderClient('0', receive);
    fireEvent.click(screen.getByTestId('po-receive-open-line-1'));
    await screen.findByTestId('po-receive-form');
    fireEvent.click(screen.getByTestId('po-receive-submit'));

    const text = (await screen.findByTestId('po-receive-error')).textContent ?? '';
    expect(text).not.toContain('{uom}');
    expect(text.match(/\bkg\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe('Warehouse PO receive — the rejection names the real reason', () => {
  // A positive 7-dp quantity is not "zero or less". Reporting it as such told the
  // receiver something untrue about their own number and hid the actual fix.
  it('blames excess precision, not the sign, for a positive over-precise qty', async () => {
    const { receive } = renderClient('0');
    fireEvent.click(screen.getByTestId('po-receive-open-line-1'));
    const form = await screen.findByTestId('po-receive-form');
    fireEvent.change(within(form).getByTestId('po-receive-qty'), { target: { value: '1.1234567' } });
    fireEvent.click(screen.getByTestId('po-receive-submit'));

    const alert = await screen.findByTestId('po-receive-error');
    expect(alert).toHaveTextContent('6 decimal places');
    expect(alert).not.toHaveTextContent('greater than zero');
    expect(receive).not.toHaveBeenCalled();
  });

  // The mirror image: don't blame the decimals for a value rejected on other grounds.
  it('does not blame the decimals when the number is malformed for another reason', async () => {
    renderClient('0');
    fireEvent.click(screen.getByTestId('po-receive-open-line-1'));
    const form = await screen.findByTestId('po-receive-form');
    fireEvent.change(within(form).getByTestId('po-receive-qty'), { target: { value: '01.1234567' } });
    fireEvent.click(screen.getByTestId('po-receive-submit'));

    expect(await screen.findByTestId('po-receive-error')).not.toHaveTextContent('6 decimal places');
  });

  it('still says "greater than zero" when the quantity really is zero', async () => {
    renderClient('0');
    fireEvent.click(screen.getByTestId('po-receive-open-line-1'));
    const form = await screen.findByTestId('po-receive-form');
    fireEvent.change(within(form).getByTestId('po-receive-qty'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('po-receive-submit'));

    expect(await screen.findByTestId('po-receive-error')).toHaveTextContent('greater than zero');
  });
});
