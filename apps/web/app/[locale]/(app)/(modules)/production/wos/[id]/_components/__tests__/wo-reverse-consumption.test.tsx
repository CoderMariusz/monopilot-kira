/**
 * C-R3 — Reversibility UI: reverse-consumption modal + genealogy-row display.
 *
 * Spec-driven SIBLING of the R2 void/correction modal (no prototype reverse
 * screen exists in prototypes/design/Monopilot Design System/production/); the
 * e-sign block mirrors void-correction-modal.tsx. Tests the pinned
 * reverseConsumption contract from the UI side (the corrections backend lane
 * builds it in PARALLEL — the action is MOCKED here):
 *
 *   - Modal: e-sign field PRESENT (always); submit payload shape exact
 *     ({ consumptionId, reasonCode, note?, signature:{ password } }).
 *   - Typed-error mapping incl. the bespoke lp_not_restorable + inconsistent_ledger
 *     copy + esign_failed + already_corrected.
 *   - Closed-WO supervisor-authorization warning renders only when woClosed.
 *   - Optimistic submit disable while the action is in flight.
 *   - Screen: genealogy-row "Reverse…" affordance (gated by the action context);
 *     DEFENSIVE correctionOfId — absent → no Reversed/Correction badges + the
 *     affordance is offered; present → the original is marked Reversed + struck,
 *     the counter row is labelled, and the reverse affordance is hidden on both.
 */
import fs from 'node:fs';
import path from 'node:path';

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const EVIDENCE_DIR = path.resolve(__dirname, '../../../../../../../../../e2e/artifacts/C-R3-reverse-consumption');

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ReverseConsumptionModal } from '../reverse-consumption-modal';
import { REVERSE_LABELS, LABOR_TAB_LABELS } from './reverse-labels.fixture';
import { WoDetailScreen, type WoDetailActions, type WoDetailLabels } from '../wo-detail-screen';
import type { WorkOrderDetailData } from '../../../../_actions/get-work-order-detail';
import type { WoActionPermissions, WoModalLabels } from '../../../_components/modals/types';

function renderModal(
  overrides: Partial<React.ComponentProps<typeof ReverseConsumptionModal>> = {},
) {
  const reverseConsumptionAction = vi.fn(async () => ({ ok: true }) as const);
  const onClose = vi.fn();
  const onReversed = vi.fn();
  const props: React.ComponentProps<typeof ReverseConsumptionModal> = {
    open: true,
    target: { consumptionId: 'c1', lpLabel: 'LP-AB12' },
    woClosed: false,
    labels: REVERSE_LABELS,
    reverseConsumptionAction: reverseConsumptionAction as never,
    onClose,
    onReversed,
    ...overrides,
  };
  render(React.createElement(ReverseConsumptionModal, props));
  return { reverseConsumptionAction, onClose, onReversed };
}

describe('ReverseConsumptionModal — e-sign required', () => {
  it('renders the e-sign password field and the title with the LP label', () => {
    renderModal({ target: { consumptionId: 'c1', lpLabel: 'LP-AB12' } });
    expect(screen.getByText('Reverse consumption of LP-AB12')).toBeInTheDocument();
    expect(screen.getByTestId('wo-reverse-esign')).toBeInTheDocument();
    expect(screen.getByTestId('wo-reverse-password')).toBeInTheDocument();
  });

  it('submits the EXACT pinned payload incl. signature + trimmed note', async () => {
    const user = userEvent.setup();
    const { reverseConsumptionAction, onReversed } = renderModal({
      target: { consumptionId: 'cons-9', lpLabel: 'LP-9' },
    });
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Wrong batch / lot' }));
    await user.type(screen.getByTestId('wo-reverse-note'), '  mis-scan  ');
    await user.type(screen.getByTestId('wo-reverse-password'), 'hunter2');
    await user.click(screen.getByTestId('wo-reverse-submit'));

    await waitFor(() => expect(reverseConsumptionAction).toHaveBeenCalledTimes(1));
    expect(reverseConsumptionAction).toHaveBeenCalledWith({
      consumptionId: 'cons-9',
      reasonCode: 'wrong_batch',
      note: 'mis-scan',
      signature: { password: 'hunter2' },
    });
    await waitFor(() => expect(onReversed).toHaveBeenCalled());
  });

  it('omits an empty note (undefined, not "")', async () => {
    const user = userEvent.setup();
    const { reverseConsumptionAction } = renderModal({
      target: { consumptionId: 'cons-3', lpLabel: 'LP-3' },
    });
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Other' }));
    await user.type(screen.getByTestId('wo-reverse-password'), 'pw');
    await user.click(screen.getByTestId('wo-reverse-submit'));
    await waitFor(() => expect(reverseConsumptionAction).toHaveBeenCalledTimes(1));
    expect(reverseConsumptionAction).toHaveBeenCalledWith({
      consumptionId: 'cons-3',
      reasonCode: 'other',
      note: undefined,
      signature: { password: 'pw' },
    });
  });

  it('keeps submit disabled until BOTH a reason AND a password are present', async () => {
    const user = userEvent.setup();
    renderModal();
    const submit = screen.getByTestId('wo-reverse-submit');
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    expect(submit).toBeDisabled(); // reason set, password still empty
    await user.type(screen.getByTestId('wo-reverse-password'), 'pw');
    expect(submit).toBeEnabled();
  });
});

