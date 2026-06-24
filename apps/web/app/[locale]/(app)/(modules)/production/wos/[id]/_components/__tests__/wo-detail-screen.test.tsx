/**
 * P-L1 — WO Execution detail screen (8 tabs): RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/production/wo-detail.jsx:4-530.
 * Tests the presentational <WoDetailScreen> directly (the page is an async RSC
 * reading Supabase via withOrgContext, exercised live/Playwright). Asserts:
 *   - all 8 tabs render in prototype order (wo-detail.jsx:75-84)
 *   - default tab is Overview with header KPIs (wo-detail.jsx:9, :102-175)
 *   - switching to each tab renders its panel from fixture data
 *   - per-tab empty states surface when a collection is empty
 *   - the deferred header action bar is DISABLED (out-of-scope mutation slots)
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { WoDetailScreen, type WoDetailLabels } from '../wo-detail-screen';
import { REVERSE_LABELS } from './reverse-labels.fixture';
import type { WorkOrderDetailData } from '../../../../_actions/get-work-order-detail';

const LABELS: WoDetailLabels = {
  status: { planned: 'Planned', in_progress: 'In progress', paused: 'Paused', completed: 'Completed', closed: 'Closed', cancelled: 'Cancelled' },
  deferredActionTitle: 'Wired in the next step',
  changeoverGate: { title: 'Allergen changeover sign-off required', body: 'This line requires the allergen changeover to be dual-signed before this work order can start.', link: 'Open changeovers' },
  headerActions: { start: 'Start', pause: 'Pause', resume: 'Resume', waste: 'Waste', catchWeight: 'Catch-weight', complete: 'Complete', cancel: 'Cancel', close: 'Close' },
  tabs: { overview: 'Overview', consumption: 'Consumption', output: 'Output', waste: 'Waste', downtime: 'Downtime', qa: 'QA results', genealogy: 'Genealogy', labor: 'Labor', history: 'Event log' },
  overview: {
    summaryTitle: 'Work order summary', kpisTitle: 'KPIs', wo: 'WO', product: 'Product', line: 'Line', machine: 'Machine',
    planned: 'Planned qty', output: 'Output', plannedWindow: 'Planned window', actualStart: 'Actual start', elapsed: 'Elapsed',
    allergens: 'Allergens', bomVersion: 'BOM v', consumption: 'Consumption', consumptionKpi: 'Consumption', outputKpi: 'Output',
    allergenYes: 'Allergen profile present', allergenNo: 'None', elapsedMin: 'min',
  },
  consumption: {
    title: 'Component consumption',
    empty: 'No components recorded for this work order.',
    addAction: 'Scan LP',
    col: { code: 'Code', component: 'Component', planned: 'Planned', consumed: 'Consumed', remaining: 'Remaining', progress: 'Progress' },
    record: {
      trigger: 'Record consumption', rowTrigger: 'Record', title: 'Record material consumption', subtitle: 'Decrement on-hand stock.',
      material: 'Component', materialPlaceholder: 'Select a component', qty: 'Quantity', qtyHint: "Amount in the component's UoM.",
      lp: 'License plate (FEFO)', lpLoading: 'Loading license plates…', lpEmpty: 'No license plates available for this component.',
      lpError: 'Unable to load license plates.', lpNone: '— no LP —', lpSuggested: 'suggested',
      reasonCode: 'Manual reason code', reasonPlaceholder: 'Required without an LP', submit: 'Record consumption',
      submitting: 'Recording…', cancel: 'Cancel',
      warningOver: 'Over required quantity by {pct}% — recorded and flagged.', warningClose: 'Close',
      errors: { forbidden: 'No permission to record consumption.', lp_unavailable: 'Not enough free stock on that LP.', lp_not_released: 'LP is not QA released.', lp_expired: 'LP is expired.', lp_locked: 'LP is locked.', quality_hold_active: 'LP is on hold.', reason_required: 'Reason is required.', invalid_material: 'Component no longer valid.', invalid_qty: 'Enter a quantity greater than zero.', generic: 'Unable to record consumption.' },
    },
  },
  output: {
    title: 'Registered output',
    empty: 'No output registered yet.',
    addAction: 'Register output',
    col: { type: 'Type', product: 'Product', qty: 'Qty', batch: 'Batch / lot', expiry: 'Expiry', qa: 'QA', lp: 'LP' },
    qaPass: 'QA pass',
    qaFail: 'QA fail',
    qaDenied: 'No QA permission',
    qaInvalidState: 'Output is no longer pending',
    qaError: 'Unable to update QA',
    voidAction: 'Void output…',
    noConsumptionBadge: 'No consumption',
    noConsumptionTooltip: 'No material consumption recorded for this WO — the output will have no genealogy/traceability link. Register consumption first, or continue.',
    noConsumptionContinue: 'Continue anyway',
  },
  waste: { title: 'Waste events', empty: 'No waste recorded for this work order.', addAction: 'Log waste', voidAction: 'Void entry…', totalLabel: 'Total: {kg} kg', col: { time: 'Time', category: 'Category', qty: 'Qty', reason: 'Reason' } },
  downtime: { title: 'Downtime events', empty: 'No downtime recorded for this work order.', addAction: 'Log downtime', openLabel: 'Open', col: { category: 'Category', start: 'Start', end: 'End', duration: 'Duration', reason: 'Reason' } },
  qa: { title: 'QA results', empty: 'No inspections linked to this work order yet.', total: 'Total', pass: 'Pass', hold: 'Hold', fail: 'Fail' },
  labor: {
    title: 'Labor', empty: 'No labor recorded for this work order yet.', loading: 'Loading labor…',
    error: 'Labor could not be loaded. Please retry shortly.', forbidden: 'You do not have permission to view labor for this work order.',
    clockIn: 'Clock in operator', clockOut: 'Clock out', clockingIn: 'Clocking in…', clockingOut: 'Clocking out…',
    clockInDenied: 'You do not have permission to clock in to this work order.', clockOutDenied: 'You do not have permission to clock out of this work order.',
    totalHours: 'Total hours', totalCost: 'Total labor cost', noRate: 'No rate', noRateTooltip: 'No labor rate is configured for this operator’s role.',
    disabledTooltip: 'You do not have permission to record labor (production.consumption.write).',
    col: { operator: 'Operator', hours: 'Hours', rate: 'Rate / h', cost: 'Cost' },
  },
  genealogy: { title: 'WO genealogy', empty: 'No consumption links yet — genealogy builds as LPs are scanned.', inputsLabel: 'Consumed inputs', fefoOk: 'FEFO', fefoDeviation: 'Deviation', reverseAction: 'Reverse…', reversedBadge: 'Reversed', correctionOfLabel: 'Correction of #{ref}' },
  history: { title: 'Event log', empty: 'No events recorded for this work order yet.', sourceStatus: 'Status', sourceExecution: 'Execution', col: { time: 'Time', source: 'Source', action: 'Action', transition: 'Transition', reason: 'Reason' } },
  voidCorrection: {
    outputTitle: 'Void output {batch}', wasteTitle: 'Void {category} waste entry',
    intro: 'Voiding records a reversing correction entry.',
    reasonCode: 'Reason', reasonPlaceholder: 'Select a reason',
    reasonOptions: { entry_error: 'Entry error', wrong_quantity: 'Wrong quantity', wrong_batch: 'Wrong batch / lot', wrong_product: 'Wrong product', other: 'Other' },
    note: 'Note', noteOptional: 'optional', notePlaceholder: 'Add context for the correction',
    closedWarning: 'Voiding on a closed order requires supervisor authorization.',
    esign: { title: 'Electronic signature', meaning: 'Re-enter your password.', password: 'Password', passwordPlaceholder: 'Account password', passwordHelp: 'Account password, not a PIN.' },
    cancel: 'Cancel', submit: 'Void', submitting: 'Voiding…',
    errors: {
      forbidden: 'No permission to void.', not_found: 'Record gone — refresh.', invalid_state: 'No longer voidable.', invalid_input: 'Check the fields.',
      lp_not_voidable: "This output's pallet has already been released or allocated — it can no longer be voided directly.",
      already_corrected: 'This record has already been voided.', esign_failed: 'Signature failed — check your password.',
      persistence_failed: 'Unable to void.', generic: 'Unable to void.',
    },
    voidedBadge: 'Voided', correctionOfLabel: 'Correction of #{ref}',
  },
  reverseConsumption: REVERSE_LABELS,
};

const DATA: WorkOrderDetailData = {
  header: {
    id: '11111111-1111-1111-1111-111111111111',
    woNumber: 'WO-2026-0042',
    productId: 'aaaaaaaa-1111-1111-1111-111111111111',
    itemCode: 'FG-TEST-01',
    productName: 'Test Product A',
    status: 'in_progress',
    lineId: 'bbbbbbbb-2222-2222-2222-222222222222',
    lineCode: 'LINE-1',
    machineId: null,
    plannedQty: 1000,
    uom: 'kg',
    outputKg: 250,
    consumptionPct: 65,
    outputPct: 25,
    allergenGate: true,
    scheduledStart: '2026-06-10T06:00:00.000Z',
    scheduledEnd: '2026-06-10T14:00:00.000Z',
    startedAt: '2026-06-10T06:10:00.000Z',
    completedAt: null,
    elapsedMin: 120,
    bomVersion: 7,
  },
  components: [
    { id: 'c1', productId: 'p1111111-1111-1111-1111-111111111111', materialName: 'Pork shoulder', requiredQty: 600, consumedQty: 390, remainingQty: 210, uom: 'kg', progressPct: 65 },
  ],
  outputs: [
    { id: 'o1', outputType: 'primary', productId: 'fg111111-1111-1111-1111-111111111111', batchNumber: 'WO-2026-0042-OUT-001', qtyKg: 250, uom: 'kg', qaStatus: 'PENDING', lpId: null, expiryDate: '2026-06-27' },
  ],
  waste: [
    { id: 'w1', recordedAt: '2026-06-10T07:00:00.000Z', categoryName: 'Trim', qtyKg: 3.6, reasonNotes: 'Re-extruded batch' },
  ],
  downtime: [
    { id: 'd1', categoryName: 'Material wait', startedAt: '2026-06-10T06:44:00.000Z', endedAt: '2026-06-10T06:50:00.000Z', durationMin: 6, reasonNotes: 'Casings delayed' },
  ],
  genealogyInputs: [
    { id: 'g1', componentId: 'p1', lpId: 'lp111111-1111-1111-1111-111111111111', qtyKg: 200, fefoAdherence: true, consumedAt: '2026-06-10T06:30:00.000Z' },
  ],
  history: [
    { id: 'h1', occurredAt: '2026-06-10T06:10:00.000Z', source: 'execution', action: 'start', fromStatus: 'planned', toStatus: 'in_progress', reason: null },
  ],
  qa: { total: 0, pass: 0, hold: 0, fail: 0 },
  openChangeoverId: null,
  hasOutputWithoutConsumption: false,
};
const releaseOutputQaActionStub: any = async () => ({
  ok: true,
  data: { outputId: 'o1', qaStatus: 'PASSED', lpId: null, lpQaStatus: null },
});
const recordConsumptionActionStub: any = async () => ({
  ok: true,
  data: { materialId: 'c1', consumedQty: '400', uom: 'kg', lpId: null, replay: false },
});
const listConsumableLpsActionStub: any = async () => ({ ok: true, data: { lps: [] } });
const voidWoOutputActionStub: any = async () => ({ ok: true });
const voidWasteEntryActionStub: any = async () => ({ ok: true });

// E4B — labor summary fixture (getWoLaborSummary shape): operator NAME only.
const LABOR_SUMMARY = {
  totalHours: 5.5,
  totalCost: 110.0,
  currency: 'USD',
  entries: [
    { userName: 'Anna Operator', hours: 3.5, ratePerHour: 20, cost: 70 },
    { userName: 'Bob Packer', hours: 2.0, ratePerHour: 20, cost: 40 },
  ],
};

function renderScreen(data = DATA, laborProps: Record<string, unknown> = {}) {
  // actions=null exercises the read-only path (no live action context): the
  // wired action bar is NOT rendered; the per-tab triggers are absent. The action
  // wiring itself is covered by wos/_components/modals/__tests__/wo-actions.test.tsx.
  return render(
    React.createElement(WoDetailScreen, {
      data,
      labels: LABELS,
      actions: null,
      releaseOutputQaAction: releaseOutputQaActionStub,
      recordConsumptionAction: recordConsumptionActionStub,
      listConsumableLpsAction: listConsumableLpsActionStub,
      voidWoOutputAction: voidWoOutputActionStub,
      voidWasteEntryAction: voidWasteEntryActionStub,
      reverseConsumptionAction: (async () => ({ ok: true })) as never,
      ...laborProps,
    }),
  );
}

describe('WoDetailScreen (parity: wo-detail.jsx:4-530)', () => {
  it('renders all tabs in prototype order (+ E4B Labor tab)', () => {
    renderScreen();
    const order = ['overview', 'consumption', 'output', 'waste', 'downtime', 'qa', 'genealogy', 'labor', 'history'];
    for (const k of order) {
      expect(screen.getByTestId(`wo-detail-tab-${k}`)).toBeInTheDocument();
    }
  });

  it('renders the header with WO number, status badge and twin progress bars', () => {
    renderScreen();
    const head = screen.getByTestId('wo-detail-header');
    expect(head).toHaveTextContent('WO-2026-0042');
    expect(head).toHaveTextContent('In progress');
    // Two progress bars in the header (consumption + output).
    const bars = screen.getAllByRole('progressbar');
    expect(bars.length).toBeGreaterThanOrEqual(2);
  });

  it('defaults to the Overview tab with summary facts', () => {
    renderScreen();
    expect(screen.getByTestId('wo-tab-overview')).toBeInTheDocument();
    expect(screen.getByText('Work order summary')).toBeInTheDocument();
    expect(screen.getByText('Allergen profile present')).toBeInTheDocument();
  });

  it('switching to Consumption renders the component rows', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId('wo-detail-tab-consumption'));
    expect(screen.getByTestId('wo-tab-consumption')).toBeInTheDocument();
    expect(screen.getByText('Pork shoulder')).toBeInTheDocument();
    expect(screen.getAllByTestId('wo-component-row')).toHaveLength(1);
  });

  it('switching to Output renders the wo_outputs rows', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId('wo-detail-tab-output'));
    expect(screen.getByText('WO-2026-0042-OUT-001')).toBeInTheDocument();
    expect(screen.getAllByTestId('wo-output-row')).toHaveLength(1);
    expect(screen.getByTestId('wo-output-qa-pass-o1')).toBeInTheDocument();
    expect(screen.getByTestId('wo-output-qa-fail-o1')).toBeInTheDocument();
  });

  it('switching to Waste renders the waste rows + total', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId('wo-detail-tab-waste'));
    expect(screen.getAllByTestId('wo-waste-row')).toHaveLength(1);
    expect(screen.getByTestId('wo-waste-total')).toHaveTextContent('Total: 4 kg');
  });

  it('switching to Downtime renders the downtime rows', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId('wo-detail-tab-downtime'));
    expect(screen.getAllByTestId('wo-downtime-row')).toHaveLength(1);
    expect(screen.getByText('Material wait')).toBeInTheDocument();
  });

  it('switching to Genealogy renders consumed-input links', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId('wo-detail-tab-genealogy'));
    expect(screen.getAllByTestId('wo-genealogy-input')).toHaveLength(1);
  });

  it('switching to History renders the merged event log', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId('wo-detail-tab-history'));
    expect(screen.getAllByTestId('wo-history-row')).toHaveLength(1);
    expect(screen.getByText('start')).toBeInTheDocument();
  });

  it('QA tab shows the honest empty state (no read-model yet)', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId('wo-detail-tab-qa'));
    expect(screen.getByTestId('wo-qa-empty')).toBeInTheDocument();
  });

  it('EMPTY collections surface per-tab empty copy', async () => {
    const user = userEvent.setup();
    const empty: WorkOrderDetailData = {
      ...DATA,
      components: [],
      outputs: [],
      waste: [],
      downtime: [],
      genealogyInputs: [],
      history: [],
    };
    renderScreen(empty);
    await user.click(screen.getByTestId('wo-detail-tab-consumption'));
    expect(screen.getByTestId('wo-consumption-empty')).toBeInTheDocument();
    await user.click(screen.getByTestId('wo-detail-tab-output'));
    expect(screen.getByTestId('wo-output-empty')).toBeInTheDocument();
    await user.click(screen.getByTestId('wo-detail-tab-genealogy'));
    expect(screen.getByTestId('wo-genealogy-empty')).toBeInTheDocument();
    await user.click(screen.getByTestId('wo-detail-tab-history'));
    expect(screen.getByTestId('wo-history-empty')).toBeInTheDocument();
  });

  it('with no action context (read-only) the wired action bar is NOT rendered', () => {
    renderScreen();
    // The header action bar + its triggers only mount when `actions` resolves.
    expect(screen.queryByTestId('wo-action-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wo-action-pause')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wo-action-complete')).not.toBeInTheDocument();
  });
});

describe('WoDetailScreen — B-2 allergen changeover sign-off callout', () => {
  function renderWithGate(gate: { lineId: string | null } | null) {
    return render(
      React.createElement(WoDetailScreen, {
        data: DATA,
        labels: LABELS,
        actions: null,
        changeoverGate: gate,
        releaseOutputQaAction: releaseOutputQaActionStub,
        recordConsumptionAction: recordConsumptionActionStub,
        listConsumableLpsAction: listConsumableLpsActionStub,
        voidWoOutputAction: voidWoOutputActionStub,
        voidWasteEntryAction: voidWasteEntryActionStub,
        reverseConsumptionAction: (async () => ({ ok: true })) as never,
      }),
    );
  }

  it('does NOT render the callout when there is no gate', () => {
    renderWithGate(null);
    expect(screen.queryByTestId('wo-changeover-gate')).not.toBeInTheDocument();
  });

  it('renders the amber callout with title/body + a deep-link to the WO line', () => {
    renderWithGate({ lineId: 'bbbbbbbb-2222-2222-2222-222222222222' });
    const callout = screen.getByTestId('wo-changeover-gate');
    expect(callout).toHaveTextContent(LABELS.changeoverGate.title);
    expect(callout).toHaveTextContent(LABELS.changeoverGate.body);
    const link = screen.getByTestId('wo-changeover-gate-link');
    expect(link).toHaveTextContent(LABELS.changeoverGate.link);
    expect(link).toHaveAttribute(
      'href',
      '/en/production/changeovers?lineId=bbbbbbbb-2222-2222-2222-222222222222',
    );
  });

  it('links to the bare register when the lineId is unknown', () => {
    renderWithGate({ lineId: null });
    expect(screen.getByTestId('wo-changeover-gate-link')).toHaveAttribute('href', '/en/production/changeovers');
  });
});

describe('WoDetailScreen — output-without-consumption SOFT warning', () => {
  it('does NOT show the ⚠ badge / note when consumption exists (derived false)', async () => {
    const user = userEvent.setup();
    renderScreen({ ...DATA, hasOutputWithoutConsumption: false });
    // header badge absent
    expect(screen.queryByTestId('wo-no-consumption-badge')).not.toBeInTheDocument();
    // output-tab badge + note absent
    await user.click(screen.getByTestId('wo-detail-tab-output'));
    expect(screen.queryByTestId('wo-output-no-consumption-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wo-output-no-consumption-note')).not.toBeInTheDocument();
  });

  it('shows the ⚠ header badge with the explanatory tooltip when derived true', () => {
    renderScreen({ ...DATA, hasOutputWithoutConsumption: true });
    const badge = screen.getByTestId('wo-no-consumption-badge');
    expect(badge).toHaveTextContent('No consumption');
    // tooltip = the no-raw-UUID explanation
    expect(badge).toHaveAttribute('title', LABELS.output.noConsumptionTooltip);
  });

  it('shows the Output-tab ⚠ badge + non-blocking note when derived true', async () => {
    const user = userEvent.setup();
    renderScreen({ ...DATA, hasOutputWithoutConsumption: true });
    await user.click(screen.getByTestId('wo-detail-tab-output'));
    expect(screen.getByTestId('wo-output-no-consumption-badge')).toHaveTextContent('No consumption');
    const note = screen.getByTestId('wo-output-no-consumption-note');
    expect(note).toHaveTextContent(LABELS.output.noConsumptionTooltip);
    // the note must never leak a raw UUID
    expect(note.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });
});

describe('WoDetailScreen — E4B Labor tab', () => {
  it('renders the labor summary table (operator NAME, hours, rate, cost) + totals', async () => {
    const user = userEvent.setup();
    renderScreen(DATA, { laborSummary: LABOR_SUMMARY, laborState: 'ready' });
    await user.click(screen.getByTestId('wo-detail-tab-labor'));
    const tab = screen.getByTestId('wo-tab-labor');
    expect(tab).toBeInTheDocument();
    // operator NAMES are shown (never raw user UUIDs)
    expect(screen.getByText('Anna Operator')).toBeInTheDocument();
    expect(screen.getByText('Bob Packer')).toBeInTheDocument();
    expect(screen.getAllByTestId('wo-labor-row')).toHaveLength(2);
    // total hours + TOTAL LABOR COST surfaced
    expect(screen.getByTestId('wo-labor-total-hours')).toHaveTextContent('5.50 h');
    const totalCost = screen.getByTestId('wo-labor-total-cost');
    expect(totalCost).toHaveTextContent('110.00');
    expect(totalCost).toHaveTextContent('USD');
    // no raw UUID anywhere in the labor tab
    expect(tab.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('clock-in calls clockInAction(woId, source=desktop) when permitted', async () => {
    const user = userEvent.setup();
    const clockInAction = vi.fn(async () => ({ ok: true, logId: 'log-1' }));
    renderScreen(DATA, {
      laborSummary: { ...LABOR_SUMMARY, entries: [] },
      laborState: 'ready',
      canManageLabor: true,
      clockInAction: clockInAction as never,
    });
    await user.click(screen.getByTestId('wo-detail-tab-labor'));
    await user.click(screen.getByTestId('wo-labor-clock-in'));
    expect(clockInAction).toHaveBeenCalledTimes(1);
    expect(clockInAction).toHaveBeenCalledWith({ woId: DATA.header.id, source: 'desktop' });
  });

  it('clock-out calls clockOutAction(woId) when permitted', async () => {
    const user = userEvent.setup();
    const clockOutAction = vi.fn(async () => ({ ok: true, count: 1 }));
    renderScreen(DATA, {
      laborSummary: LABOR_SUMMARY,
      laborState: 'ready',
      canManageLabor: true,
      clockOutAction: clockOutAction as never,
    });
    await user.click(screen.getByTestId('wo-detail-tab-labor'));
    await user.click(screen.getByTestId('wo-labor-clock-out'));
    expect(clockOutAction).toHaveBeenCalledTimes(1);
    expect(clockOutAction).toHaveBeenCalledWith({ woId: DATA.header.id });
  });

  it('disables clock controls + keeps a tooltip when the caller cannot manage labor', async () => {
    const user = userEvent.setup();
    renderScreen(DATA, { laborSummary: LABOR_SUMMARY, laborState: 'ready', canManageLabor: false });
    await user.click(screen.getByTestId('wo-detail-tab-labor'));
    const clockIn = screen.getByTestId('wo-labor-clock-in');
    expect(clockIn).toBeDisabled();
    expect(clockIn).toHaveAttribute('title', LABELS.labor.disabledTooltip);
    expect(screen.getByTestId('wo-labor-clock-out')).toBeDisabled();
  });

  it('shows the EMPTY state when no labor entries exist', async () => {
    const user = userEvent.setup();
    renderScreen(DATA, { laborSummary: { ...LABOR_SUMMARY, entries: [], totalHours: 0, totalCost: 0 }, laborState: 'ready' });
    await user.click(screen.getByTestId('wo-detail-tab-labor'));
    expect(screen.getByTestId('wo-labor-empty')).toBeInTheDocument();
  });

  it('shows the LOADING state', async () => {
    const user = userEvent.setup();
    renderScreen(DATA, { laborSummary: null, laborState: 'loading' });
    await user.click(screen.getByTestId('wo-detail-tab-labor'));
    expect(screen.getByTestId('wo-labor-loading')).toBeInTheDocument();
  });

  it('shows the ERROR state when the summary read failed', async () => {
    const user = userEvent.setup();
    renderScreen(DATA, { laborSummary: null, laborState: 'error' });
    await user.click(screen.getByTestId('wo-detail-tab-labor'));
    expect(screen.getByTestId('wo-labor-error')).toBeInTheDocument();
  });

  it('shows the PERMISSION-DENIED state for a forbidden summary read', async () => {
    const user = userEvent.setup();
    renderScreen(DATA, { laborSummary: null, laborState: 'forbidden' });
    await user.click(screen.getByTestId('wo-detail-tab-labor'));
    expect(screen.getByTestId('wo-labor-forbidden')).toBeInTheDocument();
  });

  it('surfaces the OPTIMISTIC/permission error banner when clock-in is forbidden', async () => {
    const user = userEvent.setup();
    const clockInAction = vi.fn(async () => ({ ok: false, error: 'forbidden' as const }));
    renderScreen(DATA, {
      laborSummary: { ...LABOR_SUMMARY, entries: [] },
      laborState: 'ready',
      canManageLabor: true,
      clockInAction: clockInAction as never,
    });
    await user.click(screen.getByTestId('wo-detail-tab-labor'));
    await user.click(screen.getByTestId('wo-labor-clock-in'));
    expect(await screen.findByTestId('wo-labor-error-banner')).toHaveTextContent(LABELS.labor.clockInDenied);
  });

  it('renders the noRate marker without computing a cost', async () => {
    const user = userEvent.setup();
    renderScreen(DATA, {
      laborSummary: {
        totalHours: 1, totalCost: 0, currency: 'USD',
        entries: [{ userName: 'Cara Mixer', hours: 1, ratePerHour: 0, cost: 0, noRate: true }],
      },
      laborState: 'ready',
    });
    await user.click(screen.getByTestId('wo-detail-tab-labor'));
    expect(screen.getByText('No rate')).toBeInTheDocument();
  });
});
