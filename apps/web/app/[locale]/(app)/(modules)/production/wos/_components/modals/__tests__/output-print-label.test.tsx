/**
 * E1 — Register-output SUCCESS state + [Print FG label] (desktop output modal).
 *
 * After a successful Register-output the modal switches to a success view that
 * offers a [Print FG label] for the CREATED finished-goods LP. The button:
 *   - renders enabled when the caller holds settings.org.update (canPrintFgLabel);
 *   - calls printLabel({ entityType:'lp', entityId:<output lp_id> });
 *   - shows the queued/sent result + a download link from result_url;
 *   - is disabled with a permission tooltip when the caller lacks the permission.
 *
 * Tested against a MOCKED fetch (no live route) — the outputs route returns
 * { ok:true, data:{ lp_id, lp_number } }, threaded through use-wo-action → modal.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { WoActionsProvider, WoActionTrigger } from '../wo-actions';
import type { OutputPrintLabelInput, OutputPrintLabelResult, OutputUomContext } from '../action-modals';
import type { WoActionPermissions, WoModalLabels } from '../types';

const ALL_PERMS: WoActionPermissions = {
  release: true,
  start: true,
  pause: true,
  resume: true,
  cancel: true,
  complete: true,
  close: true,
  outputWrite: true,
  wasteWrite: true,
};

const LABELS: WoModalLabels = {
  cancel: 'Cancel',
  confirm: 'Confirm',
  submitting: 'Submitting…',
  errorFallback: 'The action could not be completed.',
  errors: { invalid_input: 'Check the values you entered.' },
  release: { title: 'Release', subtitle: '.' },
  start: { title: 'Start', subtitle: '.', line: 'Line', shift: 'Shift', optional: 'optional' },
  pause: { title: 'Pause', subtitle: '.', reason: 'Reason', reasonPlaceholder: 'Select…', line: 'Line', linePlaceholder: 'Select a line…', noLines: 'No lines.', shift: 'Shift', shiftPlaceholder: 'Select a shift…', notes: 'Notes', noCategories: 'None' },
  resume: { title: 'Resume', subtitle: '.', duration: 'Duration', durationHint: 'Optional' },
  cancelWo: { title: 'Cancel', subtitle: '.', reasonCode: 'Reason', notes: 'Notes' },
  complete: { title: 'Complete', subtitle: '.', override: 'Override', overrideHint: '.' },
  close: { title: 'Close', subtitle: '.', password: 'Password', reason: 'Reason', legal: '.' },
  output: {
    title: 'Register output',
    subtitle: 'Record output.',
    type: 'Output type',
    types: { primary: 'Primary', co_product: 'Co-product', by_product: 'By-product' },
    product: 'Product',
    qty: 'Quantity',
    batch: 'Batch number',
    batchHint: 'Auto when blank.',
    qtyUom: { base: 'kg', each: 'each', box: 'box' },
    actualWeight: 'Actual weight (kg)',
    actualWeightHint: 'Leave empty to use the nominal conversion.',
    conversionPreview: '{qty} {unit} = {kg} {base}',
    print: {
      successTitle: 'Output registered',
      successBody: 'The finished-goods license plate was created.',
      lpLine: 'FG label — {lp}',
      action: 'Print FG label',
      printing: 'Printing…',
      queued: 'Print job queued for the printer.',
      sent: 'Label sent — download the rendered output below.',
      download: 'Download label',
      error: 'Label could not be printed. Try again or contact an administrator.',
      forbidden: 'Insufficient permissions: settings.org.update is required to print labels.',
      close: 'Done',
    },
  },
  waste: { title: 'Log waste', subtitle: '.', category: 'Category', categoryPlaceholder: 'Select…', qty: 'Quantity (kg)', shift: 'Shift', shiftPlaceholder: 'Select a shift…', reasonCode: 'Reason', notes: 'Notes', noCategories: 'None' },
  shifts: { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' },
};

const WO_ID = '11111111-1111-1111-1111-111111111111';
const PRODUCT_ID = '33333333-3333-3333-3333-333333333333';
const OUTPUT_LP_ID = '44444444-4444-4444-4444-444444444444';

const BASE_UOM: OutputUomContext = {
  productCode: 'FG-001',
  productName: 'Finished good',
  outputUom: 'base',
  uomBase: 'kg',
  netQtyPerEach: null,
  eachPerBox: null,
  weightMode: 'fixed',
};

function Harness({
  printLabelAction,
  canPrintFgLabel,
}: {
  printLabelAction?: (input: OutputPrintLabelInput) => Promise<OutputPrintLabelResult>;
  canPrintFgLabel: boolean;
}) {
  return (
    <WoActionsProvider
      locale="en"
      woId={WO_ID}
      status="in_progress"
      workOrderStatus="RELEASED"
      permissions={ALL_PERMS}
      labels={LABELS}
      currentUserId="22222222-2222-2222-2222-222222222222"
      downtimeCategories={[]}
      wasteCategories={[]}
      shifts={[]}
      lines={[]}
      defaultLineId={null}
      defaultProductId={PRODUCT_ID}
      outputUom={BASE_UOM}
      printFgLabelAction={printLabelAction}
      canPrintFgLabel={canPrintFgLabel}
      yieldGateGreen
    >
      <WoActionTrigger kind="output" label="Register output" testid="wo-action-output" />
    </WoActionsProvider>
  );
}

/** The outputs route returns { ok:true, data:{ lp_id, lp_number } }. */
function mockFetchWithLp() {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({ ok: true, data: { output_id: 'o1', lp_id: OUTPUT_LP_ID, lp_number: 'LP-FG-001' } }),
        { status: 200 },
      ),
  );
}

