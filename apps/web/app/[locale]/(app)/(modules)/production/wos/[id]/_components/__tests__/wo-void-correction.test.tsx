/**
 * C-R2 — Reversibility UI: void/correction modal + corrected-row display.
 *
 * Spec-driven (no prototype void/correction screen exists in
 * prototypes/design/Monopilot Design System/production/); the e-sign block
 * mirrors quality/holds/_components/hold-release-modal.client.tsx. Tests the
 * pinned corrections-actions contract from the UI side (backend lanes build in
 * parallel — actions are MOCKED here):
 *
 *   - Output modal: e-sign field PRESENT; submit payload shape exact
 *     ({ outputId, reasonCode, note?, signature:{ password } }).
 *   - Waste modal: e-sign field ABSENT; submit payload exact
 *     ({ wasteId, reasonCode, note? }).
 *   - Closed-WO supervisor-authorization warning renders only when woClosed.
 *   - Typed-error mapping incl. lp_not_voidable + already_corrected → honest copy.
 *   - Optimistic submit disable while the action is in flight.
 *   - Screen: void affordances on Output/Waste rows (gated by actions context);
 *     corrected-row "Voided" badge + "Correction of #…" via the DEFENSIVE
 *     correctionOfId field (absent → renders normally; present → badges show and
 *     the void affordance is hidden on the corrected original).
 */
import fs from 'node:fs';
import path from 'node:path';

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const EVIDENCE_DIR = path.resolve(__dirname, '../../../../../../../../../e2e/artifacts/C-R2-void-correction');

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import {
  VoidCorrectionModal,
  type VoidModalLabels,
} from '../void-correction-modal';
import { WoDetailScreen, type WoDetailActions, type WoDetailLabels } from '../wo-detail-screen';
import { REVERSE_LABELS, LABOR_TAB_LABELS } from './reverse-labels.fixture';
import type { WorkOrderDetailData } from '../../../../_actions/get-work-order-detail';
import type { WoActionPermissions, WoModalLabels } from '../../../_components/modals/types';

const VC_LABELS: VoidModalLabels = {
  outputTitle: 'Void output {batch}',
  wasteTitle: 'Void {category} waste entry',
  intro: 'Voiding records a reversing correction entry.',
  reasonCode: 'Reason',
  reasonPlaceholder: 'Select a reason',
  reasonOptions: {
    entry_error: 'Entry error',
    wrong_quantity: 'Wrong quantity',
    wrong_batch: 'Wrong batch / lot',
    wrong_product: 'Wrong product',
    other: 'Other',
  },
  note: 'Note',
  noteOptional: 'optional',
  notePlaceholder: 'Add context for the correction',
  closedWarning: 'Voiding on a closed order requires supervisor authorization.',
  esign: {
    title: 'Electronic signature',
    meaning: 'Re-enter your password.',
    password: 'Password',
    passwordPlaceholder: 'Account password',
    passwordHelp: 'Account password, not a PIN.',
  },
  cancel: 'Cancel',
  submit: 'Void',
  submitting: 'Voiding…',
  errors: {
    forbidden: 'No permission to void.',
    not_found: 'Record gone — refresh.',
    invalid_state: 'No longer voidable.',
    invalid_input: 'Check the fields.',
    lp_not_voidable:
      "This output's pallet has already been released or allocated — it can no longer be voided directly.",
    already_corrected: 'This record has already been voided.',
    esign_failed: 'Signature failed — check your password.',
    persistence_failed: 'Unable to void.',
    generic: 'Unable to void.',
  },
  voidedBadge: 'Voided',
  correctionOfLabel: 'Correction of #{ref}',
};

function renderModal(
  overrides: Partial<React.ComponentProps<typeof VoidCorrectionModal>> = {},
) {
  const voidWoOutputAction = vi.fn(async () => ({ ok: true }) as const);
  const voidWasteEntryAction = vi.fn(async () => ({ ok: true }) as const);
  const onClose = vi.fn();
  const onVoided = vi.fn();
  const props: React.ComponentProps<typeof VoidCorrectionModal> = {
    open: true,
    target: { kind: 'output', id: 'o1', batchLabel: 'WO-0042-OUT-001' },
    woClosed: false,
    labels: VC_LABELS,
    voidWoOutputAction: voidWoOutputAction as never,
    voidWasteEntryAction: voidWasteEntryAction as never,
    onClose,
    onVoided,
    ...overrides,
  };
  render(React.createElement(VoidCorrectionModal, props));
  return { voidWoOutputAction, voidWasteEntryAction, onClose, onVoided };
}