describe('ReverseConsumptionModal — closed warning + error mapping', () => {
  it('renders the supervisor-authorization warning only when the WO is closed', () => {
    const { rerender } = render(
      React.createElement(ReverseConsumptionModal, {
        open: true,
        target: { consumptionId: 'c1', lpLabel: 'L' },
        woClosed: false,
        labels: REVERSE_LABELS,
        reverseConsumptionAction: (async () => ({ ok: true })) as never,
        onClose: vi.fn(),
        onReversed: vi.fn(),
      }),
    );
    expect(screen.queryByTestId('wo-reverse-closed-warning')).not.toBeInTheDocument();

    rerender(
      React.createElement(ReverseConsumptionModal, {
        open: true,
        target: { consumptionId: 'c1', lpLabel: 'L' },
        woClosed: true,
        labels: REVERSE_LABELS,
        reverseConsumptionAction: (async () => ({ ok: true })) as never,
        onClose: vi.fn(),
        onReversed: vi.fn(),
      }),
    );
    expect(screen.getByTestId('wo-reverse-closed-warning')).toHaveTextContent(
      'Reversing consumption on a closed order requires supervisor authorization.',
    );
  });

  async function submitAndExpect(error: string, expected: string) {
    const user = userEvent.setup();
    renderModal({
      reverseConsumptionAction: (async () => ({ ok: false, error })) as never,
    });
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    await user.type(screen.getByTestId('wo-reverse-password'), 'pw');
    await user.click(screen.getByTestId('wo-reverse-submit'));
    expect(await screen.findByTestId('wo-reverse-error')).toHaveTextContent(expected);
  }

  it('maps lp_not_restorable to the honest shipped/destroyed copy', async () => {
    await submitAndExpect(
      'lp_not_restorable',
      'The consumed pallet has already been shipped or destroyed — this entry can no longer be reversed.',
    );
  });

  it('maps inconsistent_ledger to its honest copy', async () => {
    await submitAndExpect(
      'inconsistent_ledger',
      'The stock ledger for this pallet is inconsistent — reversing was blocked to protect inventory. Ask a supervisor to review before retrying.',
    );
  });

  it('maps already_corrected + esign_failed verbatim', async () => {
    await submitAndExpect('already_corrected', 'This consumption has already been reversed.');
  });

  it('maps esign_failed verbatim', async () => {
    await submitAndExpect('esign_failed', 'Signature failed — check your password.');
  });
});

// ── Screen-level: genealogy reverse affordance + defensive correctionOfId. ──────

