/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { computeReportingWindow } from '../shared';

const actionMocks = vi.hoisted(() => ({
  productionSummary: vi.fn(),
  inventorySnapshot: vi.fn(),
  qualitySummary: vi.fn(),
  procurementSummary: vi.fn(),
  getReportingExportAccess: vi.fn(),
  reportingProductionLines: vi.fn(),
}));

vi.mock('../_actions/report-read-actions', () => actionMocks);

vi.mock('@monopilot/ui/PageHeader', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  ),
}));

vi.mock('../_components/period-selector.client', () => ({
  PeriodSelector: () => <div data-testid="period-selector-mock" />,
}));

vi.mock('../_components/reporting-overview.client', () => ({
  ReportingOverviewClient: () => <div data-testid="reporting-overview-mock" />,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => {
    const labels: Record<string, string> = {
      'period.today': 'Today',
      'period.week': 'This Week',
      'period.month': 'This Month',
      'period.last7d': 'Last 7d',
      'period.last30d': 'Last 30d',
      'period.custom': 'Custom range',
      'filter.line': 'Production line',
      'filter.search': 'WO/PO number',
    };
    return (key: string) => labels[key] ?? key;
  }),
}));

import ReportingRoutePage from '../page';

const productionData = {
  days: 7,
  wosCompleted: 0,
  outputKg: '0.000',
  wasteKg: '0.000',
  wastePct: null,
  avgYieldPct: null,
  downtimeMinutes: 0,
  rows: [],
};

const inventoryData = {
  totals: {
    lpCount: 0,
    activeLpCount: 0,
    blockedLpCount: 0,
    qtyKg: '0.000',
    expiredCount: 0,
    expiring7dCount: 0,
  },
  rows: [],
};

const qualityData = {
  days: 7,
  openHolds: 0,
  inspectionsByStatus: [],
  ncrOpen: 0,
  ncrClosedInWindow: 0,
  rows: [],
};

const procurementData = {
  days: 7,
  posByStatus: [],
  avgConfirmedToFirstGrnDays: null,
  avgCreatedToFirstGrnDays: null,
  openToCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  actionMocks.productionSummary.mockResolvedValue({ ok: true, data: productionData });
  actionMocks.inventorySnapshot.mockResolvedValue({ ok: true, data: inventoryData });
  actionMocks.qualitySummary.mockResolvedValue({ ok: true, data: qualityData });
  actionMocks.procurementSummary.mockResolvedValue({ ok: true, data: procurementData });
  actionMocks.getReportingExportAccess.mockResolvedValue({ ok: true, data: { canExportCsv: true } });
  actionMocks.reportingProductionLines.mockResolvedValue({ ok: true, data: [] });
});

async function renderReportingPage(searchParams: Record<string, string | undefined>) {
  const node = await ReportingRoutePage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(searchParams),
  });
  render(node);
  await screen.findByTestId('reporting-overview-mock');
}

describe('reporting period and filters', () => {
  it('computes the default 7d period as a seven-day window', () => {
    const now = new Date('2026-06-23T12:30:00.000Z');
    const window = computeReportingWindow('7d', { now });

    expect(window.period).toBe('7d');
    expect(window.to.getTime() - window.from.getTime()).toBe(7 * 86_400_000);
  });

  it('passes the current month window from searchParams to the loaders', async () => {
    await renderReportingPage({ period: 'month' });

    await waitFor(() => expect(actionMocks.productionSummary).toHaveBeenCalled());
    const expected = computeReportingWindow('month', { now: new Date() });
    const productionInput = actionMocks.productionSummary.mock.calls[0][0];
    const qualityInput = actionMocks.qualitySummary.mock.calls[0][0];
    const procurementInput = actionMocks.procurementSummary.mock.calls[0][0];

    expect(productionInput.from.toISOString()).toBe(expected.from.toISOString());
    expect(productionInput.to.toISOString()).toBe(expected.to.toISOString());
    expect(qualityInput.from.toISOString()).toBe(expected.from.toISOString());
    expect(qualityInput.to.toISOString()).toBe(expected.to.toISOString());
    expect(procurementInput.from.toISOString()).toBe(expected.from.toISOString());
    expect(procurementInput.to.toISOString()).toBe(expected.to.toISOString());
  });

  it('forwards lineId from searchParams to the production loader', async () => {
    await renderReportingPage({ period: '7d', line: 'line-1' });

    await waitFor(() =>
      expect(actionMocks.productionSummary).toHaveBeenCalledWith(
        expect.objectContaining({ lineId: 'line-1' }),
      ),
    );
  });
});

