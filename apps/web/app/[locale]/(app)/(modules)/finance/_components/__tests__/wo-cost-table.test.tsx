import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FinanceWoCostTable, type FinanceWoCostLabels } from '../wo-cost-table.client';

const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const labels: FinanceWoCostLabels = {
  title: 'WO actual costs',
  subtitle: 'Completed work orders costed from consumed materials.',
  refresh: 'Refresh',
  refreshing: 'Refreshing...',
  permissionDenied: 'You do not have permission to view finance costs.',
  empty: 'No completed work orders with costing inputs were found in this window.',
  error: 'Finance costs could not be loaded.',
  loading: 'Loading WO costs...',
  notAvailable: 'n/a',
  columns: {
    wo: 'WO',
    product: 'Product',
    outputKg: 'Output kg',
    materials: 'Materials',
    labor: 'Labor',
    total: 'Total',
    costPerKg: 'Cost / kg',
  },
  breakdown: {
    title: 'Material breakdown',
    item: 'Item',
    qtyKg: 'Qty kg',
    costPerKg: 'Cost / kg',
    cost: 'Cost',
    noLabor: 'No process cost',
    setup: 'Setup',
    machine: 'Machine',
    waste: 'Waste',
  },
};

const readyResult = {
  state: 'ready' as const,
  summary: {
    days: 30,
    rows: [
      {
        woId: 'wo-1',
        woNumber: 'WO-1001',
        completedAt: '2026-06-10T10:00:00.000Z',
        product: { itemCode: 'FG-001', name: 'Finished good' },
        outputKg: '25.000',
        materials: [{ itemCode: 'RM-A', qtyKg: '10.000', costPerKg: '1.250000', cost: '12.5000' }],
        materialsTotal: '12.5000',
        labor: { runtimeMin: '60.000', staffing: '2', ratePerHour: '15.0000', cost: '30.0000' },
        machineCost: '0.0000',
        setupCost: '5.0000',
        wasteCost: '1.2500',
        totalCost: '48.7500',
        costPerKgOutput: '1.9500',
        processResolution: {
          operationName: 'MIXING',
          processRowKey: 'MIXING',
          costMode: 'per_hour' as const,
          currency: 'EUR',
          note: 'Matched',
        },
      },
    ],
  },
};

describe('FinanceWoCostTable', () => {
  beforeEach(() => {
    refreshMock.mockClear();
  });

  it('renders permission-denied, error, loading, and empty states', () => {
    const { rerender } = render(<FinanceWoCostTable result={{ state: 'permission-denied' }} labels={labels} />);
    expect(screen.getByTestId('finance-denied')).toHaveTextContent(labels.permissionDenied);

    rerender(<FinanceWoCostTable result={{ state: 'error' }} labels={labels} />);
    expect(screen.getByRole('alert')).toHaveTextContent(labels.error);

    rerender(<FinanceWoCostTable result={{ state: 'loading' }} labels={labels} />);
    expect(screen.getByTestId('finance-loading')).toHaveAttribute('aria-busy', 'true');

    rerender(<FinanceWoCostTable result={{ state: 'ready', summary: { days: 30, rows: [] } }} labels={labels} />);
    expect(screen.getByTestId('finance-empty')).toHaveTextContent(labels.empty);
  });

  it('renders completed WO cost rows and expands material breakdown', () => {
    render(<FinanceWoCostTable result={readyResult} labels={labels} />);

    expect(screen.getByText('FG-001')).toBeInTheDocument();
    expect(screen.getByText('48.7500')).toBeInTheDocument();
    expect(screen.getByText('1.9500')).toBeInTheDocument();

    const summary = screen.getByText('WO-1001');
    fireEvent.click(summary);

    const expanded = screen.getByTestId('finance-breakdown-wo-1');
    expect(within(expanded).getByText('RM-A')).toBeInTheDocument();
    expect(within(expanded).getByText('12.5000')).toBeInTheDocument();
    expect(within(expanded).getByText('5.0000')).toBeInTheDocument();
  });

  it('re-fetches the server component by calling router.refresh on Refresh', () => {
    render(<FinanceWoCostTable result={readyResult} labels={labels} />);

    fireEvent.click(screen.getByTestId('finance-refresh'));

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
