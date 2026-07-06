/**
 * F13 — WO detail header must not show a DOUBLE Start affordance.
 *
 * A WO whose execution row has not been created yet (actions.status === null)
 * but which is already RELEASED in Planning is legitimately startable — the
 * list Start already works. The header used to ALSO render a disabled
 * "Release this order in Planning first" Start placeholder whenever
 * actions.status === null, which for a RELEASED WO reads as a second, dead
 * Start button next to the working one.
 *
 * The fix hides that disabled placeholder when the normalized WO status is
 * RELEASED. This test asserts:
 *   - RELEASED + null execution status → the disabled Start placeholder is GONE;
 *   - DRAFT + null execution status → the disabled placeholder still renders
 *     (the "release first" hint is still the correct affordance there).
 *
 * The header render (wo-detail-screen.tsx) is exercised directly with a non-null
 * action context; the WoActionsProvider modal internals are NOT under test, so
 * modalLabels is a passthrough bundle (mirrors wo-consume-modal.test.tsx).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { WoDetailScreen, type WoDetailLabels, type WoDetailActions } from '../wo-detail-screen';
import { REVERSE_LABELS, LABOR_TAB_LABELS } from './reverse-labels.fixture';
import type { WorkOrderDetailData } from '../../../../_actions/get-work-order-detail';
import { buildWoModalLabels } from '../../../../_actions/wo-modal-labels';

const LABELS = {
  status: { planned: 'Planned', in_progress: 'In progress', paused: 'Paused', completed: 'Completed', closed: 'Closed', cancelled: 'Cancelled' },
  deferredActionTitle: 'Wired later',
  headerActions: {
    start: 'Start', pause: 'Pause', resume: 'Resume', waste: 'Waste', catchWeight: 'Catch-weight',
    complete: 'Complete', cancel: 'Cancel', close: 'Close',
    release: 'Release', startReleaseHint: 'Release this work order in Planning first.',
  },
  tabs: { overview: 'Overview', consumption: 'Consumption', output: 'Output', waste: 'Waste', downtime: 'Downtime', qa: 'QA results', genealogy: 'Genealogy', labor: 'Labor', history: 'Event log' },
  overview: {
    summaryTitle: 'Work order summary', kpisTitle: 'KPIs', wo: 'WO', product: 'Product', line: 'Line',
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
      lp: 'License plate (FEFO)', lpLoading: 'Loading…', lpEmpty: 'No LPs.', lpError: 'Unable to load LPs.', lpNone: '— no LP —',
      lpSuggested: 'suggested', submit: 'Record consumption', reasonCode: 'Manual reason code', reasonPlaceholder: 'Required without an LP',
      submitting: 'Recording…', cancel: 'Cancel', warningOver: 'Over by {pct}%.', warningClose: 'Close',
      errors: { forbidden: 'No permission.', lp_unavailable: 'No stock.', lp_not_released: 'Not released.', lp_expired: 'Expired.', lp_locked: 'Locked.', quality_hold_active: 'On hold.', reason_required: 'Reason required.', invalid_material: 'Invalid.', invalid_qty: 'Enter qty.', generic: 'Unable.' },
    },
  },
  output: {
    title: 'Registered output', empty: 'No output.', addAction: 'Register output',
    col: { type: 'Type', product: 'Product', qty: 'Qty', batch: 'Batch', expiry: 'Expiry', qa: 'QA', lp: 'LP' },
    qaPass: 'QA pass', qaFail: 'QA fail', qaDenied: 'No QA permission', qaInvalidState: 'Not pending', qaError: 'Unable to update QA',
    voidAction: 'Void output…', noConsumptionBadge: 'No consumption',
    noConsumptionTooltip: 'No consumption recorded.', noConsumptionContinue: 'Continue anyway',
  },
  waste: { title: 'Waste events', empty: 'No waste.', addAction: 'Log waste', voidAction: 'Void entry…', totalLabel: 'Total: {kg} kg', col: { time: 'Time', category: 'Category', qty: 'Qty', reason: 'Reason' } },
  voidCorrection: {
    outputTitle: 'Void output {batch}', wasteTitle: 'Void {category} waste entry', intro: 'Voiding records a reversing entry.',
    reasonCode: 'Reason', reasonPlaceholder: 'Select a reason',
    reasonOptions: { entry_error: 'Entry error', wrong_quantity: 'Wrong quantity', wrong_batch: 'Wrong batch / lot', wrong_product: 'Wrong product', other: 'Other' },
    note: 'Note', noteOptional: 'optional', notePlaceholder: 'Add context',
    closedWarning: 'Requires supervisor authorization.',
    esign: { title: 'Electronic signature', meaning: 'Re-enter your password.', password: 'Password', passwordPlaceholder: 'Account password', passwordHelp: 'Account password, not a PIN.' },
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
} as unknown as WoDetailLabels;

const DATA = {
  header: {
    id: '11111111-1111-1111-1111-111111111111', woNumber: 'WO-2026-0042',
    productId: 'aaaaaaaa-1111-1111-1111-111111111111', itemCode: 'FG-TEST-01', productName: 'Test Product A',
    // A released-but-not-started WO: no execution row yet, so the desktop
    // "status" the screen shows is planned; the null runtime status is carried
    // by the ACTION context (below), which is what gates the header buttons.
    status: 'planned', lineId: 'bbbbbbbb-2222-2222-2222-222222222222', lineCode: 'LINE-1',
    plannedQty: 1000, uom: 'kg', outputKg: 0, consumptionPct: 0, outputPct: 0, allergenGate: true,
    scheduledStart: '2026-06-10T06:00:00.000Z', scheduledEnd: '2026-06-10T14:00:00.000Z', startedAt: null,
    completedAt: null, elapsedMin: null, bomVersion: 7,
  },
  components: [], outputs: [], waste: [], downtime: [], genealogyInputs: [], history: [],
  qa: { total: 0, pass: 0, hold: 0, fail: 0 },
  openChangeoverId: null,
  hasOutputWithoutConsumption: false,
} as unknown as WorkOrderDetailData;

/**
 * Non-null action context with a NULL runtime execution status (no execution
 * row created yet) — the exact condition that renders the disabled Start
 * placeholder. `workOrderStatus` is varied per test. Permissions are all false
 * so no real WoActionTrigger renders and only the placeholder is at issue.
 * modalLabels is a passthrough bundle so the WoActionsProvider mounts without
 * crashing (its modals are not under test).
 */
