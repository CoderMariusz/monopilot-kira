/**
 * E7 — Desktop "Register disassembly outputs" modal: RTL behaviour.
 *
 * Exercises the new disassembly execution path on <WoDetailScreen>:
 *   - the trigger renders ONLY for a disassembly WO (bomType==='disassembly')
 *     that is in an output-recordable state with a resolved action context;
 *   - a FORWARD WO never shows the trigger (the forward Register-output flow owns
 *     that path);
 *   - opening the modal lists the BOM's expected co-product outputs (server-
 *     resolved code/name + read-only allocation), each prefilled with its nominal
 *     yield, and submits { inputLpId, outputs:[{coProductItemId, qtyKg}] } to the
 *     mocked register action, refreshing on success;
 *   - a verbatim closed error (forbidden) surfaces its mapped permission copy in
 *     the modal banner (RBAC failure path);
 *   - the empty state shows when no input LP has been consumed yet.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

import { WoDetailScreen, type WoDetailLabels, type WoDetailActions } from '../wo-detail-screen';
import { REVERSE_LABELS, LABOR_TAB_LABELS } from './reverse-labels.fixture';
import type { WorkOrderDetailData } from '../../../../_actions/get-work-order-detail';
import { buildWoModalLabels } from '../../../../_actions/wo-modal-labels';

const WO_ID = '11111111-1111-1111-1111-111111111111';
const ITEM_A = 'aaaa1111-1111-4111-8111-111111111111';
const ITEM_B = 'bbbb2222-2222-4222-8222-222222222222';
const INPUT_LP = 'cccc3333-3333-4333-8333-333333333333';

const DISASSEMBLY_LABELS = {
  triggerAction: 'Register disassembly outputs',
  title: 'Register disassembly outputs',
  subtitle: 'Break the input license plate into its co-product cuts.',
  inputLp: 'Input license plate',
  inputLpPlaceholder: 'Select the input to break down',
  inputLpEmpty: 'No input has been consumed into this work order yet — record consumption of the input first.',
  outputsTitle: 'Expected outputs',
  outputsEmpty: 'This disassembly BOM has no co-product outputs configured.',
  allocation: '{pct}% allocation',
  byproduct: 'By-product',
  qty: 'Yielded quantity',
  qtyHint: 'Actual weight of this cut, in {uom}.',
  submit: 'Register outputs',
  submitting: 'Registering…',
  cancel: 'Cancel',
  formIncomplete: 'Enter a positive quantity for every output.',
  errors: {
    forbidden: 'You do not have permission to register disassembly outputs.',
    'not-disassembly': 'This work order is not a disassembly order.',
    'co-product-mismatch': 'The outputs do not match this disassembly BOM — refresh and retry.',
    'input-cost-missing': 'The input license plate has no cost.',
    'invalid-input': 'Check the fields and try again.',
    'not-found': 'This work order or its BOM no longer exists — refresh and retry.',
    'warehouse-not-configured': 'No default warehouse is configured.',
    generic: 'Unable to register disassembly outputs.',
  },
};

const LABELS = {
  status: { planned: 'Planned', in_progress: 'In progress', paused: 'Paused', completed: 'Completed', closed: 'Closed', cancelled: 'Cancelled' },
  deferredActionTitle: 'Wired later',
  changeoverGate: { title: 'Gate', body: 'Body', link: 'Link' },
  headerActions: { start: 'Start', pause: 'Pause', resume: 'Resume', waste: 'Waste', catchWeight: 'Catch-weight', complete: 'Complete', cancel: 'Cancel', close: 'Close' },
  tabs: { overview: 'Overview', consumption: 'Consumption', output: 'Output', waste: 'Waste', downtime: 'Downtime', qa: 'QA results', genealogy: 'Genealogy', labor: 'Labor', history: 'Event log' },
  overview: {
    summaryTitle: 'Work order summary', kpisTitle: 'KPIs', wo: 'WO', product: 'Product', line: 'Line', machine: 'Machine',
    planned: 'Planned qty', output: 'Output', plannedWindow: 'Planned window', actualStart: 'Actual start', elapsed: 'Elapsed',
    allergens: 'Allergens', bomVersion: 'BOM v', consumption: 'Consumption', consumptionKpi: 'Consumption', outputKpi: 'Output',
    allergenYes: 'Allergen profile present', allergenNo: 'None', elapsedMin: 'min',
  },
  consumption: {
    title: 'Component consumption', empty: 'No components recorded.', addAction: 'Scan LP',
    col: { code: 'Code', component: 'Component', planned: 'Planned', consumed: 'Consumed', remaining: 'Remaining', progress: 'Progress' },
    record: {
      trigger: 'Record consumption', rowTrigger: 'Record', title: 'Record material consumption', subtitle: 'Decrement on-hand stock.',
      material: 'Component', materialPlaceholder: 'Select a component', qty: 'Quantity', qtyHint: "Amount in the component's UoM.",
      lp: 'License plate (FEFO)', lpLoading: 'Loading…', lpEmpty: 'No LPs.', lpError: 'Unable.', lpNone: '— no LP —', lpSuggested: 'suggested',
      reasonCode: 'Reason', reasonPlaceholder: 'Required without an LP', submit: 'Record', submitting: 'Recording…', cancel: 'Cancel',
      formIncomplete: 'Complete fields.', warningOver: 'Over by {pct}%.', warningClose: 'Close',
      errors: { forbidden: 'No perm.', lp_unavailable: 'No stock.', lp_not_released: 'Not released.', lp_expired: 'Expired.', lp_locked: 'Locked.', quality_hold_active: 'Hold.', reason_required: 'Reason required.', invalid_material: 'Invalid.', invalid_qty: 'Bad qty.', generic: 'Unable.' },
    },
  },
  output: {
    title: 'Registered output', empty: 'No output.', addAction: 'Register output',
    col: { type: 'Type', product: 'Product', qty: 'Qty', batch: 'Batch', expiry: 'Expiry', qa: 'QA', lp: 'LP' },
    qaPass: 'QA pass', qaFail: 'QA fail', qaDenied: 'No QA permission', qaInvalidState: 'Not pending', qaError: 'Unable to update QA',
    voidAction: 'Void output…', noConsumptionBadge: 'No consumption', noConsumptionTooltip: 'No consumption.', noConsumptionContinue: 'Continue anyway',
  },
  disassembly: DISASSEMBLY_LABELS,
  waste: { title: 'Waste events', empty: 'No waste.', addAction: 'Log waste', voidAction: 'Void entry…', totalLabel: 'Total: {kg} kg', col: { time: 'Time', category: 'Category', qty: 'Qty', reason: 'Reason' } },
  voidCorrection: {
    outputTitle: 'Void output {batch}', wasteTitle: 'Void {category} waste entry', intro: 'Voiding records a reversing entry.',
    reasonCode: 'Reason', reasonPlaceholder: 'Select a reason',
    reasonOptions: { entry_error: 'Entry error', wrong_quantity: 'Wrong quantity', wrong_batch: 'Wrong batch / lot', wrong_product: 'Wrong product', other: 'Other' },
    note: 'Note', noteOptional: 'optional', notePlaceholder: 'Add context',
    closedWarning: 'Supervisor authorization required.',
    esign: { title: 'Electronic signature', meaning: 'Re-enter password.', password: 'Password', passwordPlaceholder: 'Account password', passwordHelp: 'Account password.' },
    cancel: 'Cancel', submit: 'Void', submitting: 'Voiding…',
    errors: { forbidden: 'No permission.', not_found: 'Gone.', invalid_state: 'Not voidable.', invalid_input: 'Check fields.', lp_not_voidable: 'Pallet released.', already_corrected: 'Already voided.', esign_failed: 'Signature failed.', persistence_failed: 'Unable.', generic: 'Unable.' },
    voidedBadge: 'Voided', correctionOfLabel: 'Correction of #{ref}',
  },
  downtime: { title: 'Downtime events', empty: 'No downtime.', addAction: 'Log downtime', openLabel: 'Open', col: { category: 'Category', start: 'Start', end: 'End', duration: 'Duration', reason: 'Reason' } },
  qa: { title: 'QA results', empty: 'No inspections.', total: 'Total', pass: 'Pass', hold: 'Hold', fail: 'Fail' },
  labor: LABOR_TAB_LABELS,
  genealogy: { title: 'WO genealogy', empty: 'No links.', inputsLabel: 'Consumed inputs', fefoOk: 'FEFO', fefoDeviation: 'Deviation', reverseAction: 'Reverse…', reversedBadge: 'Reversed', correctionOfLabel: 'Correction of #{ref}' },
  reverseConsumption: REVERSE_LABELS,
  history: { title: 'Event log', empty: 'No events.', sourceStatus: 'Status', sourceExecution: 'Execution', col: { time: 'Time', source: 'Source', action: 'Action', transition: 'Transition', reason: 'Reason' } },
} satisfies WoDetailLabels;

function makeData(overrides: Partial<WorkOrderDetailData> & { bomType: 'forward' | 'disassembly' }): WorkOrderDetailData {
  const { bomType, ...rest } = overrides;
  return {
    header: {
      id: WO_ID, woNumber: 'WO-DIS-001', productId: 'p0000000-0000-0000-0000-000000000000',
      itemCode: 'FG-CARCASS', productName: 'Pork carcass', status: 'in_progress',
      lineId: null, lineCode: null, machineId: null, machineCode: null, machineName: null,
      plannedQty: 100, uom: 'kg', outputKg: 0, consumptionPct: 100, outputPct: 0, allergenGate: false,
      scheduledStart: null, scheduledEnd: null, startedAt: '2026-06-20T06:00:00.000Z', completedAt: null,
      elapsedMin: 60, bomVersion: 1, weightMode: 'fixed', bomType,
    },
    components: [],
    outputs: [], waste: [], downtime: [], genealogyInputs: [], history: [],
    qa: { total: 0, pass: 0, hold: 0, fail: 0 },
    disassemblyOutputs: [
      { coProductItemId: ITEM_A, itemCode: 'CUT-LOIN', itemName: 'Loin', allocationPct: 60, isByproduct: false, expectedQty: 30, uom: 'kg' },
      { coProductItemId: ITEM_B, itemCode: 'CUT-TRIM', itemName: 'Trim', allocationPct: 40, isByproduct: true, expectedQty: 20, uom: 'kg' },
    ],
    disassemblyInputLps: [
      { lpId: INPUT_LP, lpNumber: 'LP-CARCASS-1', qtyKg: 100 },
    ],
    openChangeoverId: null,
    hasOutputWithoutConsumption: false,
    ...rest,
  } as WorkOrderDetailData;
}

const ACTIONS = {
  locale: 'en', status: 'in_progress',
  permissions: {} as never, currentUserId: 'u1', downtimeCategories: [], wasteCategories: [], shifts: [], lines: [],
  modalLabels: buildWoModalLabels((k: string) => k),
} as unknown as WoDetailActions;

const releaseStub: any = async () => ({ ok: true, data: {} });
const recordStub: any = async () => ({ ok: true, data: {} });
const listLpsStub: any = async () => ({ ok: true, data: { lps: [] } });

function renderScreen(opts: {
  bomType: 'forward' | 'disassembly';
  actions?: WoDetailActions | null;
  register?: any;
  data?: Partial<WorkOrderDetailData>;
}) {
  const register = opts.register ?? vi.fn(async () => ({ ok: true }));
  render(
    React.createElement(WoDetailScreen, {
      data: makeData({ bomType: opts.bomType, ...(opts.data ?? {}) }),
      labels: LABELS,
      actions: opts.actions === undefined ? ACTIONS : opts.actions,
      releaseOutputQaAction: releaseStub,
      recordConsumptionAction: recordStub,
      listConsumableLpsAction: listLpsStub,
      voidWoOutputAction: (async () => ({ ok: true })) as any,
      voidWasteEntryAction: (async () => ({ ok: true })) as any,
      reverseConsumptionAction: (async () => ({ ok: true })) as any,
      registerDisassemblyOutputAction: register,
    }),
  );
  return { register };
}

async function openOutputTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('wo-detail-tab-output'));
  await screen.findByTestId('wo-tab-output');
}

afterEach(() => {
  refresh.mockClear();
});

describe('Register disassembly outputs (E7)', () => {
  it('shows the disassembly trigger ONLY for a disassembly WO (header + output tab)', async () => {
    const user = userEvent.setup();
    renderScreen({ bomType: 'disassembly' });
    // Header action bar trigger.
    expect(screen.getByTestId('wo-action-disassembly')).toBeEnabled();
    await openOutputTab(user);
    expect(screen.getByTestId('wo-output-disassembly')).toBeEnabled();
  });

  it('does NOT show the trigger for a forward WO', async () => {
    const user = userEvent.setup();
    renderScreen({ bomType: 'forward' });
    expect(screen.queryByTestId('wo-action-disassembly')).not.toBeInTheDocument();
    await openOutputTab(user);
    expect(screen.queryByTestId('wo-output-disassembly')).not.toBeInTheDocument();
  });

  it('does NOT show the trigger when no action context resolved (RBAC/forbidden hidden)', () => {
    renderScreen({ bomType: 'disassembly', actions: null });
    expect(screen.queryByTestId('wo-action-disassembly')).not.toBeInTheDocument();
  });

  it('lists the expected co-product outputs (prefilled) and submits the registration payload', async () => {
    const user = userEvent.setup();
    const register = vi.fn(async () => ({ ok: true }) as const);
    renderScreen({ bomType: 'disassembly', register });

    await user.click(screen.getByTestId('wo-action-disassembly'));
    await screen.findByTestId('wo-disassembly-submit');

    // Both BOM co-products are listed with read-only allocation; one is a
    // by-product. The code is rendered (name lives in the title attr), never the uuid.
    expect(screen.getAllByTestId('wo-disassembly-output-row')).toHaveLength(2);
    expect(screen.getByText('CUT-LOIN')).toBeInTheDocument();
    expect(screen.getByText('CUT-TRIM')).toBeInTheDocument();
    expect(screen.getByText('60% allocation')).toBeInTheDocument();
    expect(screen.getByText('By-product')).toBeInTheDocument();

    // Qty inputs are prefilled with the nominal expected yield.
    expect(screen.getByTestId(`wo-disassembly-qty-${ITEM_A}`)).toHaveValue('30');
    expect(screen.getByTestId(`wo-disassembly-qty-${ITEM_B}`)).toHaveValue('20');

    // Edit one output to the actual scale read, then submit.
    const qtyA = screen.getByTestId(`wo-disassembly-qty-${ITEM_A}`);
    await user.clear(qtyA);
    await user.type(qtyA, '28.5');

    await user.click(screen.getByTestId('wo-disassembly-submit'));

    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    expect(register.mock.calls[0][0]).toEqual({
      woId: WO_ID,
      inputLpId: INPUT_LP,
      outputs: [
        { coProductItemId: ITEM_A, qtyKg: '28.5' },
        { coProductItemId: ITEM_B, qtyKg: '20' },
      ],
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('surfaces the forbidden error copy in the modal banner (RBAC failure path)', async () => {
    const user = userEvent.setup();
    const register = vi.fn(async () => ({ ok: false, errorCode: 'forbidden' }) as const);
    renderScreen({ bomType: 'disassembly', register });

    await user.click(screen.getByTestId('wo-action-disassembly'));
    await screen.findByTestId('wo-disassembly-submit');
    await user.click(screen.getByTestId('wo-disassembly-submit'));

    const banner = await screen.findByTestId('wo-disassembly-error');
    expect(banner).toHaveTextContent('You do not have permission to register disassembly outputs.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows the empty state when no input LP has been consumed yet', async () => {
    const user = userEvent.setup();
    renderScreen({ bomType: 'disassembly', data: { disassemblyInputLps: [] } });

    await user.click(screen.getByTestId('wo-action-disassembly'));
    await screen.findByTestId('wo-disassembly-submit');
    expect(screen.getByTestId('wo-disassembly-input-empty')).toBeInTheDocument();
    expect(screen.getByTestId('wo-disassembly-submit')).toBeDisabled();
  });
});
