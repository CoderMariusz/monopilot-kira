/**
 * M-5 — Desktop "Record consumption" modal: RTL behaviour.
 *
 * Exercises the new Consumption-tab desktop write path on <WoDetailScreen>:
 *   - the live "Record consumption" trigger replaces the disabled DeferredButton
 *     when the WO is in_progress/paused AND an action context exists;
 *   - per-row "Record" buttons preselect the launched component;
 *   - the modal submits the expected payload (decimal qty + chosen LP + a
 *     clientOpId) to recordConsumptionAction and refreshes on success;
 *   - verbatim closed errors (forbidden / lp_unavailable / invalid_material)
 *     surface their mapped copy in the modal banner;
 *   - the FEFO LP candidate list (from listConsumableLpsAction) renders with the
 *     top row pre-suggested and a '— no LP —' fallback;
 *   - the optimistic pending state disables the submit button.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

import { WoDetailScreen, type WoDetailLabels, type WoDetailActions } from '../wo-detail-screen';
import type { WorkOrderDetailData } from '../../../../_actions/get-work-order-detail';
import { buildWoModalLabels } from '../../../../_actions/wo-modal-labels';

const LABELS = {
  status: { planned: 'Planned', in_progress: 'In progress', paused: 'Paused', completed: 'Completed', closed: 'Closed', cancelled: 'Cancelled' },
  deferredActionTitle: 'Wired later',
  headerActions: { start: 'Start', pause: 'Pause', resume: 'Resume', waste: 'Waste', catchWeight: 'Catch-weight', complete: 'Complete', cancel: 'Cancel', close: 'Close' },
  tabs: { overview: 'Overview', consumption: 'Consumption', output: 'Output', waste: 'Waste', downtime: 'Downtime', qa: 'QA results', genealogy: 'Genealogy', history: 'Event log' },
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
      lp: 'License plate (FEFO)', lpLoading: 'Loading license plates…', lpEmpty: 'No license plates available for this component.',
      lpError: 'Unable to load license plates.', lpNone: '— no LP —', lpSuggested: 'suggested', submit: 'Record consumption',
      submitting: 'Recording…', cancel: 'Cancel',
      errors: {
        forbidden: 'No permission to record consumption.',
        lp_unavailable: 'Not enough free stock on that LP.',
        invalid_material: 'Component no longer valid.',
        invalid_qty: 'Enter a quantity greater than zero.',
        generic: 'Unable to record consumption.',
      },
    },
  },
  output: {
    title: 'Registered output', empty: 'No output.', addAction: 'Register output',
    col: { type: 'Type', product: 'Product', qty: 'Qty', batch: 'Batch', expiry: 'Expiry', qa: 'QA', lp: 'LP' },
    qaPass: 'QA pass', qaFail: 'QA fail', qaDenied: 'No QA permission', qaInvalidState: 'Not pending', qaError: 'Unable to update QA',
  },
  waste: { title: 'Waste events', empty: 'No waste.', addAction: 'Log waste', totalLabel: 'Total: {kg} kg', col: { time: 'Time', category: 'Category', qty: 'Qty', reason: 'Reason' } },
  downtime: { title: 'Downtime events', empty: 'No downtime.', addAction: 'Log downtime', openLabel: 'Open', col: { category: 'Category', start: 'Start', end: 'End', duration: 'Duration', reason: 'Reason' } },
  qa: { title: 'QA results', empty: 'No inspections.', total: 'Total', pass: 'Pass', hold: 'Hold', fail: 'Fail' },
  genealogy: { title: 'WO genealogy', empty: 'No links.', inputsLabel: 'Consumed inputs', fefoOk: 'FEFO', fefoDeviation: 'Deviation' },
  history: { title: 'Event log', empty: 'No events.', sourceStatus: 'Status', sourceExecution: 'Execution', col: { time: 'Time', source: 'Source', action: 'Action', transition: 'Transition', reason: 'Reason' } },
} satisfies WoDetailLabels;

const DATA = {
  header: {
    id: '11111111-1111-1111-1111-111111111111', woNumber: 'WO-2026-0042',
    productId: 'aaaaaaaa-1111-1111-1111-111111111111', itemCode: 'FG-TEST-01', productName: 'Test Product A',
    status: 'in_progress', lineId: 'bbbbbbbb-2222-2222-2222-222222222222', lineCode: 'LINE-1', machineId: null,
    plannedQty: 1000, uom: 'kg', outputKg: 250, consumptionPct: 65, outputPct: 25, allergenGate: true,
    scheduledStart: '2026-06-10T06:00:00.000Z', scheduledEnd: '2026-06-10T14:00:00.000Z', startedAt: '2026-06-10T06:10:00.000Z',
    completedAt: null, elapsedMin: 120, bomVersion: 7,
  },
  components: [
    { id: 'comp-1111-1111-1111-111111111111', productId: 'p1111111-1111-1111-1111-111111111111', itemCode: 'RM-PORK', materialName: 'Pork shoulder', requiredQty: 600, consumedQty: 390, remainingQty: 210, uom: 'kg', progressPct: 65 },
    { id: 'comp-2222-2222-2222-222222222222', productId: 'p2222222-2222-2222-2222-222222222222', itemCode: 'RM-SALT', materialName: 'Sea salt', requiredQty: 12, consumedQty: 4, remainingQty: 8, uom: 'kg', progressPct: 33 },
  ],
  outputs: [], waste: [], downtime: [], genealogyInputs: [], history: [],
  qa: { total: 0, pass: 0, hold: 0, fail: 0 },
} as unknown as WorkOrderDetailData;

// Minimal non-null action context so canRecordConsumption is true. The desktop
// consume modal does NOT depend on the WoActionsProvider internals — the header
// bar / per-tab triggers it powers are not under test here.
const ACTIONS = {
  locale: 'en', status: 'in_progress',
  permissions: {} as any, currentUserId: 'u1', downtimeCategories: [], wasteCategories: [],
  // Real-shaped modal labels (passthrough translator) so the WoActionsProvider's
  // header/per-tab modals render without crashing — they are NOT under test here.
  modalLabels: buildWoModalLabels((k: string) => k),
} as unknown as WoDetailActions;

const releaseStub: any = async () => ({ ok: true, data: {} });

function makeRecord() {
  return vi.fn(async () => ({ ok: true, data: { materialId: 'comp-1111-1111-1111-111111111111', consumedQty: '405', uom: 'kg', lpId: null, replay: false } }));
}
function makeListLps() {
  return vi.fn(async () => ({
    ok: true,
    data: {
      lps: [
        { lpId: 'lp-aaaa-aaaa-aaaa-aaaaaaaaaaaa', lpNumber: 'LP-001', qty: '50', uom: 'kg', expiry: '2026-07-01' },
        { lpId: 'lp-bbbb-bbbb-bbbb-bbbbbbbbbbbb', lpNumber: 'LP-002', qty: '30', uom: 'kg', expiry: '2026-08-01' },
      ],
    },
  }));
}

function renderScreen(record: any, listLps: any) {
  return render(
    React.createElement(WoDetailScreen, {
      data: DATA, labels: LABELS, actions: ACTIONS,
      releaseOutputQaAction: releaseStub,
      recordConsumptionAction: record,
      listConsumableLpsAction: listLps,
    }),
  );
}

afterEach(() => {
  refresh.mockClear();
});

async function openConsumptionTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('wo-detail-tab-consumption'));
  await screen.findByTestId('wo-tab-consumption');
}

describe('Desktop Record-consumption modal', () => {
  it('shows the live trigger (not the disabled DeferredButton) when running with an action context', async () => {
    const user = userEvent.setup();
    renderScreen(makeRecord(), makeListLps());
    await openConsumptionTab(user);
    expect(screen.getByTestId('wo-consumption-record')).toBeEnabled();
    expect(screen.queryByTestId('wo-consumption-add')).not.toBeInTheDocument();
  });

  it('submits the expected payload (decimal qty + chosen LP + clientOpId) and refreshes', async () => {
    const record = makeRecord();
    const user = userEvent.setup();
    renderScreen(record, makeListLps());
    await openConsumptionTab(user);
    await user.click(screen.getByTestId('wo-consumption-record'));

    // FEFO list loads — top candidate is pre-suggested (rendered as the chosen
    // Select value). The '— no LP —' fallback lives inside the closed dropdown
    // (a portaled listbox), so it is not asserted as visible text here.
    await waitFor(() => expect(screen.getByText(/LP-001/)).toBeInTheDocument());
    expect(screen.getByText(/suggested/)).toBeInTheDocument();

    await user.type(screen.getByTestId('wo-consume-qty'), '15.5');
    await user.click(screen.getByTestId('wo-consume-submit'));

    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    const payload = record.mock.calls[0][0];
    expect(payload).toMatchObject({
      woId: '11111111-1111-1111-1111-111111111111',
      materialId: 'comp-1111-1111-1111-111111111111',
      qty: '15.5',
      lpId: 'lp-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // top FEFO suggestion preselected
    });
    expect(typeof payload.clientOpId).toBe('string');
    expect(payload.clientOpId.length).toBeGreaterThan(0);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('preselects the launched component when opened from a per-row Record button', async () => {
    const record = makeRecord();
    const user = userEvent.setup();
    renderScreen(record, makeListLps());
    await openConsumptionTab(user);

    // Launch from the SECOND row (Sea salt).
    await user.click(screen.getByTestId('wo-consumption-record-row-comp-2222-2222-2222-222222222222'));
    await waitFor(() => expect(screen.getByTestId('wo-consume-qty')).toBeInTheDocument());

    await user.type(screen.getByTestId('wo-consume-qty'), '2');
    await user.click(screen.getByTestId('wo-consume-submit'));

    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0][0].materialId).toBe('comp-2222-2222-2222-222222222222');
  });

  it('surfaces the verbatim lp_unavailable error in the modal banner', async () => {
    const record = vi.fn(async () => ({ ok: false, reason: 'lp_unavailable' }));
    const user = userEvent.setup();
    renderScreen(record, makeListLps());
    await openConsumptionTab(user);
    await user.click(screen.getByTestId('wo-consumption-record'));
    await waitFor(() => expect(screen.getByText(/LP-001/)).toBeInTheDocument());
    await user.type(screen.getByTestId('wo-consume-qty'), '999');
    await user.click(screen.getByTestId('wo-consume-submit'));

    const banner = await screen.findByTestId('wo-consume-error');
    expect(banner).toHaveTextContent('Not enough free stock on that LP.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('maps a forbidden result to the permission copy', async () => {
    const record = vi.fn(async () => ({ ok: false, reason: 'forbidden' }));
    const user = userEvent.setup();
    renderScreen(record, makeListLps());
    await openConsumptionTab(user);
    await user.click(screen.getByTestId('wo-consumption-record'));
    await waitFor(() => expect(screen.getByText(/LP-001/)).toBeInTheDocument());
    await user.type(screen.getByTestId('wo-consume-qty'), '5');
    await user.click(screen.getByTestId('wo-consume-submit'));

    expect(await screen.findByTestId('wo-consume-error')).toHaveTextContent('No permission to record consumption.');
  });

  it('renders the LP-empty state when no FEFO candidates exist', async () => {
    const listLps = vi.fn(async () => ({ ok: true, data: { lps: [] } }));
    const user = userEvent.setup();
    renderScreen(makeRecord(), listLps);
    await openConsumptionTab(user);
    await user.click(screen.getByTestId('wo-consumption-record'));
    expect(await screen.findByTestId('wo-consume-lp-empty')).toBeInTheDocument();
  });

  it('renders the LP-error state when the candidate fetch fails', async () => {
    const listLps = vi.fn(async () => ({ ok: false, reason: 'error' }));
    const user = userEvent.setup();
    renderScreen(makeRecord(), listLps);
    await openConsumptionTab(user);
    await user.click(screen.getByTestId('wo-consumption-record'));
    expect(await screen.findByTestId('wo-consume-lp-error')).toBeInTheDocument();
  });
});
