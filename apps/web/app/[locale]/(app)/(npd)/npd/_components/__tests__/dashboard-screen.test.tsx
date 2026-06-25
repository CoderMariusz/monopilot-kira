/**
 * @vitest-environment jsdom
 *
 * T-052 — NPD Dashboard page (SCR-01).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174 (NpdDashboard)
 *
 * RED-first contract for the prototype-faithful dashboard screen:
 *   - 4 KPI cards (Total active / Fully complete / In progress / Built for D365)
 *   - Department progress table (7 depts, Done / Pending / Blocked + progress)
 *   - Launch alert legend card + "Show built" toggle (default OFF)
 *   - Launch alerts table (sorted, RAG badges, row links to FA detail)
 *   - 5 UI states (ready / loading / empty / error / permission_denied)
 *   - all visible strings driven by props (i18n labels), no inline copy
 *   - RBAC: Create FA / Refresh D365 actions only when canCreate / canRefresh
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import {
  DashboardScreen,
  type DashboardScreenLabels,
  type DashboardScreenProps,
} from '../dashboard-screen';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

// DashboardScreen now mounts the inline FaCreateModal (uses next/navigation for
// the post-create redirect), so the navigation hooks must be stubbed in jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/npd',
  useSearchParams: () => new URLSearchParams(),
}));

const LABELS: DashboardScreenLabels = {
  breadcrumbRoot: 'NPD',
  breadcrumbCurrent: 'Dashboard',
  title: 'NPD Dashboard',
  subtitle: 'Pipeline overview across 7 departments',
  refreshD365: 'Refresh D365 cache',
  createFa: 'Create FA',
  kpiTotalActive: 'Total active FAs',
  kpiTotalActiveHint: 'COUNT(*) where built=FALSE',
  kpiComplete: 'Fully complete',
  kpiCompleteHint: 'Ready for D365 build',
  kpiInProgress: 'In progress / pending',
  kpiInProgressHint: 'Awaiting dept fill',
  kpiBuilt: 'Built for D365',
  kpiBuiltHint: 'Awaiting retailer approval',
  deptProgressTitle: 'Department progress',
  deptProgressSubtitle: '7 depts',
  colDept: 'Department',
  colDone: 'Done',
  colPending: 'Pending',
  colBlocked: 'Blocked',
  colProgress: 'Progress',
  expandBlockedFas: 'Show blocked FAs',
  collapseBlockedFas: 'Hide blocked FAs',
  blockedFaListTitle: 'Blocked FAs',
  legendTitle: 'Launch alert legend',
  legendRed: 'days_left ≤ 10, or missing required fields',
  legendAmber: 'days_left ≤ 21 AND missing data',
  legendGreen: 'on track · no data gaps',
  legendNote: 'Row-level alert badge recalculates on load.',
  showBuilt: 'Show built FAs (hidden by default)',
  alertsTitle: 'Launch alerts',
  alertsSubtitle: 'Sort: days_left ASC',
  colFaCode: 'FA Code',
  colProduct: 'Product',
  colLaunch: 'Launch date',
  colDaysLeft: 'Days left',
  colAlert: 'Alert',
  colMissing: 'Missing data',
  alertRed: 'Red',
  alertAmber: 'Amber',
  alertGreen: 'Green',
  openFa: 'Open FA',
  noDate: 'No date set',
  deptCore: 'Core',
  deptPlanning: 'Planning',
  deptCommercial: 'Commercial',
  deptProduction: 'Production',
  deptTechnical: 'Technical',
  deptMrp: 'MRP',
  deptProcurement: 'Procurement',
  loading: 'Loading dashboard…',
  empty: 'No active Factory Articles yet',
  emptyBody: 'Launch alerts appear once Factory Articles exist.',
  error: 'Unable to load the dashboard.',
  forbidden: 'You do not have permission to view the dashboard.',
};

const READY_PROPS: DashboardScreenProps = {
  state: 'ready',
  labels: LABELS,
  canCreate: true,
  canRefresh: true,
  summary: { totalActive: 23, fullyComplete: 5, inProgress: 15, totalBuilt: 3 },
  perDept: [
    {
      dept: 'core',
      done: 8,
      pending: 12,
      blocked: 3,
      blockedFas: [
        {
          productCode: 'FA0043',
          productName: 'Smoked Almond Yoghurt',
          missingData: 'Core: Product Name.',
        },
      ],
    },
    { dept: 'planning', done: 5, pending: 10, blocked: 8, blockedFas: [] },
  ],
  alerts: [
    {
      productCode: 'FA0043',
      productName: 'Smoked Almond Yoghurt',
      launchDate: '2026-04-28',
      daysLeft: 9,
      alertLevel: 'RED',
      missingData: 'MRP: Tara',
      built: false,
    },
    {
      productCode: 'FA0045',
      productName: 'Blueberry Oat Drink',
      launchDate: '2026-05-25',
      daysLeft: 36,
      alertLevel: 'GREEN',
      missingData: null,
      built: false,
    },
    {
      productCode: 'FA9001',
      productName: 'Built Article',
      launchDate: '2026-06-01',
      daysLeft: 40,
      alertLevel: 'GREEN',
      missingData: null,
      built: true,
    },
  ],
};

function renderScreen(overrides: Partial<DashboardScreenProps> = {}) {
  return render(<DashboardScreen {...READY_PROPS} {...overrides} />);
}

describe('T-052 DashboardScreen — structural parity (fa-screens.jsx:32-174)', () => {
  it('carries the prototype anchor on the page root', () => {
    const { container } = renderScreen();
    const root = container.querySelector('[data-prototype-anchor="npd/fa-screens.jsx:32-174"]');
    expect(root, 'page root must declare the prototype anchor').toBeInTheDocument();
  });

  it('renders the four KPI cards with summary values', () => {
    renderScreen();
    const kpiRegion = screen.getByRole('region', { name: /kpi|summary counters/i });
    const cards = kpiRegion.querySelectorAll('[data-slot="card"]');
    expect(cards).toHaveLength(4);
    expect(within(kpiRegion).getByText('23')).toBeInTheDocument();
    expect(within(kpiRegion).getByText('5')).toBeInTheDocument();
    expect(within(kpiRegion).getByText('15')).toBeInTheDocument();
    expect(within(kpiRegion).getByText('3')).toBeInTheDocument();
    expect(within(kpiRegion).getByText(LABELS.kpiTotalActive)).toBeInTheDocument();
    expect(within(kpiRegion).getByText(LABELS.kpiBuilt)).toBeInTheDocument();
  });

  it('renders the department progress table with one row per dept', () => {
    renderScreen();
    const deptTable = screen.getByRole('table', { name: /department progress/i });
    const coreCell = within(deptTable).getByText(LABELS.deptCore);
    const coreRow = coreCell.closest('[data-slot="table-row"]') as HTMLElement;
    expect(coreRow).not.toBeNull();
    // Core: done 8 / pending 12 / blocked 3
    expect(within(coreRow).getByText('8')).toBeInTheDocument();
    expect(within(coreRow).getByText('12')).toBeInTheDocument();
    expect(within(deptTable).getByText(LABELS.deptPlanning)).toBeInTheDocument();
  });

  it('expands a department row to show that dept blocked FA list', () => {
    renderScreen();
    const deptTable = screen.getByRole('table', { name: /department progress/i });

    expect(within(deptTable).queryByText(/smoked almond yoghurt/i)).not.toBeInTheDocument();

    fireEvent.click(within(deptTable).getByRole('button', { name: /show blocked fas: core/i }));

    expect(within(deptTable).getByText(LABELS.blockedFaListTitle)).toBeInTheDocument();
    expect(within(deptTable).getByRole('link', { name: 'FA0043' })).toHaveAttribute(
      'href',
      '/fa/FA0043',
    );
    expect(within(deptTable).getByText(/smoked almond yoghurt/i)).toBeInTheDocument();
    expect(within(deptTable).getByText('Core: Product Name.')).toBeInTheDocument();
  });

  it('renders the launch alerts table sorted with RAG badges and FA links', () => {
    renderScreen();
    const alertsTable = screen.getByRole('table', { name: /launch alerts/i });
    const link = within(alertsTable).getByRole('link', { name: /FA0043/i });
    expect(link).toHaveAttribute('href', '/fa/FA0043');
    const badges = alertsTable.querySelectorAll('[data-slot="badge"]');
    expect(badges.length).toBeGreaterThanOrEqual(2);
  });
});

describe('T-052 DashboardScreen — interaction: show-built toggle (§11.7)', () => {
  it('hides built FAs by default and reveals them when toggled on', () => {
    renderScreen();
    const alertsTable = screen.getByRole('table', { name: /launch alerts/i });
    // Built article hidden by default
    expect(within(alertsTable).queryByText(/built article/i)).not.toBeInTheDocument();

    const toggle = screen.getByRole('checkbox', { name: /show built/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);

    const updated = screen.getByRole('table', { name: /launch alerts/i });
    expect(within(updated).getByText(/built article/i)).toBeInTheDocument();
  });
});

describe('T-052 DashboardScreen — RBAC gating (§11.6)', () => {
  it('renders Create FA + Refresh D365 actions when permitted', () => {
    renderScreen({ canCreate: true, canRefresh: true });
    expect(screen.getByRole('button', { name: /create fa/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh d365/i })).toBeInTheDocument();
  });

  it('hides the Create FA action when caller lacks fa.create', () => {
    renderScreen({ canCreate: false });
    expect(screen.queryByRole('button', { name: /create fa/i })).not.toBeInTheDocument();
  });

  it('hides the Refresh D365 action when caller lacks d365_builder.execute', () => {
    renderScreen({ canRefresh: false });
    expect(screen.queryByRole('button', { name: /refresh d365/i })).not.toBeInTheDocument();
  });
});

describe('T-052 DashboardScreen — required UI states', () => {
  it('shows the permission-denied notice and no tables', () => {
    renderScreen({ state: 'permission_denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
    expect(screen.queryByRole('table', { name: /launch alerts/i })).not.toBeInTheDocument();
  });

  it('shows the error notice', () => {
    renderScreen({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.error);
  });

  it('shows the loading notice', () => {
    renderScreen({ state: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent(LABELS.loading);
  });

  it('shows the empty notice when there are no active alerts', () => {
    renderScreen({
      state: 'empty',
      summary: { totalActive: 0, fullyComplete: 0, inProgress: 0, totalBuilt: 0 },
      perDept: [],
      alerts: [],
    });
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
  });
});

describe('T-052 DashboardScreen — i18n discipline', () => {
  it('renders no hard-coded English copy outside the provided labels', () => {
    renderScreen();
    // The prototype hard-codes the actor + reference date; production must not.
    expect(screen.queryByText(/Jane Nowak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-04-21/)).not.toBeInTheDocument();
  });
});