async function submitOutput(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('wo-action-output'));
  await user.type(screen.getByTestId('wo-output-qty'), '12');
  await user.click(screen.getByTestId('wo-output-confirm'));
}

beforeEach(() => {
  refresh.mockClear();
  if (!('randomUUID' in crypto)) {
    // @ts-expect-error augment for test
    crypto.randomUUID = () => '99999999-9999-4999-8999-999999999999';
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Register output — [Print FG label] success state (E1)', () => {
  it('shows the success state + an enabled [Print FG label] referencing the FG LP code (no raw uuid)', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetchWithLp());
    const printSpy = vi.fn(async () => ({ status: 'sent', result_url: null }) as OutputPrintLabelResult);
    render(<Harness printLabelAction={printSpy} canPrintFgLabel />);

    await submitOutput(user);

    const success = await screen.findByTestId('wo-output-success');
    expect(success).toBeInTheDocument();
    // The LP is shown by its CODE, never the raw uuid.
    const lpLine = screen.getByTestId('wo-output-fg-lp');
    expect(lpLine).toHaveTextContent('FG label — LP-FG-001');
    expect(lpLine).not.toHaveTextContent(OUTPUT_LP_ID);

    const printBtn = screen.getByTestId('wo-output-print-fg');
    expect(printBtn).toHaveTextContent('Print FG label');
    expect(printBtn).toBeEnabled();
  });

  it('calls printLabel with entityType "lp" + the created output LP id', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetchWithLp());
    const printSpy = vi.fn(async () => ({ status: 'queued', result_url: null }) as OutputPrintLabelResult);
    render(<Harness printLabelAction={printSpy} canPrintFgLabel />);

    await submitOutput(user);
    await user.click(await screen.findByTestId('wo-output-print-fg'));

    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    expect(printSpy).toHaveBeenCalledWith({ entityType: 'lp', entityId: OUTPUT_LP_ID });
  });

  it('shows the sent result + download link from result_url', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetchWithLp());
    const printSpy = vi.fn(async () => ({ status: 'sent', result_url: 'data:text/plain,fg' }) as OutputPrintLabelResult);
    render(<Harness printLabelAction={printSpy} canPrintFgLabel />);

    await submitOutput(user);
    await user.click(await screen.findByTestId('wo-output-print-fg'));

    const result = await screen.findByTestId('wo-output-print-result');
    expect(result).toHaveAttribute('data-print-status', 'sent');
    expect(screen.getByTestId('wo-output-print-download')).toHaveAttribute('href', 'data:text/plain,fg');
  });

  it('disables the FG-label button with a permission tooltip when settings.org.update is absent', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetchWithLp());
    const printSpy = vi.fn();
    render(<Harness printLabelAction={printSpy as never} canPrintFgLabel={false} />);

    await submitOutput(user);

    const printBtn = await screen.findByTestId('wo-output-print-fg');
    expect(printBtn).toBeDisabled();
    expect(printBtn).toHaveAttribute(
      'title',
      'Insufficient permissions: settings.org.update is required to print labels.',
    );
    expect(printSpy).not.toHaveBeenCalled();
  });
});
