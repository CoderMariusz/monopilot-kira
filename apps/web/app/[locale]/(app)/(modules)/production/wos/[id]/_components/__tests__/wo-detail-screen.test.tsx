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
import type { WorkOrderDetailData } from '../../../../_actions/get-work-order-detail';

const LABELS: WoDetailLabels = {
  status: { planned: 'Planned', in_progress: 'In progress', paused: 'Paused', completed: 'Completed', closed: 'Closed', cancelled: 'Cancelled' },
  deferredActionTitle: 'Wired in the next step',
  changeoverGate: { title: 'Allergen changeover sign-off required', body: 'This line requires the allergen changeover to be dual-signed before this work order can start.', link: 'Open changeovers' },
  headerActions: { start: 'Start', pause: 'Pause', resume: 'Resume', waste: 'Waste', catchWeight: 'Catch-weight', complete: 'Complete', cancel: 'Cancel', close: 'Close' },
  tabs: { overview: 'Overview', consumption: 'Consumption', output: 'Output', waste: 'Waste', downtime: 'Downtime', qa: 'QA results', genealogy: 'Genealogy', history: 'Event log' },
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
      lpError: 'Unable to load license plates.', lpNone: '— no LP —', lpSuggested: 'suggested', submit: 'Record consumption',
      submitting: 'Recording…', cancel: 'Cancel',
      warningOver: 'Over required quantity by {pct}% — recorded and flagged.', warningClose: 'Close',
      errors: { forbidden: 'No permission to record consumption.', lp_unavailable: 'Not enough free stock on that LP.', invalid_material: 'Component no longer valid.', invalid_qty: 'Enter a quantity greater than zero.', generic: 'Unable to record consumption.' },
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
  },
  waste: { title: 'Waste events', empty: 'No waste recorded for this work order.', addAction: 'Log waste', totalLabel: 'Total: {kg} kg', col: { time: 'Time', category: 'Category', qty: 'Qty', reason: 'Reason' } },
  downtime: { title: 'Downtime events', empty: 'No downtime recorded for this work order.', addAction: 'Log downtime', openLabel: 'Open', col: { category: 'Category', start: 'Start', end: 'End', duration: 'Duration', reason: 'Reason' } },
  qa: { title: 'QA results', empty: 'No inspections linked to this work order yet.', total: 'Total', pass: 'Pass', hold: 'Hold', fail: 'Fail' },
  genealogy: { title: 'WO genealogy', empty: 'No consumption links yet — genealogy builds as LPs are scanned.', inputsLabel: 'Consumed inputs', fefoOk: 'FEFO', fefoDeviation: 'Deviation' },
  history: { title: 'Event log', empty: 'No events recorded for this work order yet.', sourceStatus: 'Status', sourceExecution: 'Execution', col: { time: 'Time', source: 'Source', action: 'Action', transition: 'Transition', reason: 'Reason' } },
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

function renderScreen(data = DATA) {
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
    }),
  );
}

describe('WoDetailScreen (parity: wo-detail.jsx:4-530)', () => {
  it('renders all 8 tabs in prototype order', () => {
    renderScreen();
    const order = ['overview', 'consumption', 'output', 'waste', 'downtime', 'qa', 'genealogy', 'history'];
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
      '/production/changeovers?lineId=bbbbbbbb-2222-2222-2222-222222222222',
    );
  });

  it('links to the bare register when the lineId is unknown', () => {
    renderWithGate({ lineId: null });
    expect(screen.getByTestId('wo-changeover-gate-link')).toHaveAttribute('href', '/production/changeovers');
  });
});
