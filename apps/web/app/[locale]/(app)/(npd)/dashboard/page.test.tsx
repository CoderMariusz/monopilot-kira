/**
 * @vitest-environment jsdom
 *
 * T-052 — NPD Dashboard page wiring + i18n + RBAC + states.
 *
 * Real-data wiring: the production page reads the dashboard summary + launch
 * alerts through the T-051 Server Actions (getDashboardSummary / getLaunchAlerts),
 * each of which runs inside withOrgContext (RLS app.current_org_id()). We mock the
 * actions so the jsdom suite asserts the wiring + label resolution without a live
 * pg pool — no fixtures replace production data, only the transport boundary.
 *
 * Prototype parity source: prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NpdDashboardPage from './page';

type Locale = 'en' | 'pl' | 'ro' | 'uk';

const { getDashboardSummaryMock, getLaunchAlertsMock, withOrgContextMock } = vi.hoisted(() => ({
  getDashboardSummaryMock: vi.fn(),
  getLaunchAlertsMock: vi.fn(),
  withOrgContextMock: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

// Resolve labels through the REAL locale JSON so this asserts the production
// next-intl key path (npd.dashboard.*), not a fixture.
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (req?: string | { locale?: string; namespace?: string }) => {
    const locale = typeof req === 'object' ? (req.locale ?? 'en') : 'en';
    const namespace = typeof req === 'object' ? (req.namespace ?? '') : (req ?? '');
    const file = path.resolve(__dirname, `../../../../../i18n/${locale}.json`);
    const messages = JSON.parse(readFileSync(file, 'utf-8'));
    const ns = namespace.split('.').reduce((acc: Record<string, unknown>, part: string) => {
      return (acc?.[part] as Record<string, unknown>) ?? {};
    }, messages);
    return (key: string) => {
      const value = (ns as Record<string, unknown>)[key];
      return typeof value === 'string' ? value : key;
    };
  }),
}));

vi.mock('../../../../(npd)/dashboard/_actions/get-dashboard-summary', () => ({
  getDashboardSummary: getDashboardSummaryMock,
}));

vi.mock('../../../../(npd)/dashboard/_actions/get-launch-alerts', () => ({
  getLaunchAlerts: getLaunchAlertsMock,
}));

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

const SUMMARY = {
  summary: { totalActive: 23, fullyComplete: 5, pending: 15, totalBuilt: 3 },
  perDept: [
    { dept: 'core', done: 8, pending: 12, blocked: 3 },
    { dept: 'mrp', done: 3, pending: 8, blocked: 12 },
  ],
};

const ALERTS = {
  alerts: [
    {
      productCode: 'FA0043',
      productName: 'Smoked Almond Yoghurt',
      launchDate: '2026-04-28',
      daysLeft: 9,
      alertLevel: 'RED' as const,
      missingData: 'MRP: Tara',
      built: false,
    },
  ],
};

function grantPermissions(canCreate: boolean, canRefresh: boolean) {
  // withOrgContext callback runs hasAnyPermission twice (create, refresh).
  withOrgContextMock.mockImplementation(async (cb: (ctx: unknown) => Promise<unknown>) => {
    let call = 0;
    const client = {
      query: vi.fn(async () => {
        call += 1;
        const granted = call === 1 ? canCreate : canRefresh;
        return { rows: granted ? [{ ok: true }] : [] };
      }),
    };
    return cb({ userId: 'u1', orgId: 'o1', client });
  });
}

async function renderPage(locale: Locale = 'en') {
  const ui = await NpdDashboardPage({ params: Promise.resolve({ locale }) });
  return render(ui);
}

beforeEach(() => {
  vi.clearAllMocks();
  getDashboardSummaryMock.mockResolvedValue(SUMMARY);
  getLaunchAlertsMock.mockResolvedValue(ALERTS);
  grantPermissions(true, true);
});

afterEach(() => cleanup());

describe('T-052 page — real-data wiring', () => {
  it('renders summary + alerts from the T-051 Server Actions and prefetches built rows', async () => {
    await renderPage();

    expect(getDashboardSummaryMock).toHaveBeenCalledTimes(1);
    // Prefetch contract: showBuilt:true so the client toggle filters without refetch.
    expect(getLaunchAlertsMock).toHaveBeenCalledWith({ showBuilt: true });

    const kpiRegion = screen.getByRole('region', { name: /kpi|summary counters/i });
    expect(within(kpiRegion).getByText('23')).toBeInTheDocument();

    const alertsTable = screen.getByRole('table', { name: /launch alerts/i });
    const link = within(alertsTable).getByRole('link', { name: /FA0043/i });
    expect(link).toHaveAttribute('href', '/fa/FA0043');
  });
});

describe('T-052 page — RBAC affordances (§11.6)', () => {
  it('renders both privileged actions when permissions are granted', async () => {
    grantPermissions(true, true);
    await renderPage();
    expect(screen.getByRole('button', { name: /create fa/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh d365/i })).toBeInTheDocument();
  });

  it('hides privileged actions when permissions are absent', async () => {
    grantPermissions(false, false);
    await renderPage();
    expect(screen.queryByRole('button', { name: /create fa/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refresh d365/i })).not.toBeInTheDocument();
  });
});

describe('T-052 page — states', () => {
  it('maps a FORBIDDEN action rejection to the permission-denied state', async () => {
    getDashboardSummaryMock.mockRejectedValue(new Error('FORBIDDEN'));
    await renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /launch alerts/i })).not.toBeInTheDocument();
  });

  it('maps an unexpected action failure to the error state', async () => {
    getLaunchAlertsMock.mockRejectedValue(new Error('boom'));
    await renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the empty state when there are no active FAs', async () => {
    getDashboardSummaryMock.mockResolvedValue({
      summary: { totalActive: 0, fullyComplete: 0, pending: 0, totalBuilt: 0 },
      perDept: [],
    });
    getLaunchAlertsMock.mockResolvedValue({ alerts: [] });
    await renderPage();
    expect(screen.getByTestId('dashboard-empty')).toBeInTheDocument();
  });
});

describe('T-052 page — i18n (next-intl locale path)', () => {
  it('resolves Polish labels through the npd.dashboard namespace', async () => {
    await renderPage('pl');
    expect(screen.getByRole('heading', { name: 'Pulpit NPD' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Alerty startu/i })).toBeInTheDocument();
  });

  it('resolves Ukrainian labels through the npd.dashboard namespace', async () => {
    await renderPage('uk');
    expect(screen.getByRole('heading', { name: 'Панель NPD' })).toBeInTheDocument();
  });
});
