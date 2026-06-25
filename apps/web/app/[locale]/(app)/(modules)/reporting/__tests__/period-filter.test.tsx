/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { computeReportingWindow } from '../shared';

const actionMocks = vi.hoisted(() => ({
  reportingBundle: vi.fn(),
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
      'period.quarter': 'This Quarter',
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

const emptyReceiptsData = {
  days: 7,
  totals: {
    grnCount: 0,
    completedGrnCount: 0,
    cancelledGrnCount: 0,
    itemLineCount: 0,
    receivedQtyByUom: [],
  },
  rows: [],
};

const emptyShipmentsData = {
  days: 7,
  totals: { shipmentCount: 0, packingCount: 0, shippedCount: 0, deliveredCount: 0 },
  byStatus: [],
  rows: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  // The page now loads everything via a SINGLE reportingBundle call (one pooled
  // connection) instead of fanning out 7 concurrent loaders.
  actionMocks.reportingBundle.mockResolvedValue({
    production: { ok: true, data: productionData },
    inventory: { ok: true, data: inventoryData },
    quality: { ok: true, data: qualityData },
    procurement: { ok: true, data: procurementData },
    receipts: { ok: true, data: emptyReceiptsData },
    shipments: { ok: true, data: emptyShipmentsData },
    exportAccess: { ok: true, data: { canExportCsv: true } },
  });
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

  it('passes the current month window from searchParams to the bundle loader', async () => {
    await renderReportingPage({ period: 'month' });

    await waitFor(() => expect(actionMocks.reportingBundle).toHaveBeenCalled());
    // ONE bundle call drives the whole page (single pooled connection).
    expect(actionMocks.reportingBundle).toHaveBeenCalledTimes(1);
    const expected = computeReportingWindow('month', { now: new Date() });
    const bundleInput = actionMocks.reportingBundle.mock.calls[0][0];

    expect(bundleInput.from.toISOString()).toBe(expected.from.toISOString());
    expect(bundleInput.to.toISOString()).toBe(expected.to.toISOString());
  });

  it('forwards lineId from searchParams to the bundle loader', async () => {
    await renderReportingPage({ period: '7d', line: 'line-1' });

    await waitFor(() =>
      expect(actionMocks.reportingBundle).toHaveBeenCalledWith(
        expect.objectContaining({ lineId: 'line-1' }),
      ),
    );
  });
});
