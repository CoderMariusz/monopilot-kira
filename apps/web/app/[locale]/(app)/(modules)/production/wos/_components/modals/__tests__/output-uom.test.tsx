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
    invalid_input: 'Check the values you entered.',
    invalid_state_transition: 'Not valid for the current state.',
    uom_conversion_unavailable: 'Missing pack data — set it in Technical.',
  },
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
    catchWeight: {
      sectionTitle: 'Per-unit weights (kg)',
      sectionHint: 'Catch-weight item — enter the scale reading for each unit.',
      unitLabel: 'Unit {n}',
      sumLabel: 'Σ {total} kg',
      tooMany: 'Too many units to enter individually (max {max}). Reduce the quantity.',
      baseTextareaLabel: 'Per-unit weights (one per line, kg)',
      baseTextareaHint: 'Enter one positive weight per line.',
      invalidWeights: 'Every unit weight must be a positive number.',
    },
  },
  waste: { title: 'Log waste', subtitle: '.', category: 'Category', categoryPlaceholder: 'Select…', qty: 'Quantity (kg)', shift: 'Shift', shiftPlaceholder: 'Select a shift…', reasonCode: 'Reason', notes: 'Notes', noCategories: 'None' },
  shifts: { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' },
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

// A catch-weight EACH product: qty = number of units; each unit needs a scale read.
const CATCH_EACH_UOM: OutputUomContext = {
  productCode: 'FG-CW',
  productName: 'Schab b/k (catch-weight)',
  outputUom: 'each',
  uomBase: 'kg',
  netQtyPerEach: 2.5,
  eachPerBox: null,
  weightMode: 'catch',
};

// A catch-weight BASE product: N is unknown up front ⇒ textarea fallback.
const CATCH_BASE_UOM: OutputUomContext = {
  productCode: 'FG-CWB',
  productName: 'Karkówka luz (catch-weight)',
  outputUom: 'base',
  uomBase: 'kg',
  netQtyPerEach: null,
  eachPerBox: null,
  weightMode: 'catch',
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
      shifts={[]}
      lines={[]}
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
      qtyUnits: '2',
      unitsUom: 'box',
      actualWeightKg: '598.4',
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
    expect(captured.body).toMatchObject({ qtyUnits: '3', unitsUom: 'box' });
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

// ── B-3 catch-weight ─────────────────────────────────────────────────────────

describe('Register output — catch-weight per-unit capture', () => {
  it('renders N per-unit weight inputs driven by the qty (units) field', async () => {
    const user = userEvent.setup();
    render(<Harness uom={CATCH_EACH_UOM} />);
    await user.click(screen.getByTestId('wo-action-output'));

    // The per-unit section appears only for catch items.
    expect(screen.getByTestId('wo-output-catch-weights')).toBeInTheDocument();
    // No qty yet ⇒ no per-unit inputs.
    expect(screen.queryByTestId('wo-output-catch-weight-0')).not.toBeInTheDocument();

    await user.type(screen.getByTestId('wo-output-qty'), '3');
    await waitFor(() =>
      expect(screen.getByTestId('wo-output-catch-weight-0')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('wo-output-catch-weight-1')).toBeInTheDocument();
    expect(screen.getByTestId('wo-output-catch-weight-2')).toBeInTheDocument();
    expect(screen.queryByTestId('wo-output-catch-weight-3')).not.toBeInTheDocument();
  });

  it('shows a live Σ sum line from the entered per-unit weights', async () => {
    const user = userEvent.setup();
    render(<Harness uom={CATCH_EACH_UOM} />);
    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '2');

    await user.type(screen.getByTestId('wo-output-catch-weight-0'), '2.480');
    await user.type(screen.getByTestId('wo-output-catch-weight-1'), '2.530');

    await waitFor(() =>
      expect(screen.getByTestId('wo-output-catch-sum')).toHaveTextContent('Σ 5.010 kg'),
    );
  });

  it('posts catch_weight_kg_per_unit as an array of DECIMAL STRINGS', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    const user = userEvent.setup();
    render(<Harness uom={CATCH_EACH_UOM} />);

    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '2');
    await user.type(screen.getByTestId('wo-output-catch-weight-0'), '2.48');
    await user.type(screen.getByTestId('wo-output-catch-weight-1'), '2.53');
    await user.click(screen.getByTestId('wo-output-confirm'));

    await waitFor(() => expect(captured.body).toBeDefined());
    expect(captured.body).toMatchObject({
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qtyUnits: '2',
      unitsUom: 'each',
      catch_weight_kg_per_unit: ['2.48', '2.53'],
    });
    // Decimal STRINGS, never JS numbers.
    expect(captured.body.catch_weight_kg_per_unit.every((w: unknown) => typeof w === 'string')).toBe(true);
  });

  it('blocks submit until every per-unit weight is a positive decimal', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    render(<Harness uom={CATCH_EACH_UOM} />);

    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '2');
    await user.type(screen.getByTestId('wo-output-catch-weight-0'), '2.48');
    // second weight left blank ⇒ confirm disabled, no round-trip.
    expect(screen.getByTestId('wo-output-confirm')).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps the verbatim invalid_input (catch_weight_kg_per_unit) error inline', async () => {
    vi.stubGlobal('fetch', mockFetchError('invalid_input'));
    const user = userEvent.setup();
    render(<Harness uom={CATCH_EACH_UOM} />);

    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '1');
    await user.type(screen.getByTestId('wo-output-catch-weight-0'), '2.48');
    await user.click(screen.getByTestId('wo-output-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('wo-output-error')).toHaveTextContent('Check the values you entered.'),
    );
  });

  it('uses a textarea fallback (one weight per line) for a base-uom catch item', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    const user = userEvent.setup();
    render(<Harness uom={CATCH_BASE_UOM} />);

    await user.click(screen.getByTestId('wo-action-output'));
    // qty (kg base) still required by the legacy path.
    await user.type(screen.getByTestId('wo-output-qty'), '7.49');
    const ta = screen.getByTestId('wo-output-catch-textarea');
    expect(ta).toBeInTheDocument();
    await user.type(ta, '2.48\n2.51\n2.50');
    await waitFor(() =>
      expect(screen.getByTestId('wo-output-catch-sum')).toHaveTextContent('Σ 7.490 kg'),
    );
    await user.click(screen.getByTestId('wo-output-confirm'));

    await waitFor(() => expect(captured.body).toBeDefined());
    expect(captured.body).toMatchObject({
      qty_kg: '7.49',
      catch_weight_kg_per_unit: ['2.48', '2.51', '2.50'],
    });
  });

  it('caps the dynamic per-unit list at 50 and shows an honest message', async () => {
    const user = userEvent.setup();
    render(<Harness uom={CATCH_EACH_UOM} />);
    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '51');

    await waitFor(() =>
      expect(screen.getByTestId('wo-output-catch-toomany')).toBeInTheDocument(),
    );
    // The per-unit grid is not rendered when over the cap.
    expect(screen.queryByTestId('wo-output-catch-weight-0')).not.toBeInTheDocument();
  });

  it('does not render the catch section for a fixed-weight item', async () => {
    const user = userEvent.setup();
    render(<Harness uom={BOX_UOM} />);
    await user.click(screen.getByTestId('wo-action-output'));
    expect(screen.queryByTestId('wo-output-catch-weights')).not.toBeInTheDocument();
  });
});

