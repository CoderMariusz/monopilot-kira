/**
 * @vitest-environment jsdom
 * W2-L6 — CostingScreen 3-column waterfall + inputs panel + blocked checklist.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    'data-testid'?: string;
    className?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import {
  CostingScreen,
  type CostingInputsView,
  type CostingLabels,
  type CostingScreenData,
  type CostEngineResult,
} from '../costing-screen';

afterEach(() => cleanup());

const ENGINE_RESULT: CostEngineResult = {
  status: 'ok',
  missing: [],
  units: {
    packWeightKg: '0.2',
    packsPerCase: 6,
    avgBatchQty: '120',
    fgBaseUom: 'kg',
    packsPerBatch: '600',
  },
  steps: [
    { key: 'raw_materials', valuePerPackEur: '1.0000' },
    { key: 'yield_loss', valuePerPackEur: '1.1000' },
    { key: 'process_labour', valuePerPackEur: '1.2000' },
    { key: 'setup', valuePerPackEur: '0.0500' },
    { key: 'packaging', valuePerPackEur: '0.1500' },
    { key: 'overhead', valuePerPackEur: '0.0800' },
    { key: 'logistics', valuePerPackEur: '0.0400' },
    { key: 'total', valuePerPackEur: '1.6200' },
    { key: 'margin', valuePerPackEur: '0.1800' },
  ],
};

const INPUTS: CostingInputsView = {
  avgBatchQty: '120',
  fgBaseUom: 'kg',
  overheadPerKgOverride: '',
  logisticsPerBoxOverride: '0.25',
  orgOverheadPerKg: '0.50',
  orgLogisticsPerBox: '0.30',
  weeklyVolumePacks: '10000',
  runsPerWeek: '5',
};

const LABELS: CostingLabels = {
  title: 'Cost breakdown',
  subtitle: 'Waterfall per pack with kg and batch columns',
  waterfallTitle: 'Cost waterfall',
  colStep: 'Step',
  colPerKg: '£/kg',
  colPerPack: '£/pack',
  colPerBatch: '£/batch',
  inputsTitle: 'Costing inputs',
  inputAvgBatch: 'Avg batch qty',
  inputOverhead: 'Overhead override (£/kg)',
  inputLogistics: 'Logistics override (£/box)',
  inputWeeklyVolume: 'Weekly volume (packs)',
  inputRunsPerWeek: 'Runs per week',
  editInBrief: 'Edit in Brief',
  saveInputs: 'Save inputs',
  savingInputs: 'Saving…',
  savedInputs: 'Inputs saved',
  saveInputsError: 'Could not save inputs',
  blockedTitle: 'Costing blocked',
  blockedPrefix: 'Complete:',
  notDerivable: '—',
  loading: 'Loading…',
  empty: 'No costing data',
  emptyBody: 'Compute costing first',
  error: 'Error',
  forbidden: 'Forbidden',
  computeCosting: 'Compute',
  computing: 'Computing…',
  computeError: 'Compute failed',
  computeErrorNotFound: 'Not found',
  computeErrorNoCosts: 'No costs',
  computeErrorHardFail: 'Hard fail',
  marginNegativeWarn: 'Negative margin',
  marginNegativeWarnBody: 'Margin is {marginPct}',
};

const DATA: CostingScreenData = {
  productCode: 'FG-001',
  projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  productName: 'Test FG',
  marginWarnThresholdPct: '15',
  engineResult: ENGINE_RESULT,
  inputs: INPUTS,
};

function renderReady(extra?: Partial<React.ComponentProps<typeof CostingScreen>>) {
  return render(
    <CostingScreen
      state="ready"
      data={DATA}
      labels={LABELS}
      locale="en"
      projectId={DATA.projectId}
      canSaveInputs
      {...extra}
    />,
  );
}

describe('CostingScreen — 3-column waterfall', () => {
  it('renders nine waterfall rows in canonical order without unit toggle', () => {
    renderReady();
    expect(screen.queryByRole('button', { name: 'Per kg' })).not.toBeInTheDocument();
    const rows = screen.getAllByTestId('waterfall-row');
    expect(rows).toHaveLength(9);
    const labels = rows.map((r) => r.textContent);
    expect(labels[0]).toContain('Surowce');
    expect(labels[7]).toContain('Koszt całkowity');
    expect(labels[8]).toContain('Marża');
  });

  it('derives £/kg and £/batch from per-pack values', () => {
    renderReady();
    const rmRow = screen.getAllByTestId('waterfall-row')[0]!;
    expect(within(rmRow).getByText('£5.00')).toBeInTheDocument();
    expect(within(rmRow).getByText('£1.00')).toBeInTheDocument();
    expect(within(rmRow).getByText('£600.00')).toBeInTheDocument();
  });

  it('shows em dash when kg or batch is not derivable', () => {
    const noUnits: CostEngineResult = {
      ...ENGINE_RESULT,
      units: { ...ENGINE_RESULT.units, packWeightKg: null, packsPerBatch: null },
    };
    renderReady({ engineResult: noUnits });
    const rmRow = screen.getAllByTestId('waterfall-row')[0]!;
    const dashes = within(rmRow).getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('CostingScreen — blocked checklist', () => {
  it('renders amber checklist with links for missing prerequisites', () => {
    const blocked: CostEngineResult = {
      status: 'blocked',
      missing: ['yield_pct', 'weekly_volume_packs', 'packs_per_case'],
      units: ENGINE_RESULT.units,
      steps: [],
    };
    renderReady({ engineResult: blocked });
    const checklist = screen.getByTestId('costing-blocked-checklist');
    expect(checklist).toHaveClass('alert-amber');
    expect(screen.getByText(LABELS.blockedPrefix)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Yield' })).toHaveAttribute(
      'href',
      `/en/pipeline/${DATA.projectId}/formulation`,
    );
    expect(screen.getByRole('link', { name: 'Weekly volume' })).toHaveAttribute(
      'href',
      `/en/pipeline/${DATA.projectId}/brief`,
    );
    expect(screen.getByRole('link', { name: 'Packs per case' })).toHaveAttribute(
      'href',
      `/en/pipeline/${DATA.projectId}/packaging`,
    );
  });
});

describe('CostingScreen — inputs panel', () => {
  it('renders inputs with org-default placeholders and brief link', () => {
    renderReady();
    expect(screen.getByTestId('costing-inputs-card')).toBeInTheDocument();
    expect(screen.getByTestId('costing-avg-batch')).toHaveValue(120);
    expect(screen.getByTestId('costing-overhead')).toHaveAttribute('placeholder', '0.50');
    expect(screen.getByTestId('costing-logistics')).toHaveAttribute('placeholder', '0.30');
    expect(screen.getByTestId('costing-edit-brief')).toHaveAttribute(
      'href',
      `/en/pipeline/${DATA.projectId}/brief`,
    );
    expect(screen.getByTestId('costing-brief-readonly')).toHaveTextContent('10000');
    expect(screen.getByTestId('costing-brief-readonly')).toHaveTextContent('5');
  });

  it('calls onSaveInputs with project overrides', async () => {
    const onSaveInputs = vi.fn().mockResolvedValue({ ok: true });
    renderReady({ onSaveInputs });
    fireEvent.change(screen.getByTestId('costing-avg-batch'), { target: { value: '150' } });
    fireEvent.change(screen.getByTestId('costing-overhead'), { target: { value: '0.75' } });
    fireEvent.click(screen.getByTestId('costing-save-inputs'));
    await waitFor(() => expect(onSaveInputs).toHaveBeenCalledTimes(1));
    expect(onSaveInputs.mock.calls[0][0]).toEqual({
      projectId: DATA.projectId,
      avgBatchQty: '150',
      overheadPerKgOverride: '0.75',
      logisticsPerBoxOverride: '0.25',
    });
  });
});
