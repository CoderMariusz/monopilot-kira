/**
 * @vitest-environment jsdom
 * WAVE E2B — GRN delivery-condition temperature control (cold chain).
 *
 * Asserts the per-line control calls submitConditionCheck with
 * { grnItemId, lpId, itemId, measuredTempC }, renders the green in-range result
 * and the red out-of-range result with the created quality-hold reference (no raw
 * UUID), fires onRecorded() on success, and is disabled (with tooltip) when the
 * caller lacks quality.coldchain.record.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GrnTempCheck,
  type GrnTempCheckLabels,
  type SubmitTempCheckInput,
  type SubmitTempCheckResult,
} from './grn-temp-check.client';

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const GRN_ITEM_ID = '22222222-2222-4222-8222-222222222222';
const LP_ID = '33333333-3333-4333-8333-333333333333';
const HOLD_ID = '44444444-4444-4444-8444-444444444444';

const labels: GrnTempCheckLabels = {
  action: 'Record temp',
  recording: 'Recording…',
  inputLabel: 'Delivery temperature in degrees Celsius',
  inputPlaceholder: '°C',
  inRange: 'In range',
  outOfRange: 'Out of range — quality hold {holdNumber} created.',
  outOfRangeNoHold: 'Out of range — a quality hold was created.',
  forbidden: 'Insufficient permissions: quality.coldchain.record is required.',
  invalidInput: 'Enter a valid temperature in °C.',
  noRange: 'No temperature range is configured for this product.',
  error: 'The temperature could not be recorded. Try again.',
};

function renderControl(
  submit: (input: SubmitTempCheckInput) => Promise<SubmitTempCheckResult>,
  overrides: Partial<React.ComponentProps<typeof GrnTempCheck>> = {},
) {
  const onRecorded = vi.fn();
  const utils = render(
    <GrnTempCheck
      itemId={ITEM_ID}
      grnItemId={GRN_ITEM_ID}
      lpId={LP_ID}
      labels={labels}
      canRecord
      submitConditionCheck={submit}
      onRecorded={onRecorded}
      {...overrides}
    />,
  );
  return { onRecorded, ...utils };
}

describe('E2B GRN temp-check control', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('records the measured temperature and calls submitConditionCheck with the line + item refs', async () => {
    const user = userEvent.setup();
    const submit = vi.fn(async (): Promise<SubmitTempCheckResult> => ({ ok: true, inRange: true }));
    const { onRecorded } = renderControl(submit);
    await user.type(screen.getByLabelText(/delivery temperature/i), '2.5');
    await user.click(screen.getByTestId(`grn-temp-check-submit-${GRN_ITEM_ID}`));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith({
      grnItemId: GRN_ITEM_ID,
      lpId: LP_ID,
      itemId: ITEM_ID,
      measuredTempC: 2.5,
    });
    expect(onRecorded).toHaveBeenCalledTimes(1);
  });

  it('shows the green in-range result', async () => {
    const user = userEvent.setup();
    const submit = vi.fn(async (): Promise<SubmitTempCheckResult> => ({ ok: true, inRange: true }));
    renderControl(submit);
    await user.type(screen.getByLabelText(/delivery temperature/i), '3');
    await user.click(screen.getByTestId(`grn-temp-check-submit-${GRN_ITEM_ID}`));
    const ok = await screen.findByTestId(`grn-temp-check-in-range-${GRN_ITEM_ID}`);
    expect(ok).toHaveAttribute('data-in-range', 'true');
    expect(ok).toHaveTextContent(/in range/i);
  });

  it('shows the red out-of-range result with the created quality-hold reference (no raw UUID)', async () => {
    const user = userEvent.setup();
    const submit = vi.fn(
      async (): Promise<SubmitTempCheckResult> => ({ ok: true, inRange: false, holdId: HOLD_ID, holdNumber: 'QH-2026-0042' }),
    );
    const { onRecorded } = renderControl(submit);
    await user.type(screen.getByLabelText(/delivery temperature/i), '14');
    await user.click(screen.getByTestId(`grn-temp-check-submit-${GRN_ITEM_ID}`));
    const bad = await screen.findByTestId(`grn-temp-check-out-of-range-${GRN_ITEM_ID}`);
    expect(bad).toHaveAttribute('role', 'alert');
    expect(bad).toHaveAttribute('data-in-range', 'false');
    expect(bad).toHaveTextContent(/out of range/i);
    expect(bad).toHaveTextContent('QH-2026-0042');
    // the raw hold UUID must never leak into the UI
    expect(bad.textContent ?? '').not.toContain(HOLD_ID);
    expect(onRecorded).toHaveBeenCalledTimes(1);
  });

  it('disables the control and exposes the permission in the accessible name when canRecord is false', async () => {
    const submit = vi.fn(async (): Promise<SubmitTempCheckResult> => ({ ok: true, inRange: true }));
    renderControl(submit, { canRecord: false });
    const button = screen.getByTestId(`grn-temp-check-submit-${GRN_ITEM_ID}`);
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleName(/quality\.coldchain\.record/i);
    expect(submit).not.toHaveBeenCalled();
  });

  it('surfaces the no-range error when the action reports no configured range', async () => {
    const user = userEvent.setup();
    const submit = vi.fn(async (): Promise<SubmitTempCheckResult> => ({ ok: false, error: 'no_range_configured' }));
    renderControl(submit);
    await user.type(screen.getByLabelText(/delivery temperature/i), '5');
    await user.click(screen.getByTestId(`grn-temp-check-submit-${GRN_ITEM_ID}`));
    expect(await screen.findByTestId(`grn-temp-check-error-${GRN_ITEM_ID}`)).toHaveTextContent(/no temperature range is configured/i);
  });
});