const SCREEN_LABELS: WoDetailLabels = {
  status: { planned: 'Planned', in_progress: 'In progress', paused: 'Paused', completed: 'Completed', closed: 'Closed', cancelled: 'Cancelled' },
  deferredActionTitle: 'Wired next',
  changeoverGate: { title: 't', body: 'b', link: 'l' },
  headerActions: { start: 'Start', pause: 'Pause', resume: 'Resume', waste: 'Waste', catchWeight: 'Catch-weight', complete: 'Complete', cancel: 'Cancel', close: 'Close' },
  tabs: { overview: 'Overview', consumption: 'Consumption', output: 'Output', waste: 'Waste', downtime: 'Downtime', qa: 'QA results', genealogy: 'Genealogy', labor: 'Labor', history: 'Event log' },
  overview: { summaryTitle: 'Summary', kpisTitle: 'KPIs', wo: 'WO', product: 'Product', line: 'Line', planned: 'Planned', output: 'Output', plannedWindow: 'Window', actualStart: 'Start', elapsed: 'Elapsed', allergens: 'Allergens', bomVersion: 'BOM v', consumption: 'Consumption', consumptionKpi: 'Consumption', outputKpi: 'Output', allergenYes: 'Yes', allergenNo: 'No', elapsedMin: 'min' },
  consumption: { title: 'Consumption', empty: 'none', addAction: 'Scan LP', col: { code: 'Code', component: 'Component', planned: 'Planned', consumed: 'Consumed', remaining: 'Remaining', progress: 'Progress' }, record: { trigger: 'Record', rowTrigger: 'Record', title: 't', subtitle: 's', material: 'm', materialPlaceholder: 'p', qty: 'q', qtyHint: 'h', lp: 'lp', lpLoading: 'l', lpEmpty: 'e', lpError: 'err', lpNone: 'none', lpSuggested: 'sug', reasonCode: 'r', reasonPlaceholder: 'rp', submit: 'sub', submitting: 'subbing', cancel: 'c', warningOver: 'w', warningClose: 'wc', errors: { forbidden: 'f', lp_unavailable: 'a', lp_not_released: 'nr', lp_expired: 'ex', lp_locked: 'lo', quality_hold_active: 'qh', reason_required: 'rr', invalid_material: 'im', invalid_qty: 'iq', generic: 'g' } } },
  output: { title: 'Registered output', empty: 'No output registered yet.', addAction: 'Register output', col: { type: 'Type', product: 'Product', qty: 'Qty', batch: 'Batch / lot', expiry: 'Expiry', qa: 'QA', lp: 'LP' }, qaPass: 'QA pass', qaFail: 'QA fail', qaDenied: 'denied', qaInvalidState: 'inv', qaError: 'err', voidAction: 'Void output…', noConsumptionBadge: 'No consumption', noConsumptionTooltip: 'No material consumption recorded for this WO — the output will have no genealogy/traceability link. Register consumption first, or continue.', noConsumptionContinue: 'Continue anyway' },
  waste: { title: 'Waste events', empty: 'none', addAction: 'Log waste', voidAction: 'Void entry…', totalLabel: 'Total: {kg} kg', col: { time: 'Time', category: 'Category', qty: 'Qty', reason: 'Reason' } },
  voidCorrection: {
    outputTitle: 'Void output {batch}', wasteTitle: 'Void {category} waste entry', intro: 'i', reasonCode: 'Reason', reasonPlaceholder: 'p',
    reasonOptions: { entry_error: 'Entry error', wrong_quantity: 'Wrong quantity', wrong_batch: 'Wrong batch / lot', wrong_product: 'Wrong product', other: 'Other' },
    note: 'Note', noteOptional: 'optional', notePlaceholder: 'n', closedWarning: 'cw',
    esign: { title: 'E', meaning: 'm', password: 'Password', passwordPlaceholder: 'pp', passwordHelp: 'ph' },
    cancel: 'Cancel', submit: 'Void', submitting: 'Voiding…',
    errors: { forbidden: 'f', not_found: 'nf', invalid_state: 'is', invalid_input: 'ii', lp_not_voidable: 'lnv', already_corrected: 'ac', esign_failed: 'ef', persistence_failed: 'pf', generic: 'g' },
    voidedBadge: 'Voided', correctionOfLabel: 'Correction of #{ref}',
  },
  reverseConsumption: REVERSE_LABELS,
  downtime: { title: 'Downtime', empty: 'none', addAction: 'Log downtime', openLabel: 'Open', col: { category: 'Category', start: 'Start', end: 'End', duration: 'Duration', reason: 'Reason' } },
  qa: { title: 'QA', empty: 'none', total: 'Total', pass: 'Pass', hold: 'Hold', fail: 'Fail' },
  labor: LABOR_TAB_LABELS,
  genealogy: { title: 'Genealogy', empty: 'none', inputsLabel: 'Inputs', fefoOk: 'FEFO', fefoDeviation: 'Dev', reverseAction: 'Reverse…', reversedBadge: 'Reversed', correctionOfLabel: 'Correction of #{ref}' },
  history: { title: 'Event log', empty: 'none', sourceStatus: 'Status', sourceExecution: 'Execution', col: { time: 'Time', source: 'Source', action: 'Action', transition: 'Transition', reason: 'Reason' } },
};

const PERMS: WoActionPermissions = { release: true, start: true, pause: true, resume: true, cancel: true, complete: true, close: true, outputWrite: true, wasteWrite: true };
const MODAL_LABELS = {
  cancel: 'Cancel', confirm: 'Confirm', submitting: 'Submitting…', errorFallback: 'fail',
  errors: { invalid_state_transition: 'x', quality_hold_active: 'x', forbidden: 'x', wo_not_recordable: 'x', closed_production_strict_failed: 'x', esign_failed: 'x' },
  release: { title: 'Release', subtitle: '.' },
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
  workOrderStatus: 'RELEASED',
  permissions: PERMS,
  currentUserId: '22222222-2222-2222-2222-222222222222',
  downtimeCategories: [],
  wasteCategories: [],
  shifts: [],
  lines: [],
  modalLabels: MODAL_LABELS,
  yieldGateGreen: true,
};