// ── output-without-consumption SOFT warning ──────────────────────────────────

const NO_CONSUMPTION_WARNING = {
  message:
    'No material consumption recorded for this WO — the output will have no genealogy/traceability link. Register consumption first, or continue.',
  continueLabel: 'Continue anyway',
};
const BASE_NO_CONSUMPTION: OutputUomContext = {
  productCode: 'FG-9',
  productName: 'Bulk',
  outputUom: 'base',
  uomBase: 'kg',
  noConsumptionWarning: NO_CONSUMPTION_WARNING,
};

describe('Register output — output-without-consumption SOFT warning', () => {
  it('does NOT render the warning when the WO already has consumption', async () => {
    const user = userEvent.setup();
    render(<Harness uom={BOX_UOM} />);
    await user.click(screen.getByTestId('wo-action-output'));
    expect(screen.queryByTestId('wo-output-no-consumption-warning')).not.toBeInTheDocument();
  });

  it('shows the non-blocking warning + a [Continue anyway] affordance and gates confirm until acknowledged', async () => {
    const user = userEvent.setup();
    render(<Harness uom={BASE_NO_CONSUMPTION} />);
    await user.click(screen.getByTestId('wo-action-output'));

    const warn = screen.getByTestId('wo-output-no-consumption-warning');
    expect(warn).toHaveTextContent(NO_CONSUMPTION_WARNING.message);
    // confirm is gated (not yet acknowledged) even with a valid qty entered
    await user.type(screen.getByTestId('wo-output-qty'), '120.5');
    expect(screen.getByTestId('wo-output-confirm')).toBeDisabled();

    // acknowledging the warning enables confirm (non-blocking — submit still works)
    await user.click(screen.getByTestId('wo-output-no-consumption-continue'));
    expect(screen.getByTestId('wo-output-confirm')).not.toBeDisabled();
  });

  it('submits normally after [Continue anyway] is acknowledged', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    const user = userEvent.setup();
    render(<Harness uom={BASE_NO_CONSUMPTION} />);

    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '120.5');
    await user.click(screen.getByTestId('wo-output-no-consumption-continue'));
    await user.click(screen.getByTestId('wo-output-confirm'));

    await waitFor(() => expect(captured.body).toBeDefined());
    expect(captured.body).toMatchObject({ qty_kg: '120.5', product_id: PRODUCT_ID });
  });
});
