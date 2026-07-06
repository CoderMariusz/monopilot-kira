/**
 * P2-MODALS — WO execution action wiring: RTL parity + payload + state-gate +
 * error-surface + RBAC tests.
 *
 * Tests the orchestrator (<WoActionsProvider> + <WoActionTrigger>) and the modals
 * against a MOCKED fetch so we assert the EXACT handler payload shapes without a
 * live route. next/navigation is stubbed (router.refresh / no real navigation).
 *
 *   - state-gating: Start only when planned; Pause only in_progress; Resume only
 *     paused; Complete in_progress; Close completed (gating.ts mirrors the state
 *     machine TRANSITIONS) — so the UI never offers a guaranteed-409 action.
 *   - RBAC: a permission=false hides the trigger even when state-legal.
 *   - payload: Start posts { transactionId, lineId, shiftId }; Pause posts
 *     { transactionId, reasonCategoryId, lineId, … }; Output posts snake_case
 *     { transaction_id, output_type, product_id, qty_kg }; Waste posts
 *     { transaction_id, category_code, qty_kg, shift_id }.
 *   - error surface: a handler { error:<code> } renders the VERBATIM-mapped i18n
 *     copy inline (role=alert).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { WoActionsProvider, WoActionTrigger } from '../wo-actions';
import type { WoActionPermissions, WoModalLabels, WoState } from '../types';

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
  errors: {
    invalid_state_transition: 'This action is not valid for the work order’s current state.',
    quality_hold_active: 'Blocked by an active quality hold on this work order.',
    forbidden: 'You do not have permission to perform this action.',
    wo_not_recordable: 'The work order is not in a state that accepts this record.',
    closed_production_strict_failed: 'Output yield gate not met.',
    esign_failed: 'E-signature failed — check your password and try again.',
  },
  release: { title: 'Release to production', subtitle: 'Release this work order.' },
  start: { title: 'Start work order', subtitle: 'Begin execution.', line: 'Line', shift: 'Shift', optional: 'optional' },
  pause: { title: 'Pause work order', subtitle: 'Open downtime.', reason: 'Downtime reason', reasonPlaceholder: 'Select…', line: 'Line', linePlaceholder: 'Select a line…', noLines: 'No lines configured.', shift: 'Shift', shiftPlaceholder: 'Select a shift…', notes: 'Notes', noCategories: 'No categories' },
  resume: { title: 'Resume work order', subtitle: 'Resume.', duration: 'Actual downtime (minutes)', durationHint: 'Optional' },
  cancelWo: { title: 'Cancel work order', subtitle: 'Cancel.', reasonCode: 'Reason code', notes: 'Notes' },
  complete: { title: 'Complete work order', subtitle: 'Complete.', override: 'Override reason code', overrideHint: 'Required to override.' },
  close: { title: 'Close work order', subtitle: 'Financial close.', password: 'Password', reason: 'Reason', legal: 'You electronically sign this close.' },
  output: { title: 'Register output', subtitle: 'Record output.', type: 'Output type', types: { primary: 'Primary', co_product: 'Co-product', by_product: 'By-product' }, product: 'Product ID', qty: 'Quantity (kg)', batch: 'Batch number', batchHint: 'Auto when blank.' },
  waste: { title: 'Log waste', subtitle: 'Record waste.', category: 'Waste category', categoryPlaceholder: 'Select…', qty: 'Quantity (kg)', shift: 'Shift', shiftPlaceholder: 'Select a shift…', reasonCode: 'Reason code', notes: 'Notes', noCategories: 'No categories' },
  shifts: { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' },
};

const DOWNTIME_CATS = [{ id: '00000000-0000-0000-0000-0000000000c1', code: 'STOP', name: 'Unplanned stop' }];
const WASTE_CATS = [{ code: 'SCRAP', name: 'Scrap' }];
const SHIFTS = [
  { code: 'morning', name: 'Morning' },
  { code: 'afternoon', name: 'Afternoon' },
  { code: 'night', name: 'Night' },
];
const LINES = [
  { id: 'LINE-1', code: 'L1' },
  { id: 'LINE-2', code: 'L2' },
];

function Harness({
  status,
  permissions = ALL_PERMS,
}: {
  status: WoState | null;
  permissions?: WoActionPermissions;
}) {
  return (
    <WoActionsProvider
      locale="en"
      woId="11111111-1111-1111-1111-111111111111"
      status={status}
      workOrderStatus={status === null ? 'DRAFT' : 'RELEASED'}
      permissions={permissions}
      labels={LABELS}
      currentUserId="22222222-2222-2222-2222-222222222222"
      downtimeCategories={DOWNTIME_CATS}
      wasteCategories={WASTE_CATS}
      shifts={SHIFTS}
      lines={LINES}
      defaultLineId="LINE-1"
      defaultProductId="33333333-3333-3333-3333-333333333333"
      yieldGateGreen
    >
      <WoActionTrigger kind="release" label="Release to production" />
      <WoActionTrigger kind="start" label="Start" />
      <WoActionTrigger kind="pause" label="Pause" />
      <WoActionTrigger kind="resume" label="Resume" />
      <WoActionTrigger kind="complete" label="Complete" />
      <WoActionTrigger kind="close" label="Close" />
      <WoActionTrigger kind="cancel" label="Cancel" />
      <WoActionTrigger kind="output" label="Register output" testid="wo-action-output" />
      <WoActionTrigger kind="waste" label="Log waste" testid="wo-action-waste-trigger" />
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

function mockFetchError(code: string, status = 409) {
  return vi.fn(async () => new Response(JSON.stringify({ ok: false, error: code }), { status }));
}

beforeEach(() => {
  refresh.mockClear();
  // jsdom lacks crypto.randomUUID in some envs — provide a deterministic stub.
  if (!('randomUUID' in crypto)) {
    // @ts-expect-error augment for test
    crypto.randomUUID = () => '99999999-9999-4999-8999-999999999999';
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('WO action gating (state + RBAC)', () => {
  it('planned offers Start + Cancel only (no Pause/Resume/Complete/Close)', () => {
    render(<Harness status="planned" />);
    expect(screen.getByTestId('wo-action-start')).toBeInTheDocument();
    expect(screen.getByTestId('wo-action-cancel')).toBeInTheDocument();
    expect(screen.queryByTestId('wo-action-pause')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wo-action-resume')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wo-action-complete')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wo-action-close')).not.toBeInTheDocument();
  });

  it('in_progress offers Pause/Complete/Cancel/Output/Waste (no Start/Resume/Close)', () => {
    render(<Harness status="in_progress" />);
    expect(screen.getByTestId('wo-action-pause')).toBeInTheDocument();
    expect(screen.getByTestId('wo-action-complete')).toBeInTheDocument();
    expect(screen.getByTestId('wo-action-output')).toBeInTheDocument();
    expect(screen.getByTestId('wo-action-waste-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('wo-action-start')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wo-action-resume')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wo-action-close')).not.toBeInTheDocument();
  });

  it('paused offers Resume (not Pause); completed offers Close (not Complete)', () => {
    const { rerender } = render(<Harness status="paused" />);
    expect(screen.getByTestId('wo-action-resume')).toBeInTheDocument();
    expect(screen.queryByTestId('wo-action-pause')).not.toBeInTheDocument();

    rerender(<Harness status="completed" />);
    expect(screen.getByTestId('wo-action-close')).toBeInTheDocument();
    expect(screen.queryByTestId('wo-action-complete')).not.toBeInTheDocument();
  });

  it('closed / cancelled offer no actions (terminal)', () => {
    const { rerender } = render(<Harness status="closed" />);
    expect(screen.queryByTestId('wo-action-start')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wo-action-cancel')).not.toBeInTheDocument();
    rerender(<Harness status="cancelled" />);
    expect(screen.queryByTestId('wo-action-cancel')).not.toBeInTheDocument();
  });

  it('RBAC: a denied permission hides the trigger even when state-legal', () => {
    render(<Harness status="in_progress" permissions={{ ...ALL_PERMS, pause: false }} />);
    expect(screen.queryByTestId('wo-action-pause')).not.toBeInTheDocument();
    // complete still allowed → visible
    expect(screen.getByTestId('wo-action-complete')).toBeInTheDocument();
  });

  it('draft work orders offer Release when npd.planning.write is granted', () => {
    render(<Harness status={null} />);
    expect(screen.getByTestId('wo-action-release')).toBeInTheDocument();
    expect(screen.queryByTestId('wo-action-start')).not.toBeInTheDocument();
  });

  it('release permission=false hides the Release trigger', () => {
    render(<Harness status={null} permissions={{ ...ALL_PERMS, release: false }} />);
    expect(screen.queryByTestId('wo-action-release')).not.toBeInTheDocument();
  });
});

describe('WO action payloads (mock fetch)', () => {
  it('Release posts to the Planning-backed release adapter with the locale prefix', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    const user = userEvent.setup();
    render(<Harness status={null} />);

    await user.click(screen.getByTestId('wo-action-release'));
    await user.click(screen.getByTestId('wo-release-confirm'));

    await waitFor(() => expect(captured.url).toBeDefined());
    expect(captured.url).toBe('/en/production/work-orders/11111111-1111-1111-1111-111111111111/release');
    expect(captured.body).toEqual({});
    expect(refresh).toHaveBeenCalled();
  });

  it('Start posts { transactionId, lineId, shiftId } from the line/shift dropdowns (F15)', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    // The design-system Select paints `.select__item` with pointer-events that
    // jsdom can't compute — disable the pointer-events guard for the option click.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness status="planned" />);

    await user.click(screen.getByTestId('wo-action-start'));
    // F15 — line + shift are now Select comboboxes (not free-text inputs).
    const lineTrigger = screen.getByTestId('wo-start-line');
    const shiftTrigger = screen.getByTestId('wo-start-shift');
    expect(lineTrigger).toHaveAttribute('role', 'combobox');
    expect(shiftTrigger).toHaveAttribute('role', 'combobox');
    expect(lineTrigger.tagName).not.toBe('INPUT');
    // Change line away from its WO default (LINE-1) to LINE-2, pick the afternoon shift.
    await user.click(lineTrigger);
    await user.click(screen.getByRole('option', { name: 'L2' }));
    await user.click(shiftTrigger);
    await user.click(screen.getByRole('option', { name: 'Afternoon' }));
    await user.click(screen.getByTestId('wo-start-confirm'));

    await waitFor(() => expect(captured.url).toBeDefined());
    expect(captured.url).toBe('/en/production/work-orders/11111111-1111-1111-1111-111111111111/start');
    // The line submits the production_line_id (LINE-2); the shift submits its code.
    expect(captured.body).toMatchObject({ lineId: 'LINE-2', shiftId: 'afternoon' });
    expect(typeof captured.body.transactionId).toBe('string');
    expect(refresh).toHaveBeenCalled();
  });

  it('Pause posts { transactionId, reasonCategoryId, lineId } from the category select', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    // The design-system Select paints `.select__item` with pointer-events that
    // jsdom can't compute — disable the pointer-events guard for the option click.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness status="in_progress" />);

    await user.click(screen.getByTestId('wo-action-pause'));
    // open the select + pick the category
    await user.click(screen.getByTestId('wo-pause-reason'));
    await user.click(screen.getByRole('option', { name: 'Unplanned stop' }));
    // The line defaults to the WO line (LINE-1); confirm without touching it.
    await user.click(screen.getByTestId('wo-pause-confirm'));

    await waitFor(() => expect(captured.url).toBeDefined());
    expect(captured.url).toContain('/pause');
    expect(captured.body).toMatchObject({
      reasonCategoryId: '00000000-0000-0000-0000-0000000000c1',
      lineId: 'LINE-1',
    });
    expect(typeof captured.body.transactionId).toBe('string');
  });

  it('Pause renders a LINE dropdown defaulting to the WO line and submits the chosen line', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness status="in_progress" />);

    await user.click(screen.getByTestId('wo-action-pause'));
    // The line control is a Select (combobox), NOT a free-text input.
    const lineTrigger = screen.getByTestId('wo-pause-line');
    expect(lineTrigger).toHaveAttribute('role', 'combobox');
    // It is NOT a text input — the operator cannot type a free-text line.
    expect(lineTrigger.tagName).not.toBe('INPUT');

    // pick the downtime reason (still mandatory) then change the line away from
    // its default (LINE-1) to LINE-2.
    await user.click(screen.getByTestId('wo-pause-reason'));
    await user.click(screen.getByRole('option', { name: 'Unplanned stop' }));
    await user.click(lineTrigger);
    await user.click(screen.getByRole('option', { name: 'L2' }));
    await user.click(screen.getByTestId('wo-pause-confirm'));

    await waitFor(() => expect(captured.url).toBeDefined());
    expect(captured.url).toContain('/pause');
    expect(captured.body).toMatchObject({ lineId: 'LINE-2' });
  });

  it('Pause submits the WO default line when left untouched (defaultLineId preselected)', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness status="in_progress" />);

    await user.click(screen.getByTestId('wo-action-pause'));
    await user.click(screen.getByTestId('wo-pause-reason'));
    await user.click(screen.getByRole('option', { name: 'Unplanned stop' }));
    // Confirm is enabled because the WO line (LINE-1) is preselected — proving the
    // mandatory line defaults to the WO's assigned line.
    expect(screen.getByTestId('wo-pause-confirm')).not.toBeDisabled();
    await user.click(screen.getByTestId('wo-pause-confirm'));

    await waitFor(() => expect(captured.url).toBeDefined());
    expect(captured.body).toMatchObject({ lineId: 'LINE-1' });
  });

  it('Register output posts snake_case { transaction_id, output_type, product_id, qty_kg }', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    const user = userEvent.setup();
    render(<Harness status="in_progress" />);

    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '120.5');
    await user.click(screen.getByTestId('wo-output-confirm'));

    await waitFor(() => expect(captured.url).toBeDefined());
    expect(captured.url).toContain('/outputs');
    expect(captured.body).toMatchObject({
      output_type: 'primary',
      product_id: '33333333-3333-3333-3333-333333333333',
      qty_kg: '120.5',
    });
    expect(typeof captured.body.transaction_id).toBe('string');
    // qty_kg must be a STRING (handler rejects JS numbers).
    expect(typeof captured.body.qty_kg).toBe('string');
  });

  it('Log waste posts { transaction_id, category_code, qty_kg, shift_id }', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness status="in_progress" />);

    await user.click(screen.getByTestId('wo-action-waste-trigger'));
    await user.click(screen.getByTestId('wo-waste-category'));
    await user.click(screen.getByRole('option', { name: 'Scrap' }));
    await user.type(screen.getByTestId('wo-waste-qty'), '4.5');
    // Shift is a dropdown now — pick from the shift options.
    await user.click(screen.getByTestId('wo-waste-shift'));
    await user.click(screen.getByRole('option', { name: 'Afternoon' }));
    await user.click(screen.getByTestId('wo-waste-confirm'));

    await waitFor(() => expect(captured.url).toBeDefined());
    expect(captured.url).toContain('/waste');
    expect(captured.body).toMatchObject({
      category_code: 'SCRAP',
      qty_kg: '4.5',
      shift_id: 'afternoon',
    });
    expect(typeof captured.body.transaction_id).toBe('string');
  });

  it('Waste renders a SHIFT dropdown (combobox, not free text) and stays mandatory until a shift is picked', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness status="in_progress" />);

    await user.click(screen.getByTestId('wo-action-waste-trigger'));
    const shiftTrigger = screen.getByTestId('wo-waste-shift');
    // It is a Select trigger (combobox role), NOT a text input.
    expect(shiftTrigger).toHaveAttribute('role', 'combobox');

    // Category + qty filled but no shift yet → confirm stays disabled (mandatory).
    await user.click(screen.getByTestId('wo-waste-category'));
    await user.click(screen.getByRole('option', { name: 'Scrap' }));
    await user.type(screen.getByTestId('wo-waste-qty'), '2');
    expect(screen.getByTestId('wo-waste-confirm')).toBeDisabled();

    // Pick a shift → now submittable.
    await user.click(shiftTrigger);
    await user.click(screen.getByRole('option', { name: 'Morning' }));
    expect(screen.getByTestId('wo-waste-confirm')).not.toBeDisabled();

    await user.click(screen.getByTestId('wo-waste-confirm'));
    await waitFor(() => expect(captured.url).toBeDefined());
    expect(captured.body).toMatchObject({ shift_id: 'morning' });
  });

  it('Close (e-sign) posts { transactionId, signerUserId, pin, reason }', async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal('fetch', mockFetchOk(captured));
    const user = userEvent.setup();
    render(<Harness status="completed" />);

    await user.click(screen.getByTestId('wo-action-close'));
    await user.type(screen.getByTestId('wo-close-password'), 'secret-pw');
    await user.type(screen.getByTestId('wo-close-reason'), 'End of run');
    await user.click(screen.getByTestId('wo-close-confirm'));

    await waitFor(() => expect(captured.url).toBeDefined());
    expect(captured.url).toContain('/close');
    expect(captured.body).toMatchObject({
      signerUserId: '22222222-2222-2222-2222-222222222222',
      pin: 'secret-pw',
      reason: 'End of run',
    });
  });
});

describe('WO action error surfacing (verbatim handler codes)', () => {
  it('surfaces invalid_state_transition copy inline (role=alert) and does NOT refresh', async () => {
    vi.stubGlobal('fetch', mockFetchError('invalid_state_transition', 409));
    const user = userEvent.setup();
    render(<Harness status="in_progress" />);

    await user.click(screen.getByTestId('wo-action-complete'));
    await user.click(screen.getByTestId('wo-complete-confirm'));

    const alert = await screen.findByTestId('wo-complete-error');
    expect(alert).toHaveTextContent('This action is not valid for the work order’s current state.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('surfaces quality_hold_active copy on a blocked Register output', async () => {
    vi.stubGlobal('fetch', mockFetchError('quality_hold_active', 409));
    const user = userEvent.setup();
    render(<Harness status="in_progress" />);

    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '10');
    await user.click(screen.getByTestId('wo-output-confirm'));

    const alert = await screen.findByTestId('wo-output-error');
    expect(alert).toHaveTextContent('Blocked by an active quality hold on this work order.');
  });

  it('falls back to generic copy for an unmapped error code', async () => {
    vi.stubGlobal('fetch', mockFetchError('some_unmapped_code', 500));
    const user = userEvent.setup();
    render(<Harness status="planned" />);

    await user.click(screen.getByTestId('wo-action-start'));
    await user.click(screen.getByTestId('wo-start-confirm'));

    const alert = await screen.findByTestId('wo-start-error');
    expect(alert).toHaveTextContent('The action could not be completed.');
  });
});