function makeActions(workOrderStatus: string): WoDetailActions {
  return {
    locale: 'en',
    status: null,
    workOrderStatus,
    permissions: { release: false, start: false, pause: false, resume: false, cancel: false, complete: false, close: false, outputWrite: false, wasteWrite: false },
    currentUserId: 'u1',
    downtimeCategories: [],
    wasteCategories: [],
    shifts: [],
    lines: [],
    modalLabels: buildWoModalLabels((k: string) => k),
  } as unknown as WoDetailActions;
}

function renderScreen(actions: WoDetailActions) {
  return render(
    React.createElement(WoDetailScreen, {
      data: DATA,
      labels: LABELS,
      actions,
      releaseOutputQaAction: (async () => ({ ok: true, data: {} })) as never,
      recordConsumptionAction: (async () => ({ ok: true })) as never,
      listConsumableLpsAction: (async () => ({ ok: true, data: { lps: [] } })) as never,
      voidWoOutputAction: (async () => ({ ok: true })) as never,
      voidWasteEntryAction: (async () => ({ ok: true })) as never,
      reverseConsumptionAction: (async () => ({ ok: true })) as never,
    }),
  );
}

afterEach(cleanup);

describe('WoDetailScreen — F13 no double Start on a RELEASED WO', () => {
  it('hides the disabled "release first" Start placeholder when the WO is RELEASED', () => {
    renderScreen(makeActions('RELEASED'));
    expect(screen.queryByTestId('wo-action-start-disabled')).not.toBeInTheDocument();
  });

  it('normalizes case/whitespace so a lowercase " released " status is still treated as RELEASED', () => {
    renderScreen(makeActions('  released  '));
    expect(screen.queryByTestId('wo-action-start-disabled')).not.toBeInTheDocument();
  });

  it('still shows the disabled placeholder for a DRAFT (not yet released) WO', () => {
    renderScreen(makeActions('DRAFT'));
    const placeholder = screen.getByTestId('wo-action-start-disabled');
    expect(placeholder).toBeDisabled();
    expect(placeholder).toHaveAttribute('title', LABELS.headerActions.startReleaseHint);
  });
});