describe('VoidCorrectionModal — OUTPUT (e-sign required)', () => {
  it('renders the e-sign password field and the output title with the batch', () => {
    renderModal({ target: { kind: 'output', id: 'o1', batchLabel: 'WO-0042-OUT-001' } });
    expect(screen.getByText('Void output WO-0042-OUT-001')).toBeInTheDocument();
    expect(screen.getByTestId('wo-void-esign')).toBeInTheDocument();
    expect(screen.getByTestId('wo-void-password')).toBeInTheDocument();
  });

  it('submits the EXACT pinned output payload incl. signature + trimmed note', async () => {
    const user = userEvent.setup();
    const { voidWoOutputAction, onVoided } = renderModal({
      target: { kind: 'output', id: 'out-9', batchLabel: 'B-9' },
    });
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Wrong quantity' }));
    await user.type(screen.getByTestId('wo-void-note'), '  re-weighed  ');
    await user.type(screen.getByTestId('wo-void-password'), 'hunter2');
    await user.click(screen.getByTestId('wo-void-submit'));

    await waitFor(() => expect(voidWoOutputAction).toHaveBeenCalledTimes(1));
    expect(voidWoOutputAction).toHaveBeenCalledWith({
      outputId: 'out-9',
      reasonCode: 'wrong_quantity',
      note: 're-weighed',
      signature: { password: 'hunter2' },
    });
    await waitFor(() => expect(onVoided).toHaveBeenCalled());
  });

  it('keeps submit disabled until a reason AND password are present (e-sign gate)', async () => {
    const user = userEvent.setup();
    renderModal();
    const submit = screen.getByTestId('wo-void-submit');
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    expect(submit).toBeDisabled(); // reason set, password still empty
    await user.type(screen.getByTestId('wo-void-password'), 'pw');
    expect(submit).toBeEnabled();
  });
});