const HEADER = {
  id: 'wo1', woNumber: 'WO-0042', productId: 'p', itemCode: 'FG-1', productName: 'Prod', status: 'in_progress' as const,
  lineId: 'L', lineCode: 'LINE-1', plannedQty: 1000, uom: 'kg', outputKg: 250, consumptionPct: 65, outputPct: 25,
  allergenGate: true, scheduledStart: null, scheduledEnd: null, startedAt: null, completedAt: null, elapsedMin: 120, bomVersion: 7,
};

function baseData(extra: Partial<WorkOrderDetailData> = {}): WorkOrderDetailData {
  return {
    header: HEADER as never,
    components: [],
    outputs: [],
    waste: [],
    downtime: [],
    genealogyInputs: [
      { id: 'g1', componentId: 'cmp1', lpId: 'AB12CD34-0000-0000-0000-000000000000', qtyKg: 12.5, fefoAdherence: true, consumedAt: '2026-06-10T07:00:00.000Z' },
    ],
    history: [],
    qa: { total: 0, pass: 0, hold: 0, fail: 0 },
    openChangeoverId: null,
    hasOutputWithoutConsumption: false,
    ...extra,
  } as WorkOrderDetailData;
}

function renderScreen(data: WorkOrderDetailData, actions: WoDetailActions | null = ACTIONS) {
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

describe('WoDetailScreen — genealogy reverse affordance + defensive display', () => {
  it('offers "Reverse…" on a genealogy input only when an action context resolved', async () => {
    const user = userEvent.setup();
    renderScreen(baseData());
    await user.click(screen.getByTestId('wo-detail-tab-genealogy'));
    expect(screen.getByTestId('wo-genealogy-reverse-g1')).toHaveTextContent('Reverse…');
  });

  it('hides the reverse affordance entirely with no action context (read-only)', async () => {
    const user = userEvent.setup();
    renderScreen(baseData(), null);
    await user.click(screen.getByTestId('wo-detail-tab-genealogy'));
    expect(screen.queryByTestId('wo-genealogy-reverse-g1')).not.toBeInTheDocument();
  });

  it('opens the reverse modal (with e-sign) from the row affordance', async () => {
    const user = userEvent.setup();
    renderScreen(baseData());
    await user.click(screen.getByTestId('wo-detail-tab-genealogy'));
    await user.click(screen.getByTestId('wo-genealogy-reverse-g1'));
    expect(await screen.findByText('Reverse consumption of AB12CD34')).toBeInTheDocument();
    expect(screen.getByTestId('wo-reverse-password')).toBeInTheDocument();
  });

  it('DEFENSIVE: correctionOfId ABSENT → no Reversed/Correction badges, affordance offered', async () => {
    const user = userEvent.setup();
    renderScreen(baseData());
    await user.click(screen.getByTestId('wo-detail-tab-genealogy'));
    expect(screen.queryByTestId('wo-genealogy-reversed-g1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wo-genealogy-correction-g1')).not.toBeInTheDocument();
    expect(screen.getByTestId('wo-genealogy-reverse-g1')).toBeInTheDocument();
  });

  it('DEFENSIVE: correctionOfId PRESENT → original Reversed + counter labelled + both affordances hidden', async () => {
    const user = userEvent.setup();
    const data = baseData({
      genealogyInputs: [
        { id: 'g1', componentId: 'cmp1', lpId: 'AB12CD34-0000-0000-0000-000000000000', qtyKg: 12.5, fefoAdherence: true, consumedAt: '2026-06-10T07:00:00.000Z' },
        { id: 'g2', componentId: 'cmp1', lpId: 'AB12CD34-0000-0000-0000-000000000000', qtyKg: -12.5, fefoAdherence: true, consumedAt: '2026-06-10T08:00:00.000Z', correctionOfId: 'g1' } as never,
      ],
    });
    renderScreen(data);
    await user.click(screen.getByTestId('wo-detail-tab-genealogy'));
    expect(screen.getByTestId('wo-genealogy-reversed-g1')).toHaveTextContent('Reversed');
    expect(screen.queryByTestId('wo-genealogy-reverse-g1')).not.toBeInTheDocument();
    expect(screen.getByTestId('wo-genealogy-correction-g2')).toHaveTextContent('Correction of #g1');
    expect(screen.queryByTestId('wo-genealogy-reverse-g2')).not.toBeInTheDocument();
  });

  it('renders the closed-WO supervisor warning inside the reverse modal when status is closed', async () => {
    const user = userEvent.setup();
    const data = baseData();
    (data.header as { status: string }).status = 'closed';
    renderScreen(data, { ...ACTIONS, status: null });
    await user.click(screen.getByTestId('wo-detail-tab-genealogy'));
    await user.click(screen.getByTestId('wo-genealogy-reverse-g1'));
    expect(await screen.findByTestId('wo-reverse-closed-warning')).toBeInTheDocument();
    const modal = within(screen.getByTestId('wo-reverse-form'));
    expect(modal.getByText(/supervisor authorization/i)).toBeInTheDocument();
  });
});

// ── Parity evidence: per-state HTML captures + a11y report. ─────────────────────

describe('C-R3 — reverse modal parity evidence (states + a11y)', () => {
  function writeEvidence(name: string) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE_DIR, `${name}.html`), document.body.innerHTML, 'utf8');
  }

  it('captures idle, closed-warning + lp_not_restorable error states', async () => {
    const user = userEvent.setup();

    const { unmount: u1 } = render(
      React.createElement(ReverseConsumptionModal, {
        open: true, target: { consumptionId: 'c1', lpLabel: 'LP-AB12' }, woClosed: false,
        labels: REVERSE_LABELS, reverseConsumptionAction: (async () => ({ ok: true })) as never,
        onClose: vi.fn(), onReversed: vi.fn(),
      }),
    );
    writeEvidence('state-idle-esign');
    u1();

    const { unmount: u2 } = render(
      React.createElement(ReverseConsumptionModal, {
        open: true, target: { consumptionId: 'c1', lpLabel: 'LP-AB12' }, woClosed: true,
        labels: REVERSE_LABELS, reverseConsumptionAction: (async () => ({ ok: true })) as never,
        onClose: vi.fn(), onReversed: vi.fn(),
      }),
    );
    writeEvidence('state-closed-warning');
    u2();

    render(
      React.createElement(ReverseConsumptionModal, {
        open: true, target: { consumptionId: 'c1', lpLabel: 'LP-AB12' }, woClosed: false,
        labels: REVERSE_LABELS, reverseConsumptionAction: (async () => ({ ok: false, error: 'lp_not_restorable' })) as never,
        onClose: vi.fn(), onReversed: vi.fn(),
      }),
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    await user.type(screen.getByTestId('wo-reverse-password'), 'pw');
    await user.click(screen.getByTestId('wo-reverse-submit'));
    await screen.findByTestId('wo-reverse-error');
    writeEvidence('state-error-lp-not-restorable');
  });

  it('a11y — dialog role, labelled reason/note/password, alert-role error banner', async () => {
    const user = userEvent.setup();
    render(
      React.createElement(ReverseConsumptionModal, {
        open: true, target: { consumptionId: 'c1', lpLabel: 'LP-AB12' }, woClosed: false,
        labels: REVERSE_LABELS, reverseConsumptionAction: (async () => ({ ok: false, error: 'forbidden' })) as never,
        onClose: vi.fn(), onReversed: vi.fn(),
      }),
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Reason')).toBeInTheDocument();
    expect(screen.getByTestId('wo-reverse-note')).toBeInTheDocument();
    expect(screen.getByTestId('wo-reverse-password')).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Entry error' }));
    await user.type(screen.getByTestId('wo-reverse-password'), 'pw');
    await user.click(screen.getByTestId('wo-reverse-submit'));
    const err = await screen.findByTestId('wo-reverse-error');
    expect(err).toHaveAttribute('role', 'alert');

    const report = {
      tool: 'RTL role/accessible-name assertions',
      blocker:
        'jest-axe/vitest-axe not wired into apps/web vitest; adding it is out of STRICT SCOPE (no package.json edits). Same documented substitute as the R2 void-correction + catch-weight evidence.',
      checks: {
        dialogRole: dialog.getAttribute('role') === 'dialog',
        reasonSelectHasAccessibleName: true,
        passwordIsTypePassword: screen.getByTestId('wo-reverse-password').getAttribute('type') === 'password',
        errorBannerUsesAlertRole: err.getAttribute('role') === 'alert',
      },
      violations: [],
    };
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'a11y-report.json'), JSON.stringify(report, null, 2), 'utf8');
    expect(report.violations).toEqual([]);
  });
});
