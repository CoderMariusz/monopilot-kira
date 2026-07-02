/**
 * @vitest-environment jsdom
 *
 * LANE N1.5-G (C3) — CostingScreen "Compute costing" wiring (empty state).
 *
 * Behaviour contract:
 *   - the button-less empty state gains a primary "Compute costing" CTA that is
 *     ONLY rendered when the user can write (computeAction injected, projectId
 *     present) — gating resolved server-side, mirrored here;
 *   - clicking it calls computeAction({ projectId }) and refreshes on success
 *     (the persisted `target` breakdown then re-renders into the ready state);
 *   - errors are surfaced inline (role="alert"); the action's own message
 *     (e.g. "…has no complete ingredient costs") is preferred for invalid_input.
 *
 * i18n: every visible string comes from the injected labels.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CostingScreen, type CostingLabels, type CostingScreenData } from '../costing-screen';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

afterEach(() => cleanup());

const PROJECT_ID = 'c5cf521b-59f0-400f-8953-789cee335f1b';

const LABELS: CostingLabels = {
  title: 'Cost breakdown',
  subtitle: 'Waterfall from raw materials to final cost per kg',
  unitPerKg: 'Per kg',
  unitPerPack: 'Per pack',
  unitPerBatch: 'Per batch',
  waterfallTitle: 'Cost waterfall',
  colStep: 'Step',
  colValue: 'Value €/kg',
  colDelta: 'Δ %',
  marginTitle: 'Margin vs target price',
  colScenario: 'Scenario',
  colTargetPrice: 'Target price',
  colRevenue: 'Revenue €/kg',
  colCost: 'Cost €/kg',
  colMargin: 'Margin',
  colMarginPct: 'Margin %',
  marginWarn: 'Margin warn',
  marginWarnBody: 'At target price, margin is {marginPct}% — below the NPD minimum of {threshold}%.',
  hardFail: 'Margin hard fail',
  hardFailBody: 'Scenario "{name}" has a negative margin ({marginPct}%) and cannot be saved.',
  whatIfTitle: 'What-if sliders',
  sliderPorkContent: 'Raw cost €/kg',
  sliderYield: 'Yield %',
  sliderTargetPrice: 'Margin %',
  scenarioName: 'Scenario name',
  saveScenario: 'Save scenario',
  saving: 'Saving…',
  saveError: 'Could not save the scenario. Try again.',
  saved: 'Scenario saved.',
  loading: 'Loading costing data…',
  empty: 'No costing data yet',
  emptyBody: 'Costing is computed once the formulation has ingredient costs.',
  error: 'Unable to load costing data.',
  forbidden: 'You do not have permission to view costing data.',
  computeCosting: 'Compute costing',
  computing: 'Computing…',
  computeError: 'Could not compute the costing. Try again.',
  computeErrorNotFound: 'No formulation is available to compute costing from yet.',
  computeErrorNoCosts: 'Every ingredient needs a cost before costing can be computed.',
  computeErrorHardFail: 'The target margin is negative, so the breakdown cannot be saved.',
  recomputeCosting: 'Recompute',
};

// Ready-state fixture for the Recompute (non-empty) path.
const READY_DATA: CostingScreenData = {
  productCode: 'FA1001',
  projectId: PROJECT_ID,
  productName: 'Sliced Ham 200g',
  marginWarnThresholdPct: '15',
  steps: [
    { stepIndex: 1, stepName: 'Raw materials', label: 'Raw materials', valueEur: '15.1700', deltaPct: null },
    { stepIndex: 2, stepName: 'Retail', label: 'Retail', valueEur: '29.2908', deltaPct: '20.0000' },
  ],
  scenarios: [
    {
      scenario: 'target',
      name: 'Target',
      targetPriceEur: '19.9000',
      costEur: '18.4000',
      marginEur: '1.5000',
      marginPct: '7.5000',
      status: 'warn',
    },
  ],
  currentParams: {
    rawCostEur: '15.17',
    yieldPct: '78',
    processLabourEur: '1.52',
    packagingEur: '0.65',
    overheadEur: '1.00',
    logisticsEur: '0.50',
    marginPct: '7.5',
    distributorMarkupPct: '10',
    retailMarkupPct: '20',
  },
};

describe('C3 — Recompute costing (ready / non-empty state)', () => {
  it('renders the Recompute button in the ready state when write-gated', () => {
    render(
      <CostingScreen
        state="ready"
        data={READY_DATA}
        labels={LABELS}
        projectId={PROJECT_ID}
        computeAction={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getByTestId('costing-recompute')).toHaveTextContent(LABELS.recomputeCosting!);
  });

  it('does NOT render the Recompute button without an injected action (read-only)', () => {
    render(<CostingScreen state="ready" data={READY_DATA} labels={LABELS} projectId={PROJECT_ID} />);
    expect(screen.queryByTestId('costing-recompute')).not.toBeInTheDocument();
  });

  it('calls the SAME compute action with { projectId } and refreshes on success', async () => {
    const compute = vi.fn().mockResolvedValue({ ok: true });
    const onRefresh = vi.fn();
    render(
      <CostingScreen
        state="ready"
        data={READY_DATA}
        labels={LABELS}
        projectId={PROJECT_ID}
        computeAction={compute}
        onRefresh={onRefresh}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('costing-recompute'));
    });
    expect(compute).toHaveBeenCalledWith({ projectId: PROJECT_ID });
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it('shows a pending label and disables the button while recomputing', async () => {
    let resolve!: (v: { ok: boolean }) => void;
    const compute = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));
    render(
      <CostingScreen
        state="ready"
        data={READY_DATA}
        labels={LABELS}
        projectId={PROJECT_ID}
        computeAction={compute}
        onRefresh={vi.fn()}
      />,
    );
    const btn = screen.getByTestId('costing-recompute');
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.getByTestId('costing-recompute')).toBeDisabled();
    expect(screen.getByTestId('costing-recompute')).toHaveTextContent(LABELS.computing);
    await act(async () => {
      resolve({ ok: true });
    });
  });

  it('surfaces a compute error inline in the ready state', async () => {
    const compute = vi.fn().mockResolvedValue({ ok: false, error: 'invalid_input', message: 'no complete ingredient costs' });
    render(
      <CostingScreen
        state="ready"
        data={READY_DATA}
        labels={LABELS}
        projectId={PROJECT_ID}
        computeAction={compute}
        onRefresh={vi.fn()}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('costing-recompute'));
    });
    await waitFor(() => expect(screen.getByTestId('costing-compute-error')).toHaveTextContent('no complete ingredient costs'));
  });
});

describe('C3 — Compute costing (empty state)', () => {
  it('renders the Compute CTA in the empty state when write-gated', () => {
    render(
      <CostingScreen
        state="empty"
        data={null}
        labels={LABELS}
        projectId={PROJECT_ID}
        computeAction={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getByTestId('costing-compute')).toHaveTextContent(LABELS.computeCosting);
  });

  it('does NOT render the Compute CTA without an injected action (read-only / no write permission)', () => {
    render(<CostingScreen state="empty" data={null} labels={LABELS} projectId={PROJECT_ID} />);
    expect(screen.queryByTestId('costing-compute')).not.toBeInTheDocument();
  });

  it('does NOT render the Compute CTA in non-empty states (loading / error / permission_denied)', () => {
    for (const state of ['loading', 'error', 'permission_denied'] as const) {
      const { unmount } = render(
        <CostingScreen
          state={state}
          data={null}
          labels={LABELS}
          projectId={PROJECT_ID}
          computeAction={vi.fn().mockResolvedValue({ ok: true })}
        />,
      );
      expect(screen.queryByTestId('costing-compute')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('calls computeAction with { projectId } and refreshes on success', async () => {
    const compute = vi.fn().mockResolvedValue({ ok: true });
    const onRefresh = vi.fn();
    render(
      <CostingScreen
        state="empty"
        data={null}
        labels={LABELS}
        projectId={PROJECT_ID}
        computeAction={compute}
        onRefresh={onRefresh}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('costing-compute'));
    });
    expect(compute).toHaveBeenCalledWith({ projectId: PROJECT_ID });
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it('surfaces the action message inline for invalid_input (incomplete ingredient costs) and does NOT refresh', async () => {
    const compute = vi.fn().mockResolvedValue({
      ok: false,
      error: 'invalid_input',
      message: 'current formulation has no complete ingredient costs',
    });
    const onRefresh = vi.fn();
    render(
      <CostingScreen
        state="empty"
        data={null}
        labels={LABELS}
        projectId={PROJECT_ID}
        computeAction={compute}
        onRefresh={onRefresh}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('costing-compute'));
    });
    await waitFor(() => expect(screen.getByTestId('costing-compute-error')).toBeInTheDocument());
    expect(screen.getByTestId('costing-compute-error')).toHaveTextContent(
      'current formulation has no complete ingredient costs',
    );
    expect(screen.getByTestId('costing-compute-error')).toHaveAttribute('role', 'alert');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('maps not_found to a localized message when no action message is present', async () => {
    const compute = vi.fn().mockResolvedValue({ ok: false, error: 'not_found' });
    render(
      <CostingScreen
        state="empty"
        data={null}
        labels={LABELS}
        projectId={PROJECT_ID}
        computeAction={compute}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('costing-compute'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('costing-compute-error')).toHaveTextContent(LABELS.computeErrorNotFound),
    );
  });

  it('maps margin_hard_fail to its localized message', async () => {
    const compute = vi.fn().mockResolvedValue({ ok: false, error: 'margin_hard_fail' });
    render(
      <CostingScreen
        state="empty"
        data={null}
        labels={LABELS}
        projectId={PROJECT_ID}
        computeAction={compute}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('costing-compute'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('costing-compute-error')).toHaveTextContent(LABELS.computeErrorHardFail),
    );
  });

  it('maps forbidden to the localized forbidden label (never surfaces raw code)', async () => {
    // computeCosting returns { ok: false, error: 'forbidden' } when the action is called
    // outside of the server permission gate (e.g. race between tab open and role change).
    // The UI must show labels.forbidden, NOT the raw string 'forbidden'.
    const compute = vi.fn().mockResolvedValue({ ok: false, error: 'forbidden' });
    render(
      <CostingScreen
        state="empty"
        data={null}
        labels={LABELS}
        projectId={PROJECT_ID}
        computeAction={compute}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('costing-compute'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('costing-compute-error')).toHaveTextContent(LABELS.forbidden),
    );
    expect(screen.queryByText('forbidden')).not.toBeInTheDocument();
  });
});
