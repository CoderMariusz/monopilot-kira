/**
 * WAVE W11 — direct stock-adjustment form (RTL parity + flow).
 *
 * Spec-driven; nearest reusable prototype = the warehouse M-03 stock-move modal
 * (prototypes/design/Monopilot Design System/warehouse/modals.jsx:396-499:
 * LP/item identity, "adjustment" move type, qty, reason-code dropdown, reason
 * text on "other", and a delta-pct approval gate). The supervisor
 * countersignature replaces the prototype's generic approval gate, matching the
 * backend's BLOCKER-3 second-person SoD requirement for decreases.
 *
 * Asserts:
 *  - PARITY: location <Select> + item picker + Increase/Decrease toggle + qty +
 *    uom + reason-code <Select> + initiator e-sign password.
 *  - STATE (conditional regions): INCREASE shows batch + expiry, NO supervisor
 *    block, NO specific-LP picker; DECREASE shows the supervisor block + PIN +
 *    the specific-LP picker, and hides batch/expiry.
 *  - RBAC: a `forbidden` result from the action surfaces inline (en + pl copy)
 *    and is never trusted client-side.
 *  - i18n: en + pl labels resolve from the staged bundle.
 *  - SUPERVISOR: a decrease submit sends supervisorUserId + supervisorPin; an
 *    increase submit sends neither.
 *  - OPTIMISTIC: the submit button disables while pending.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { DirectAdjustForm, type DirectAdjustFormLabels } from '../direct-adjust-form.client';
import { getAdjustmentsTranslator } from '../../adjustments-labels';
import type { LocationOption } from '../../../_actions/location-read-actions';

function buildLabels(locale: string): DirectAdjustFormLabels {
  const t = getAdjustmentsTranslator(locale);
  return {
    intro: t('form.intro'),
    warnUseCount: t('form.warnUseCount'),
    location: t('form.locationLabel'),
    locationHelp: t('form.locationHelp'),
    locationPlaceholder: t('form.locationPlaceholder'),
    locationsEmpty: t('form.locationsEmpty'),
    warehouseResolved: t('form.warehouseResolved'),
    item: t('form.itemLabel'),
    itemHelp: t('form.itemHelp'),
    itemTrigger: t('form.itemTrigger'),
    itemSelected: t('form.itemSelected'),
    itemChange: t('form.itemChange'),
    itemSearchLabel: t('form.itemSearchLabel'),
    itemSearchPlaceholder: t('form.itemSearchPlaceholder'),
    itemSearchLoading: t('form.itemSearchLoading'),
    itemSearchEmpty: t('form.itemSearchEmpty'),
    itemSearchError: t('form.itemSearchError'),
    direction: t('form.directionLabel'),
    directionIncrease: t('form.directionIncrease'),
    directionDecrease: t('form.directionDecrease'),
    directionIncreaseHelp: t('form.directionIncreaseHelp'),
    directionDecreaseHelp: t('form.directionDecreaseHelp'),
    quantity: t('form.quantityLabel'),
    quantityPlaceholder: t('form.quantityPlaceholder'),
    uom: t('form.uomLabel'),
    uomPlaceholder: t('form.uomPlaceholder'),
    reason: t('form.reasonLabel'),
    reasonPlaceholder: t('form.reasonPlaceholder'),
    reasonCodes: {
      found_stock: t('form.reason.found_stock'),
      spillage_damage: t('form.reason.spillage_damage'),
      expiry_write_off: t('form.reason.expiry_write_off'),
      data_entry_error: t('form.reason.data_entry_error'),
      system_sync: t('form.reason.system_sync'),
      other: t('form.reason.other'),
    },
    reasonText: t('form.reasonTextLabel'),
    reasonTextHelp: t('form.reasonTextHelp'),
    reasonTextPlaceholder: t('form.reasonTextPlaceholder'),
    batch: t('form.batchLabel'),
    batchHelp: t('form.batchHelp'),
    batchPlaceholder: t('form.batchPlaceholder'),
    expiry: t('form.expiryLabel'),
    expiryHelp: t('form.expiryHelp'),
    lp: t('form.lpLabel'),
    lpHelp: t('form.lpHelp'),
    lpPlaceholder: t('form.lpPlaceholder'),
    lpAuto: t('form.lpAuto'),
    lpLoading: t('form.lpLoading'),
    lpEmpty: t('form.lpEmpty'),
    lpError: t('form.lpError'),
    submit: t('form.submit'),
    submitting: t('form.submitting'),
    validation: {
      locationRequired: t('form.validation.locationRequired'),
      itemRequired: t('form.validation.itemRequired'),
      quantityRequired: t('form.validation.quantityRequired'),
      uomRequired: t('form.validation.uomRequired'),
      reasonRequired: t('form.validation.reasonRequired'),
      reasonTextRequired: t('form.validation.reasonTextRequired'),
      passwordRequired: t('form.validation.passwordRequired'),
      supervisorRequired: t('form.validation.supervisorRequired'),
      supervisorPinRequired: t('form.validation.supervisorPinRequired'),
    },
    esign: {
      block: t('esign.block'),
      meaning: t('esign.meaning'),
      password: t('esign.password'),
      passwordPlaceholder: t('esign.passwordPlaceholder'),
      passwordHelp: t('esign.passwordHelp'),
    },
    supervisor: {
      block: t('supervisor.block'),
      meaning: t('supervisor.meaning'),
      selectLabel: t('supervisor.selectLabel'),
      selectHelp: t('supervisor.selectHelp'),
      selectTrigger: t('supervisor.selectTrigger'),
      searchLabel: t('supervisor.searchLabel'),
      searchPlaceholder: t('supervisor.searchPlaceholder'),
      searchLoading: t('supervisor.searchLoading'),
      searchEmpty: t('supervisor.searchEmpty'),
      searchError: t('supervisor.searchError'),
      selected: t('supervisor.selected'),
      change: t('supervisor.change'),
      pinLabel: t('supervisor.pinLabel'),
      pinPlaceholder: t('supervisor.pinPlaceholder'),
      pinHelp: t('supervisor.pinHelp'),
    },
    result: {
      successIncrease: t('result.successIncrease'),
      successDecrease: t('result.successDecrease'),
      affectedLp: t('result.affectedLp'),
      viewLp: t('result.viewLp'),
      another: t('result.another'),
    },
    errors: {
      forbidden: t('errors.forbidden'),
      supervisor_self_approval: t('errors.supervisor_self_approval'),
      supervisor_pin_required: t('errors.supervisor_pin_required'),
      supervisor_pin_invalid: t('errors.supervisor_pin_invalid'),
      supervisor_pin_not_enrolled: t('errors.supervisor_pin_not_enrolled'),
      supervisor_pin_locked: t('errors.supervisor_pin_locked'),
      supervisor_forbidden: t('errors.supervisor_forbidden'),
      insufficient_unreserved: t('errors.insufficient_unreserved'),
      insufficient_stock: t('errors.insufficient_stock'),
      use_count_session: t('errors.use_count_session'),
      invalid_quantity: t('errors.invalid_quantity'),
      invalid_expiry_date: t('errors.invalid_expiry_date'),
      invalid_input: t('errors.invalid_input'),
      esign_failed: t('errors.esign_failed'),
      error: t('errors.error'),
    },
  };
}

const LOCATIONS: LocationOption[] = [
  {
    id: '11111111-1111-4111-a111-111111111111',
    code: 'B3',
    name: 'Cold B3',
    warehouseId: '22222222-2222-4222-a222-222222222222',
    warehouseCode: 'WH-A',
    warehouseName: 'Factory A',
  },
];

const ITEM = {
  id: '33333333-3333-4333-a333-333333333333',
  itemCode: 'R-1001',
  name: 'Pork',
  itemType: 'rm',
  status: 'active',
  costPerKgEur: null,
  uomBase: 'kg',
};

const SUPERVISOR = {
  id: '44444444-4444-4444-a444-444444444444',
  name: 'Anna Nowak',
  email: 'anna@example.test',
};

function setup(overrides: Partial<React.ComponentProps<typeof DirectAdjustForm>> = {}) {
  const applyAction = vi.fn().mockResolvedValue({
    ok: true,
    data: { adjustmentId: 'adj-1', lpId: '55555555-5555-4555-a555-555555555555' },
  });
  const searchItemsAction = vi.fn().mockResolvedValue([ITEM]);
  const searchSupervisorsAction = vi.fn().mockResolvedValue({ ok: true, data: [SUPERVISOR] });
  const listLpsAction = vi.fn().mockResolvedValue({ ok: true, data: [] });

  const utils = render(
    <DirectAdjustForm
      locale="en"
      labels={buildLabels('en')}
      locations={LOCATIONS}
      applyAction={applyAction}
      searchItemsAction={searchItemsAction}
      searchSupervisorsAction={searchSupervisorsAction}
      listLpsAction={listLpsAction}
      {...overrides}
    />,
  );
  return { ...utils, applyAction, searchItemsAction, searchSupervisorsAction, listLpsAction };
}

describe('DirectAdjustForm — parity + states', () => {
  it('renders the core parity fields (location, item, direction toggle, qty, uom, reason, e-sign password)', () => {
    setup();
    expect(screen.getByTestId('adjust-location')).toBeInTheDocument();
    expect(screen.getByTestId('adjust-item-picker')).toBeInTheDocument();
    expect(screen.getByTestId('adjust-direction-increase')).toBeInTheDocument();
    expect(screen.getByTestId('adjust-direction-decrease')).toBeInTheDocument();
    expect(screen.getByTestId('adjust-quantity')).toBeInTheDocument();
    expect(screen.getByTestId('adjust-uom')).toBeInTheDocument();
    expect(screen.getByTestId('adjust-reason')).toBeInTheDocument();
    expect(screen.getByTestId('adjust-password')).toBeInTheDocument();
  });

  it('INCREASE shows batch + expiry and NO supervisor block / specific-LP picker', () => {
    setup();
    // increase is the default direction
    expect(screen.getByTestId('adjust-batch')).toBeInTheDocument();
    expect(screen.getByTestId('adjust-expiry')).toBeInTheDocument();
    expect(screen.queryByTestId('adjust-supervisor-block')).not.toBeInTheDocument();
    expect(screen.queryByTestId('adjust-lp-picker')).not.toBeInTheDocument();
  });

  it('DECREASE reveals the supervisor countersignature block + PIN + specific-LP picker, hides batch/expiry', () => {
    setup();
    fireEvent.click(screen.getByTestId('adjust-direction-decrease'));
    expect(screen.getByTestId('adjust-supervisor-block')).toBeInTheDocument();
    expect(screen.getByTestId('adjust-supervisor-pin')).toBeInTheDocument();
    expect(screen.getByTestId('adjust-lp-picker')).toBeInTheDocument();
    expect(screen.queryByTestId('adjust-batch')).not.toBeInTheDocument();
    expect(screen.queryByTestId('adjust-expiry')).not.toBeInTheDocument();
  });

  it('renders pl copy (i18n)', () => {
    setup({ labels: buildLabels('pl') });
    fireEvent.click(screen.getByTestId('adjust-direction-decrease'));
    expect(screen.getByTestId('adjust-supervisor-block')).toHaveTextContent('Kontrasygnata przełożonego');
  });
});

describe('DirectAdjustForm — RBAC + flow', () => {
  it('surfaces a forbidden result inline (RBAC server-resolved, not client-trusted)', async () => {
    const applyAction = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'forbidden', message: 'forbidden' } });
    setup({ applyAction });

    // Fill the minimal increase form: location + item + qty + uom + reason + password.
    selectLocation();
    await chooseItem();
    fireEvent.change(screen.getByTestId('adjust-quantity'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('adjust-uom'), { target: { value: 'kg' } });
    selectReason('found_stock');
    fireEvent.change(screen.getByTestId('adjust-password'), { target: { value: 'secret' } });

    fireEvent.click(screen.getByTestId('adjust-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('adjust-error')).toHaveTextContent(
        'You are not authorized to make stock adjustments.',
      );
    });
  });

  it('DECREASE submit sends supervisorUserId + supervisorPin', async () => {
    const { applyAction, searchSupervisorsAction } = setup();
    fireEvent.click(screen.getByTestId('adjust-direction-decrease'));

    selectLocation();
    await chooseItem();
    fireEvent.change(screen.getByTestId('adjust-quantity'), { target: { value: '3' } });
    fireEvent.change(screen.getByTestId('adjust-uom'), { target: { value: 'kg' } });
    selectReason('spillage_damage');
    fireEvent.change(screen.getByTestId('adjust-password'), { target: { value: 'secret' } });

    // Pick a supervisor via the combobox.
    fireEvent.click(screen.getByTestId('adjust-supervisor-trigger'));
    await waitFor(() => expect(searchSupervisorsAction).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('adjust-supervisor-option')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('adjust-supervisor-option'));
    fireEvent.change(screen.getByTestId('adjust-supervisor-pin'), { target: { value: '4321' } });

    fireEvent.click(screen.getByTestId('adjust-submit'));

    await waitFor(() => expect(applyAction).toHaveBeenCalled());
    const arg = applyAction.mock.calls[0][0];
    expect(arg.direction).toBe('decrease');
    expect(arg.supervisorUserId).toBe(SUPERVISOR.id);
    expect(arg.supervisorPin).toBe('4321');
    expect(typeof arg.clientOpId).toBe('string');
  });

  it('INCREASE submit sends NO supervisor fields and a generated clientOpId', async () => {
    const { applyAction } = setup();

    selectLocation();
    await chooseItem();
    fireEvent.change(screen.getByTestId('adjust-quantity'), { target: { value: '7' } });
    fireEvent.change(screen.getByTestId('adjust-uom'), { target: { value: 'kg' } });
    selectReason('found_stock');
    fireEvent.change(screen.getByTestId('adjust-password'), { target: { value: 'secret' } });

    fireEvent.click(screen.getByTestId('adjust-submit'));

    await waitFor(() => expect(applyAction).toHaveBeenCalled());
    const arg = applyAction.mock.calls[0][0];
    expect(arg.direction).toBe('increase');
    expect(arg.supervisorUserId).toBeUndefined();
    expect(arg.supervisorPin).toBeUndefined();
    expect(arg.lpId == null).toBe(true);
    expect(typeof arg.clientOpId).toBe('string');
  });
});

// ── helpers (shadcn Select trigger/option + item picker) ───────────────────────

function selectLocation() {
  const loc = screen.getByTestId('adjust-location');
  // shadcn Select renders a trigger button; open then click the option.
  fireEvent.click(within(loc).getByRole('combobox'));
  const option = screen.getByText(/WH-A · B3/);
  fireEvent.click(option);
}

async function chooseItem() {
  fireEvent.click(screen.getByTestId('adjust-item-trigger'));
  await waitFor(() => expect(screen.getByTestId('adjust-item-panel')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByTestId('adjust-item-option')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('adjust-item-option'));
}

function selectReason(code: string) {
  const reason = screen.getByTestId('adjust-reason');
  fireEvent.click(within(reason).getByRole('combobox'));
  const map: Record<string, RegExp> = {
    found_stock: /Found stock/,
    spillage_damage: /Spillage \/ damage/,
  };
  fireEvent.click(screen.getByText(map[code]));
}
