/**
 * P0-UOM lane — Register-output modal: output-unit quantity + optional actual
 * weight + read-only product + verbatim uom_conversion_unavailable surface.
 *
 * Product decision: production registers output in the WO's OUTPUT unit
 * (box/each/base) with an OPTIONAL actual weighed kg; nominal conversion
 * otherwise. The modal:
 *   - shows the product as READ-ONLY code + name (not an editable UUID textbox);
 *   - labels the qty field in the output unit ("Quantity (box)") + a live preview;
 *   - posts { qtyUnits, unitsUom, actualWeightKg } for each/box (legacy qty_kg for
 *     base), keeping the product_id in the payload;
 *   - maps the 'uom_conversion_unavailable' error code verbatim like the others.
 *
 * Tested against a MOCKED fetch (no live route), next/navigation stubbed.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { WoActionsProvider, WoActionTrigger } from '../wo-actions';
import type { OutputUomContext } from '../action-modals';
import type { WoActionPermissions, WoModalLabels } from '../types';

const ALL_PERMS: WoActionPermissions = {
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
  errors: {
    invalid_state_transition: 'Not valid for the current state.',
    uom_conversion_unavailable: 'Missing pack data — set it in Technical.',
  },
  start: { title: 'Start', subtitle: '.', line: 'Line', shift: 'Shift', optional: 'optional' },
  pause: { title: 'Pause', subtitle: '.', reason: 'Reason', reasonPlaceholder: 'Select…', line: 'Line', shift: 'Shift', notes: 'Notes', noCategories: 'None' },
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
  },
  waste: { title: 'Log waste', subtitle: '.', category: 'Category', categoryPlaceholder: 'Select…', qty: 'Quantity (kg)', shift: 'Shift', reasonCode: 'Reason', notes: 'Notes', noCategories: 'None' },
};

const WO_ID = '11111111-1111-1111-1111-111111111111';
const PRODUCT_ID = '33333333-3333-3333-3333-333333333333';

// A box product: 1 box = 50 each, 1 each = 6 kg ⇒ 1 box = 300 kg.
const BOX_UOM: OutputUomContext = {
  productCode: 'FG-001',
  productName: 'Kiełbasa śląska 450g',
  outputUom: 'box',
  uomBase: 'kg',
  netQtyPerEach: 6,
  eachPerBox: 50,
  weightMode: 'fixed',
};

function Harness({ uom }: { uom: OutputUomContext | null }) {
  return (
    <WoActionsProvider
      locale="en"
      woId={WO_ID}
      status="in_progress"
      permissions={ALL_PERMS}
      labels={LABELS}
      currentUserId="22222222-2222-2222-2222-222222222222"
      downtimeCategories={[]}
      wasteCategories={[]}
      defaultLineId={null}
      defaultProductId={PRODUCT_ID}
      outputUom={uom}
    >
      <WoActionTrigger kind="output" label="Register output" testid="wo-action-output" />
    </WoActionsProvider>
  );
}

function mockFetchOk(captured: { url?: string; body?: any }) {
  return vi.fn(async (url: string, init: RequestInit) => {
    captured.url = url;
    captured.body = JSON.parse(init.body as string);
    return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
  });
}

function mockFetchError(code: string, status = 422) {
  return vi.fn(async () => new Response(JSON.stringify({ error: code }), { status }));
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

describe('Register output — read-only product + output-unit quantity', () => {
  it('shows the product as a read-only code + name (no editable UUID textbox)', async () => {
    const user = userEvent.setup();
    render(<Harness uom={BOX_UOM} />);
    await user.click(screen.getByTestId('wo-action-output'));

    const product = screen.getByTestId('wo-output-product');
    expect(product).toHaveTextContent('FG-001');
    expect(product).toHaveTextContent('Kiełbasa śląska 450g');
    // It is NOT an editable input.
    expect(product.tagName).not.toBe('INPUT');
  });

  it('labels the quantity in the output unit (box) and renders the live conversion', async () => {
    const user = userEvent.setup();
    render(<Harness uom={BOX_UOM} />);
    await user.click(screen.getByTestId('wo-action-output'));

    expect(screen.getByText('Quantity (box)')).toBeInTheDocument();
    await user.type(screen.getByTestId('wo-output-qty'), '2');
    await waitFor(() =>
      expect(screen.getByTestId('wo-output-conversion')).toHaveTextContent('2 box = 600.000 kg'),
    );
  });

  it('exposes an always-visible optional actual weight input', async () => {
    const user = userEvent.setup();
    render(<Harness uom={BOX_UOM} />);
    await user.click(screen.getByTestId('wo-action-output'));
    expect(screen.getByText('Actual weight (kg)')).toBeInTheDocument();
    expect(screen.getByTestId('wo-output-actual-weight')).toBeInTheDocument();
  });
});

describe('Register output — payload', () => {
  it('posts { qtyUnits, unitsUom, actualWeightKg, product_id } for a box product', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    const user = userEvent.setup();
    render(<Harness uom={BOX_UOM} />);

    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '2');
    await user.type(screen.getByTestId('wo-output-actual-weight'), '598.4');
    await user.click(screen.getByTestId('wo-output-confirm'));

    await waitFor(() => expect(captured.url).toBeDefined());
    expect(captured.url).toContain('/outputs');
    expect(captured.body).toMatchObject({
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qtyUnits: 2,
      unitsUom: 'box',
      actualWeightKg: 598.4,
    });
    expect(captured.body.qty_kg).toBeUndefined();
    expect(typeof captured.body.transaction_id).toBe('string');
    expect(refresh).toHaveBeenCalled();
  });

  it('omits actualWeightKg when the actual-weight field is left empty (nominal conversion)', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    const user = userEvent.setup();
    render(<Harness uom={BOX_UOM} />);

    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '3');
    await user.click(screen.getByTestId('wo-output-confirm'));

    await waitFor(() => expect(captured.body).toBeDefined());
    expect(captured.body).toMatchObject({ qtyUnits: 3, unitsUom: 'box' });
    expect(captured.body.actualWeightKg).toBeUndefined();
  });

  it('posts the legacy { qty_kg } shape for a base product', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    const user = userEvent.setup();
    render(<Harness uom={{ productCode: 'FG-9', productName: 'Bulk', outputUom: 'base', uomBase: 'kg' }} />);

    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '120.5');
    await user.click(screen.getByTestId('wo-output-confirm'));

    await waitFor(() => expect(captured.body).toBeDefined());
    expect(captured.body).toMatchObject({ qty_kg: '120.5', product_id: PRODUCT_ID });
    expect(captured.body.qtyUnits).toBeUndefined();
  });
});

describe('Register output — uom_conversion_unavailable', () => {
  it('blocks the round-trip and shows the verbatim-mapped copy when pack factors are missing', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    // box output unit but NO net_qty_per_each / each_per_box ⇒ conversion fails.
    render(
      <Harness
        uom={{ productCode: 'FG-X', productName: 'No pack', outputUom: 'box', uomBase: 'kg', netQtyPerEach: null, eachPerBox: null }}
      />,
    );

    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '2');
    await user.click(screen.getByTestId('wo-output-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('wo-output-error')).toHaveTextContent('Missing pack data — set it in Technical.'),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps a server uom_conversion_unavailable error verbatim like the other codes', async () => {
    vi.stubGlobal('fetch', mockFetchError('uom_conversion_unavailable'));
    const user = userEvent.setup();
    render(<Harness uom={BOX_UOM} />);

    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '2');
    await user.click(screen.getByTestId('wo-output-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('wo-output-error')).toHaveTextContent('Missing pack data — set it in Technical.'),
    );
  });
});