describe('VoidCorrectionModal — WASTE (no e-sign)', () => {
  it('does NOT render the e-sign block and uses the waste title with the category', () => {
    renderModal({ target: { kind: 'waste', id: 'w1', categoryLabel: 'Trim' } });
    expect(screen.getByText('Void Trim waste entry')).toBeInTheDocument();
    expect(screen.queryByTestId('wo-void-esign')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wo-void-password')).not.toBeInTheDocument();
  });

  it('submits the EXACT pinned waste payload (no signature) and omits an empty note', async () => {
    const user = userEvent.setup();
    const { voidWasteEntryAction } = renderModal({
      target: { kind: 'waste', id: 'waste-3', categoryLabel: 'Trim' },
    });
    // No password field → submit enables on reason alone.
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Other' }));
    await user.click(screen.getByTestId('wo-void-submit'));

    await waitFor(() => expect(voidWasteEntryAction).toHaveBeenCalledTimes(1));
    expect(voidWasteEntryAction).toHaveBeenCalledWith({
      wasteId: 'waste-3',
      reasonCode: 'other',
      note: undefined,
    });
  });
});

describe('VoidCorrectionModal — closed-WO warning + error mapping', () => {
  it('renders the supervisor-authorization warning only when the WO is closed', () => {
    const { rerender } = render(
      React.createElement(VoidCorrectionModal, {
        open: true,
        target: { kind: 'output', id: 'o1', batchLabel: 'B' },
        woClosed: false,
        labels: VC_LABELS,
        voidWoOutputAction: (async () => ({ ok: true })) as never,
        voidWasteEntryAction: (async () => ({ ok: true })) as never,
        onClose: vi.fn(),
        onVoided: vi.fn(),
      }),
    );
    expect(screen.queryByTestId('wo-void-closed-warning')).not.toBeInTheDocument();

    rerender(
      React.createElement(VoidCorrectionModal, {
        open: true,
        target: { kind: 'output', id: 'o1', batchLabel: 'B' },
        woClosed: true,
        labels: VC_LABELS,
        voidWoOutputAction: (async () => ({ ok: true })) as never,
        voidWasteEntryAction: (async () => ({ ok: true })) as never,
        onClose: vi.fn(),
        onVoided: vi.fn(),
      }),
    );
    expect(screen.getByTestId('wo-void-closed-warning')).toHaveTextContent(
      'Voiding on a closed order requires supervisor authorization.',
    );
  });

  it('maps lp_not_voidable to the honest pallet copy', async () => {
    const user = userEvent.setup();
    renderModal({
      voidWoOutputAction: (async () => ({ ok: false, error: 'lp_not_voidable' })) as never,
    });
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    await user.type(screen.getByTestId('wo-void-password'), 'pw');
    await user.click(screen.getByTestId('wo-void-submit'));
    expect(await screen.findByTestId('wo-void-error')).toHaveTextContent(
      "This output's pallet has already been released or allocated — it can no longer be voided directly.",
    );
  });

  it('maps already_corrected to its honest copy', async () => {
    const user = userEvent.setup();
    renderModal({
      target: { kind: 'waste', id: 'w1', categoryLabel: 'Trim' },
      voidWasteEntryAction: (async () => ({ ok: false, error: 'already_corrected' })) as never,
    });
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    await user.click(screen.getByTestId('wo-void-submit'));
    expect(await screen.findByTestId('wo-void-error')).toHaveTextContent(
      'This record has already been voided.',
    );
  });

  it('maps esign_failed verbatim to its copy', async () => {
    const user = userEvent.setup();
    renderModal({
      voidWoOutputAction: (async () => ({ ok: false, error: 'esign_failed' })) as never,
    });
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    await user.type(screen.getByTestId('wo-void-password'), 'bad');
    await user.click(screen.getByTestId('wo-void-submit'));
    expect(await screen.findByTestId('wo-void-error')).toHaveTextContent(
      'Signature failed — check your password.',
    );
  });
});

// ── Screen-level: affordance gating + corrected-row display (defensive field). ──

const SCREEN_LABELS: WoDetailLabels = {
  status: { planned: 'Planned', in_progress: 'In progress', paused: 'Paused', completed: 'Completed', closed: 'Closed', cancelled: 'Cancelled' },
  deferredActionTitle: 'Wired next',
  changeoverGate: { title: 't', body: 'b', link: 'l' },
  headerActions: { start: 'Start', pause: 'Pause', resume: 'Resume', waste: 'Waste', catchWeight: 'Catch-weight', complete: 'Complete', cancel: 'Cancel', close: 'Close' },
  tabs: { overview: 'Overview', consumption: 'Consumption', output: 'Output', waste: 'Waste', downtime: 'Downtime', qa: 'QA results', genealogy: 'Genealogy', labor: 'Labor', history: 'Event log' },
  overview: { summaryTitle: 'Summary', kpisTitle: 'KPIs', wo: 'WO', product: 'Product', line: 'Line', machine: 'Machine', planned: 'Planned', output: 'Output', plannedWindow: 'Window', actualStart: 'Start', elapsed: 'Elapsed', allergens: 'Allergens', bomVersion: 'BOM v', consumption: 'Consumption', consumptionKpi: 'Consumption', outputKpi: 'Output', allergenYes: 'Yes', allergenNo: 'No', elapsedMin: 'min' },
  consumption: { title: 'Consumption', empty: 'none', addAction: 'Scan LP', col: { code: 'Code', component: 'Component', planned: 'Planned', consumed: 'Consumed', remaining: 'Remaining', progress: 'Progress' }, record: { trigger: 'Record', rowTrigger: 'Record', title: 't', subtitle: 's', material: 'm', materialPlaceholder: 'p', qty: 'q', qtyHint: 'h', lp: 'lp', lpLoading: 'l', lpEmpty: 'e', lpError: 'err', lpNone: 'none', lpSuggested: 'sug', reasonCode: 'r', reasonPlaceholder: 'rp', submit: 'sub', submitting: 'subbing', cancel: 'c', warningOver: 'w', warningClose: 'wc', errors: { forbidden: 'f', lp_unavailable: 'a', lp_not_released: 'nr', lp_expired: 'ex', lp_locked: 'lo', quality_hold_active: 'qh', reason_required: 'rr', invalid_material: 'im', invalid_qty: 'iq', generic: 'g' } } },
  output: { title: 'Registered output', empty: 'No output registered yet.', addAction: 'Register output', col: { type: 'Type', product: 'Product', qty: 'Qty', batch: 'Batch / lot', expiry: 'Expiry', qa: 'QA', lp: 'LP' }, qaPass: 'QA pass', qaFail: 'QA fail', qaDenied: 'denied', qaInvalidState: 'inv', qaError: 'err', voidAction: 'Void output…', noConsumptionBadge: 'No consumption', noConsumptionTooltip: 'No material consumption recorded for this WO — the output will have no genealogy/traceability link. Register consumption first, or continue.', noConsumptionContinue: 'Continue anyway' },
  waste: { title: 'Waste events', empty: 'none', addAction: 'Log waste', voidAction: 'Void entry…', totalLabel: 'Total: {kg} kg', col: { time: 'Time', category: 'Category', qty: 'Qty', reason: 'Reason' } },
  voidCorrection: VC_LABELS,
  downtime: { title: 'Downtime', empty: 'none', addAction: 'Log downtime', openLabel: 'Open', col: { category: 'Category', start: 'Start', end: 'End', duration: 'Duration', reason: 'Reason' } },
  qa: { title: 'QA', empty: 'none', total: 'Total', pass: 'Pass', hold: 'Hold', fail: 'Fail' },
  labor: LABOR_TAB_LABELS,
  genealogy: { title: 'Genealogy', empty: 'none', inputsLabel: 'Inputs', fefoOk: 'FEFO', fefoDeviation: 'Dev', reverseAction: 'Reverse…', reversedBadge: 'Reversed', correctionOfLabel: 'Correction of #{ref}' },
  reverseConsumption: REVERSE_LABELS,
  history: { title: 'Event log', empty: 'none', sourceStatus: 'Status', sourceExecution: 'Execution', col: { time: 'Time', source: 'Source', action: 'Action', transition: 'Transition', reason: 'Reason' } },
};

const PERMS: WoActionPermissions = { start: true, pause: true, resume: true, cancel: true, complete: true, close: true, outputWrite: true, wasteWrite: true };
const MODAL_LABELS = {
  cancel: 'Cancel', confirm: 'Confirm', submitting: 'Submitting…', errorFallback: 'fail',
  errors: { invalid_state_transition: 'x', quality_hold_active: 'x', forbidden: 'x', wo_not_recordable: 'x', closed_production_strict_failed: 'x', esign_failed: 'x' },
  start: { title: 't', subtitle: 's', line: 'Line', shift: 'Shift', optional: 'opt' },
  pause: { title: 't', subtitle: 's', reason: 'r', reasonPlaceholder: 'p', line: 'Line', shift: 'Shift', notes: 'n', noCategories: 'nc' },
  resume: { title: 't', subtitle: 's', duration: 'd', durationHint: 'h' },
  cancelWo: { title: 't', subtitle: 's', reasonCode: 'r', notes: 'n' },
  complete: { title: 't', subtitle: 's', override: 'o', overrideHint: 'h' },
  close: { title: 't', subtitle: 's', password: 'p', reason: 'r', legal: 'l' },
  output: { title: 't', subtitle: 's', type: 'ty', types: { primary: 'P', co_product: 'C', by_product: 'B' }, product: 'pr', qty: 'q', batch: 'b', batchHint: 'h' },
  waste: { title: 't', subtitle: 's', category: 'c', categoryPlaceholder: 'p', qty: 'q', shift: 'Shift', reasonCode: 'r', notes: 'n', noCategories: 'nc' },
} as unknown as WoModalLabels;

const ACTIONS: WoDetailActions = {
  locale: 'en',
  status: 'in_progress',
  permissions: PERMS,
  currentUserId: '22222222-2222-2222-2222-222222222222',
  downtimeCategories: [],
  wasteCategories: [],
  modalLabels: MODAL_LABELS,
};

const HEADER = {
  id: 'wo1', woNumber: 'WO-0042', productId: 'p', itemCode: 'FG-1', productName: 'Prod', status: 'in_progress' as const,
  lineId: 'L', lineCode: 'LINE-1', machineId: null, plannedQty: 1000, uom: 'kg', outputKg: 250, consumptionPct: 65, outputPct: 25,
  allergenGate: true, scheduledStart: null, scheduledEnd: null, startedAt: null, completedAt: null, elapsedMin: 120, bomVersion: 7,
};

function baseData(extra: Partial<WorkOrderDetailData> = {}): WorkOrderDetailData {
  return {
    header: HEADER as never,
    components: [],
    outputs: [
      { id: 'o1', outputType: 'primary', productId: 'fg', productCode: 'FG-1', productName: 'Prod', batchNumber: 'B-001', qtyKg: 250, uom: 'kg', qaStatus: 'PENDING', lpId: null, expiryDate: null },
    ],
    waste: [
      { id: 'w1', recordedAt: '2026-06-10T07:00:00.000Z', categoryName: 'Trim', qtyKg: 3.6, reasonNotes: null },
    ],
    downtime: [],
    genealogyInputs: [],
    history: [],
    qa: { total: 0, pass: 0, hold: 0, fail: 0 },
    openChangeoverId: null,
    hasOutputWithoutConsumption: false,
    ...extra,
  } as WorkOrderDetailData;
}

function renderScreenWithActions(data: WorkOrderDetailData, actions: WoDetailActions | null = ACTIONS) {
  return render(
    React.createElement(WoDetailScreen, {
      data,
      labels: SCREEN_LABELS,
      actions,
      releaseOutputQaAction: (async () => ({ ok: true, data: {} })) as never,
      recordConsumptionAction: (async () => ({ ok: true, data: {} })) as never,
      listConsumableLpsAction: (async () => ({ ok: true, data: { lps: [] } })) as never,
      voidWoOutputAction: (async () => ({ ok: true })) as never,
      voidWasteEntryAction: (async () => ({ ok: true })) as never,
      reverseConsumptionAction: (async () => ({ ok: true })) as never,
    }),
  );
}

describe('WoDetailScreen — void affordances + corrected-row display', () => {
  it('offers "Void output…" / "Void entry…" only when an action context resolved', async () => {
    const user = userEvent.setup();
    renderScreenWithActions(baseData());
    await user.click(screen.getByTestId('wo-detail-tab-output'));
    expect(screen.getByTestId('wo-output-void-o1')).toHaveTextContent('Void output…');
    await user.click(screen.getByTestId('wo-detail-tab-waste'));
    expect(screen.getByTestId('wo-waste-void-w1')).toHaveTextContent('Void entry…');
  });

  it('hides the void affordances entirely when there is no action context (read-only)', async () => {
    const user = userEvent.setup();
    renderScreenWithActions(baseData(), null);
    await user.click(screen.getByTestId('wo-detail-tab-output'));
    expect(screen.queryByTestId('wo-output-void-o1')).not.toBeInTheDocument();
  });

  it('opens the OUTPUT void modal (with e-sign) from the row affordance', async () => {
    const user = userEvent.setup();
    renderScreenWithActions(baseData());
    await user.click(screen.getByTestId('wo-detail-tab-output'));
    await user.click(screen.getByTestId('wo-output-void-o1'));
    expect(await screen.findByText('Void output B-001')).toBeInTheDocument();
    expect(screen.getByTestId('wo-void-password')).toBeInTheDocument();
  });

  it('DEFENSIVE: with correctionOfId ABSENT, rows render normally with no Voided/Correction badges', async () => {
    const user = userEvent.setup();
    renderScreenWithActions(baseData());
    await user.click(screen.getByTestId('wo-detail-tab-output'));
    expect(screen.queryByTestId('wo-output-voided-o1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wo-output-correction-o1')).not.toBeInTheDocument();
    // void affordance still offered on the un-corrected original
    expect(screen.getByTestId('wo-output-void-o1')).toBeInTheDocument();
  });

  it('DEFENSIVE: with correctionOfId PRESENT, marks the original Voided + labels the counter row + hides its void affordance', async () => {
    const user = userEvent.setup();
    const data = baseData({
      outputs: [
        { id: 'o1', outputType: 'primary', productId: 'fg', productCode: 'FG-1', productName: 'Prod', batchNumber: 'B-001', qtyKg: 250, uom: 'kg', qaStatus: 'PENDING', lpId: null, expiryDate: null },
        // counter (correction) row links back to o1
        { id: 'o2', outputType: 'primary', productId: 'fg', productCode: 'FG-1', productName: 'Prod', batchNumber: 'B-001-VOID', qtyKg: -250, uom: 'kg', qaStatus: 'PENDING', lpId: null, expiryDate: null, correctionOfId: 'o1' } as never,
      ],
    });
    renderScreenWithActions(data);
    await user.click(screen.getByTestId('wo-detail-tab-output'));
    // original o1 → Voided badge, void affordance gone
    expect(screen.getByTestId('wo-output-voided-o1')).toHaveTextContent('Voided');
    expect(screen.queryByTestId('wo-output-void-o1')).not.toBeInTheDocument();
    // counter o2 → "Correction of #o1…" badge, no void affordance on it either
    expect(screen.getByTestId('wo-output-correction-o2')).toHaveTextContent('Correction of #o1');
    expect(screen.queryByTestId('wo-output-void-o2')).not.toBeInTheDocument();
  });

  it('DEFENSIVE: waste correctionOfId PRESENT marks the original Voided + labels the counter row', async () => {
    const user = userEvent.setup();
    const data = baseData({
      waste: [
        { id: 'w1', recordedAt: '2026-06-10T07:00:00.000Z', categoryName: 'Trim', qtyKg: 3.6, reasonNotes: null },
        { id: 'w2', recordedAt: '2026-06-10T08:00:00.000Z', categoryName: 'Trim', qtyKg: -3.6, reasonNotes: null, correctionOfId: 'w1' } as never,
      ],
    });
    renderScreenWithActions(data);
    await user.click(screen.getByTestId('wo-detail-tab-waste'));
    expect(screen.getByTestId('wo-waste-voided-w1')).toHaveTextContent('Voided');
    expect(screen.queryByTestId('wo-waste-void-w1')).not.toBeInTheDocument();
    expect(screen.getByTestId('wo-waste-correction-w2')).toHaveTextContent('Correction of #w1');
  });

  it('renders the closed-WO supervisor warning inside the output void modal when status is closed', async () => {
    const user = userEvent.setup();
    const data = baseData();
    (data.header as { status: string }).status = 'closed';
    renderScreenWithActions(data, { ...ACTIONS, status: null });
    await user.click(screen.getByTestId('wo-detail-tab-output'));
    await user.click(screen.getByTestId('wo-output-void-o1'));
    expect(await screen.findByTestId('wo-void-closed-warning')).toBeInTheDocument();
    const modal = within(screen.getByTestId('wo-void-form'));
    expect(modal.getByText(/supervisor authorization/i)).toBeInTheDocument();
  });
});

// ── Parity evidence: per-state HTML captures + a11y report. ─────────────────────

describe('C-R2 — parity evidence capture (void modal states + a11y)', () => {
  function writeEvidence(name: string) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE_DIR, `${name}.html`), document.body.innerHTML, 'utf8');
  }

  it('captures output (e-sign), waste (no e-sign), closed-warning + error states', async () => {
    const user = userEvent.setup();

    // Output modal — e-sign present.
    const { unmount: u1 } = render(
      React.createElement(VoidCorrectionModal, {
        open: true, target: { kind: 'output', id: 'o1', batchLabel: 'B-001' }, woClosed: false,
        labels: VC_LABELS, voidWoOutputAction: (async () => ({ ok: true })) as never,
        voidWasteEntryAction: (async () => ({ ok: true })) as never, onClose: vi.fn(), onVoided: vi.fn(),
      }),
    );
    writeEvidence('state-output-esign');
    u1();

    // Waste modal — no e-sign.
    const { unmount: u2 } = render(
      React.createElement(VoidCorrectionModal, {
        open: true, target: { kind: 'waste', id: 'w1', categoryLabel: 'Trim' }, woClosed: false,
        labels: VC_LABELS, voidWoOutputAction: (async () => ({ ok: true })) as never,
        voidWasteEntryAction: (async () => ({ ok: true })) as never, onClose: vi.fn(), onVoided: vi.fn(),
      }),
    );
    writeEvidence('state-waste-no-esign');
    u2();

    // Closed-WO warning.
    const { unmount: u3 } = render(
      React.createElement(VoidCorrectionModal, {
        open: true, target: { kind: 'output', id: 'o1', batchLabel: 'B-001' }, woClosed: true,
        labels: VC_LABELS, voidWoOutputAction: (async () => ({ ok: true })) as never,
        voidWasteEntryAction: (async () => ({ ok: true })) as never, onClose: vi.fn(), onVoided: vi.fn(),
      }),
    );
    writeEvidence('state-closed-warning');
    u3();

    // Error state (lp_not_voidable).
    render(
      React.createElement(VoidCorrectionModal, {
        open: true, target: { kind: 'output', id: 'o1', batchLabel: 'B-001' }, woClosed: false,
        labels: VC_LABELS, voidWoOutputAction: (async () => ({ ok: false, error: 'lp_not_voidable' })) as never,
        voidWasteEntryAction: (async () => ({ ok: true })) as never, onClose: vi.fn(), onVoided: vi.fn(),
      }),
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    await user.type(screen.getByTestId('wo-void-password'), 'pw');
    await user.click(screen.getByTestId('wo-void-submit'));
    await screen.findByTestId('wo-void-error');
    writeEvidence('state-error-lp-not-voidable');
  });

  it('a11y — dialog role, labelled reason/note/password, alert-role error banner', async () => {
    // jest-axe/vitest-axe is not wired into apps/web vitest and adding it is out
    // of STRICT SCOPE (no package.json edits) — same documented substitute as the
    // catch-weight / allergen-panel evidence. RTL role/accessible-name assertions
    // stand in per UI-PROTOTYPE-PARITY-POLICY.md ("axe result OR documented blocker").
    const user = userEvent.setup();
    render(
      React.createElement(VoidCorrectionModal, {
        open: true, target: { kind: 'output', id: 'o1', batchLabel: 'B-001' }, woClosed: false,
        labels: VC_LABELS, voidWoOutputAction: (async () => ({ ok: false, error: 'forbidden' })) as never,
        voidWasteEntryAction: (async () => ({ ok: true })) as never, onClose: vi.fn(), onVoided: vi.fn(),
      }),
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Reason')).toBeInTheDocument();
    expect(screen.getByTestId('wo-void-note')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Reason')).toBeVisible();
    expect(screen.getByTestId('wo-void-password')).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    await user.type(screen.getByTestId('wo-void-password'), 'pw');
    await user.click(screen.getByTestId('wo-void-submit'));
    const err = await screen.findByTestId('wo-void-error');
    expect(err).toHaveAttribute('role', 'alert');

    const report = {
      tool: 'RTL role/accessible-name assertions',
      blocker:
        'jest-axe/vitest-axe not wired into apps/web vitest; adding it is out of STRICT SCOPE (no package.json edits). Same documented substitute as catch-weight + allergen-panel evidence.',
      checks: {
        dialogRole: dialog.getAttribute('role') === 'dialog',
        reasonSelectHasAccessibleName: true,
        passwordIsTypePassword: screen.getByTestId('wo-void-password').getAttribute('type') === 'password',
        errorBannerUsesAlertRole: err.getAttribute('role') === 'alert',
      },
      violations: [],
    };
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'a11y-report.json'), JSON.stringify(report, null, 2), 'utf8');
    expect(report.violations).toEqual([]);
  });
});
