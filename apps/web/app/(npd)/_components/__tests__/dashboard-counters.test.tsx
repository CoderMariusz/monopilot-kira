/**
 * @vitest-environment jsdom
 *
 * T-132 — DashboardCounters (NPD Dashboard KPI counters region) RTL parity tests.
 *
 * Prototype source (literal anchor, verified with `wc -l` = 975 lines):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174 (NpdDashboard)
 *   KPI tile row specifically lives at lines 59-81 inside that range.
 *
 * Parity checklist (structural + visual + interaction):
 *   - a labelled KPI region carrying the literal prototype anchor (data-prototype-anchor)
 *   - a row of shadcn Card tiles (@monopilot/ui Card → data-slot="card")
 *   - Total FGs tile + by-status tiles (Done / Pending / Blocked) + Overdue alerts tile
 *   - each tile: muted title + big numeric value + shadcn Badge (data-slot="badge")
 *   - Overdue tile uses the destructive Badge variant when overdueAlerts > 0, secondary otherwise
 *   - reactive to summary prop change (rerender updates every value + clears destructive variant)
 *
 * i18n: component calls useTranslations('npd.dashboardKpi'); test mocks next-intl
 *       (repo convention). Asserts copy uses the canonical FG term (NOT the legacy FA alias).
 *
 * a11y: region has an accessible name; status is conveyed by text + badge, never colour alone.
 *
 * Real-data note: parent RSC (T-134) maps getDashboardSummary (T-051) → this contract shape.
 *                 The component itself performs NO DB / Server Action call.
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── i18n stub (repo convention: mock next-intl useTranslations) ──
const kpiLabels: Record<string, string> = {
  regionLabel: 'NPD dashboard KPI counters',
  totalTitle: 'Total active FGs',
  totalBadge: 'All FGs',
  doneTitle: 'Done',
  doneBadge: 'Ready',
  pendingTitle: 'Pending',
  pendingBadge: 'Awaiting fill',
  blockedTitle: 'Blocked',
  blockedBadge: 'Blocked',
  overdueTitle: 'Overdue alerts',
  overdueBadgeActive: 'Overdue',
  overdueBadgeClear: 'On track',
  empty: 'No active Finished Goods yet.',
  error: 'Unable to load KPI counters.',
  forbidden: 'You do not have permission to view these KPIs.',
};

function tKpi(key: string, values?: Record<string, string | number>) {
  return (kpiLabels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values?.[name] ?? `{${name}}`),
  );
}

vi.mock('next-intl', () => ({
  useTranslations: () => tKpi,
}));

// Imported after the mock is registered.
import { DashboardCounters, type DashboardCountersSummary } from '../dashboard-counters';

const fixedSummary: DashboardCountersSummary = {
  totalFas: 41,
  byStatus: { done: 17, pending: 11, blocked: 5 },
  overdueAlerts: 3,
};

afterEach(() => cleanup());

function getKpiRegion() {
  return screen.getByRole('region', { name: /npd dashboard kpi counters/i });
}

function getCardByTitle(title: string) {
  const heading = screen.getByRole('heading', { name: title });
  const card = heading.closest('[data-slot="card"]');
  if (!card) {
    expect.fail(`"${title}" tile must render inside a shadcn Card primitive (data-slot="card")`);
  }
  return card as HTMLElement;
}

function expectCounterCard(title: string, value: number) {
  const card = getCardByTitle(title);
  const valueEl = within(card).getByText(String(value), { selector: '[data-counter-value]' });
  expect(valueEl).toHaveAttribute('data-counter-value', title);

  const badges = card.querySelectorAll('[data-slot="badge"]');
  expect(badges, `"${title}" tile must include exactly one shadcn Badge primitive`).toHaveLength(1);

  return { card, badge: badges[0] as HTMLElement };
}

describe('DashboardCounters — NPD dashboard KPI region (fa-screens.jsx:32-174)', () => {
  it('renders the fixed summary as a parity row of shadcn Card tiles with title, value and Badge', () => {
    render(<DashboardCounters summary={fixedSummary} />);

    const region = getKpiRegion();
    expect(region).toHaveAttribute('data-prototype-anchor', 'npd/fa-screens.jsx:32-174');

    const cards = region.querySelectorAll('[data-slot="card"]');
    expect(cards).toHaveLength(5);

    expectCounterCard('Total active FGs', fixedSummary.totalFas);
    expectCounterCard('Done', fixedSummary.byStatus.done);
    expectCounterCard('Pending', fixedSummary.byStatus.pending);
    expectCounterCard('Blocked', fixedSummary.byStatus.blocked);
    expectCounterCard('Overdue alerts', fixedSummary.overdueAlerts);
  });

  it('uses the canonical FG term in user-facing copy and never the legacy FA alias', () => {
    render(<DashboardCounters summary={fixedSummary} />);
    const region = getKpiRegion();
    expect(region).toHaveTextContent(/FGs?/);
    // Legacy alias must not surface as user-facing copy (whole-word "FA"/"FAs").
    expect(region.textContent ?? '').not.toMatch(/\bFAs?\b/);
  });

  it('marks the Overdue tile Badge as destructive when overdueAlerts > 0', () => {
    render(<DashboardCounters summary={fixedSummary} />);
    const { badge } = expectCounterCard('Overdue alerts', fixedSummary.overdueAlerts);
    expect(badge).toHaveAttribute('data-variant', 'destructive');
    expect(badge).toHaveTextContent(/overdue/i);
  });

  it('reactively updates every value and clears the destructive overdue Badge after a prop change', () => {
    const nextSummary: DashboardCountersSummary = {
      totalFas: 52,
      byStatus: { done: 25, pending: 16, blocked: 8 },
      overdueAlerts: 0,
    };

    const { rerender } = render(<DashboardCounters summary={fixedSummary} />);
    expectCounterCard('Total active FGs', fixedSummary.totalFas);
    const { badge: before } = expectCounterCard('Overdue alerts', fixedSummary.overdueAlerts);
    expect(before).toHaveAttribute('data-variant', 'destructive');

    rerender(<DashboardCounters summary={nextSummary} />);
    expectCounterCard('Total active FGs', nextSummary.totalFas);
    expectCounterCard('Done', nextSummary.byStatus.done);
    expectCounterCard('Pending', nextSummary.byStatus.pending);
    expectCounterCard('Blocked', nextSummary.byStatus.blocked);
    const { badge: after } = expectCounterCard('Overdue alerts', nextSummary.overdueAlerts);
    expect(after).not.toHaveAttribute('data-variant', 'destructive');
    expect(after).toHaveTextContent(/track/i);
  });

  it('renders the empty state when state="empty" without crashing', () => {
    render(<DashboardCounters summary={fixedSummary} state="empty" />);
    const region = getKpiRegion();
    expect(within(region).getByText(/no active finished goods/i)).toBeInTheDocument();
    expect(region.querySelectorAll('[data-slot="card"]')).toHaveLength(0);
  });

  it('renders the error state with an assertive alert when state="error"', () => {
    render(<DashboardCounters summary={fixedSummary} state="error" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/unable to load kpi counters/i);
  });

  it('renders the permission-denied state when state="forbidden"', () => {
    render(<DashboardCounters summary={fixedSummary} state="forbidden" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/permission/i);
  });
});

// ── Parity evidence capture (closeout artifacts; UI-PROTOTYPE-PARITY-POLICY.md) ──
describe('DashboardCounters — parity evidence capture', () => {
  const ARTIFACT_DIR = resolve(__dirname, '../../../../e2e/artifacts/T-132');

  function writeArtifact(name: string, contents: string) {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    writeFileSync(resolve(ARTIFACT_DIR, name), contents, 'utf-8');
  }

  it('captures per-state DOM snapshots, an a11y report and a parity map', () => {
    const states: Array<{ name: string; node: React.ReactElement }> = [
      { name: 'ready', node: <DashboardCounters summary={fixedSummary} /> },
      { name: 'empty', node: <DashboardCounters summary={fixedSummary} state="empty" /> },
      { name: 'error', node: <DashboardCounters summary={fixedSummary} state="error" /> },
      { name: 'forbidden', node: <DashboardCounters summary={fixedSummary} state="forbidden" /> },
    ];

    const a11ySummaries: Array<{ state: string; accessibleName: boolean; liveRole: string | null }> = [];

    for (const state of states) {
      const { container } = render(state.node);
      writeArtifact(`${state.name}.html`, container.innerHTML);

      // Structural a11y invariants (jsdom-level; full axe scan deferred to Playwright — see report).
      const region = container.querySelector('section[aria-label]');
      const liveEl = container.querySelector('[role="alert"], [role="status"]');
      a11ySummaries.push({
        state: state.name,
        accessibleName: Boolean(region?.getAttribute('aria-label')),
        liveRole: liveEl?.getAttribute('role') ?? null,
      });
      expect(region, `"${state.name}" state must expose a labelled region`).not.toBeNull();

      cleanup();
    }

    writeArtifact(
      'a11y-fallback.json',
      JSON.stringify(
        {
          component: 'DashboardCounters',
          tool: 'jsdom structural assertions (RTL)',
          axeBlocker:
            'Full @axe-core scan deferred to the Playwright parity run (T-135); jest-axe/axe-core are not direct deps of the web package and adding them is out of T-132 scope.',
          states: a11ySummaries,
        },
        null,
        2,
      ),
    );

    const parityMap = {
      task: 'T-132',
      component: 'apps/web/app/(npd)/_components/dashboard-counters.tsx',
      prototypeAnchor: 'prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174',
      kpiRowLines: '59-81',
      regions: [
        { prototype: 'KPI grid (repeat(4,1fr))', production: 'labelled <section> grid of shadcn Card tiles' },
        { prototype: 'card "Total active FAs"', production: 'Total tile (FG copy) — Card + info Badge' },
        { prototype: 'card "Fully complete"', production: 'Done tile — Card + success Badge' },
        { prototype: 'card "In progress / pending"', production: 'Pending tile — Card + warning Badge' },
        { prototype: 'by-status blocked count', production: 'Blocked tile — Card + Badge (destructive when > 0)' },
        { prototype: 'launch-alert overdue count', production: 'Overdue tile — Card + destructive Badge when > 0' },
      ],
      states: ['ready', 'empty', 'error', 'forbidden'],
      i18nNamespace: 'npd.dashboardKpi',
      deviations: [
        'Tile set follows the task contract (Total + by-status + Overdue = 5) vs prototype (Total/Complete/InProgress/Built = 4).',
        'User-facing copy uses canonical FG term; legacy FA alias from the prototype is not reproduced (MON-domain-npd red-line).',
        'Loading state owned by parent RSC Suspense boundary; not rendered by this island.',
      ],
    };
    writeArtifact('parity-map.json', JSON.stringify(parityMap, null, 2));
  });
});
