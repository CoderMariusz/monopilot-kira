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

const { getDashboardSummaryMock, getLaunchAlertsMock, listProjectsMock, withOrgContextMock } =
  vi.hoisted(() => ({
    getDashboardSummaryMock: vi.fn(),
    getLaunchAlertsMock: vi.fn(),
    listProjectsMock: vi.fn(),
    withOrgContextMock: vi.fn(),
  }));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

// DashboardScreen now mounts the inline FaCreateModal (which uses next/navigation
// for the post-create redirect), so the navigation hooks must be stubbed in jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/npd',
  useSearchParams: () => new URLSearchParams(),
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

vi.mock('../../../../(npd)/pipeline/_actions/list-projects', () => ({
  listProjects: listProjectsMock,
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

const RECENT_PROJECTS = {
  ok: true as const,
  data: {
    projects: [
      {
        id: 'p-001',
        code: 'FA5101',
        name: 'Smoked Almond Yoghurt',
        type: 'recipe',
        currentGate: 'G2',
        currentStage: 'formulation',
        prio: 'high',
        owner: 'Jane Nowak',
        targetLaunch: '2026-08-01',
        notes: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        progressPercent: 40,
      },
      {
        id: 'p-002',
        code: 'FA5102',
        name: 'Reduced Sugar Kefir',
        type: 'recipe',
        currentGate: 'Launched',
        currentStage: 'launch',
        prio: 'normal',
        owner: 'Piotr Zielinski',
        targetLaunch: '2026-07-01',
        notes: null,
        createdAt: '2026-05-20T00:00:00.000Z',
        progressPercent: 100,
      },
    ],
  },
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
  listProjectsMock.mockResolvedValue(RECENT_PROJECTS);
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
    expect(link).toHaveAttribute('href', '/fg/FA0043');
  });
});

describe('T-052 page — RBAC affordances (§11.6)', () => {
  it('renders both privileged actions when permissions are granted', async () => {
    grantPermissions(true, true);
    await renderPage();
    expect(screen.getByRole('button', { name: /create fg/i })).toBeInTheDocument();
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

describe('T-134 assembly — KPI region + T-133 pipeline preview + launch alerts', () => {
  it('composes the pipeline-preview region from real listProjects (T-057) data after the KPI counters', async () => {
    await renderPage();

    expect(listProjectsMock).toHaveBeenCalledTimes(1);

    const kpiRegion = screen.getByRole('region', { name: /kpi|summary counters/i });
    const previewRegion = screen.getByRole('region', { name: /pipeline/i });
    expect(previewRegion).toBeInTheDocument();

    // KPI region renders before the pipeline-preview region (documented order).
    expect(kpiRegion.compareDocumentPosition(previewRegion)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    // Real recent-project rows surface inside the preview.
    expect(within(previewRegion).getByText(/smoked almond yoghurt/i)).toBeInTheDocument();
    expect(within(previewRegion).getByText('FA5101')).toBeInTheDocument();
    expect(within(previewRegion).getByText('Jane Nowak', { exact: false })).toBeInTheDocument();
  });

  it('derives gate-status dots from real project state (Launched/100% → done)', async () => {
    await renderPage();
    const previewRegion = screen.getByRole('region', { name: /pipeline/i });
    // FA5102 is Launched + 100% → "Done"; FA5101 is 40% → "In progress".
    expect(within(previewRegion).getByText(/done/i)).toBeInTheDocument();
    expect(within(previewRegion).getByText(/in progress/i)).toBeInTheDocument();
  });

  it('routes the preview view-all link to /pipeline and each row to /fa/[productCode]', async () => {
    await renderPage();
    const previewRegion = screen.getByRole('region', { name: /pipeline/i });

    const viewAll = within(previewRegion).getByRole('link', { name: /view all/i });
    expect(viewAll).toHaveAttribute('href', '/pipeline');

    const row = within(previewRegion).getByRole('link', {
      name: /FA5101.*Smoked Almond Yoghurt/i,
    });
    expect(row).toHaveAttribute('href', '/fg/FA5101');
  });

  it('renders the preview empty state when there are no recent projects', async () => {
    listProjectsMock.mockResolvedValue({ ok: true, data: { projects: [] } });
    await renderPage();
    const previewRegion = screen.getByRole('region', { name: /pipeline/i });
    expect(within(previewRegion).getByText(/no recent projects/i)).toBeInTheDocument();
  });

  it('degrades the preview to empty without failing the dashboard when listProjects is forbidden', async () => {
    listProjectsMock.mockResolvedValue({ ok: false, error: 'FORBIDDEN' });
    await renderPage();
    // Dashboard KPI region still renders; preview shows its empty body.
    expect(screen.getByRole('region', { name: /kpi|summary counters/i })).toBeInTheDocument();
    const previewRegion = screen.getByRole('region', { name: /pipeline/i });
    expect(within(previewRegion).getByText(/no recent projects/i)).toBeInTheDocument();
  });

  it('resolves the pipeline preview labels through the npd.dashboardPipeline namespace (pl)', async () => {
    await renderPage('pl');
    const previewRegion = screen.getByRole('region', { name: /pipeline/i });
    expect(within(previewRegion).getByText('Zobacz wszystkie')).toBeInTheDocument();
  });
});
