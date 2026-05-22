/**
 * T-132 / TASK-000270 RED: DashboardCounters KPI row.
 *
 * Prototype anchor: prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174
 * Scope fence: tests only; production component is the behavior surface.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

type DashboardCountersSummary = {
  totalFas: number;
  done: number;
  pending: number;
  blocked: number;
  overdueAlerts: number;
};

type DashboardCountersComponent = React.ComponentType<{
  summary: DashboardCountersSummary;
}>;

const fixedSummary: DashboardCountersSummary = {
  totalFas: 41,
  done: 17,
  pending: 11,
  blocked: 5,
  overdueAlerts: 3,
};

async function loadDashboardCounters(): Promise<DashboardCountersComponent> {
  try {
    const componentPath = '../dashboard-counters';
    const module = await import(/* @vite-ignore */ componentPath);
    const Component = module.DashboardCounters ?? module.default;

    if (typeof Component !== 'function') {
      expect.fail(
        'dashboard-counters.tsx must export a DashboardCounters React component (named or default export)',
      );
    }

    return Component as DashboardCountersComponent;
  } catch (error) {
    expect.fail(
      `DashboardCounters component is missing or not loadable at apps/web/app/(npd)/_components/dashboard-counters.tsx: ${String(
        error,
      )}`,
    );
  }
}

function getKpiRegion() {
  return screen.getByRole('region', { name: /dashboard kpi counters/i });
}

function getCardByTitle(title: string) {
  const heading = screen.getByRole('heading', { name: title });
  const card = heading.closest('[data-slot="card"]');

  if (!card) {
    expect.fail(`${title} must render inside a shadcn Card primitive with data-slot="card"`);
  }

  return card as HTMLElement;
}

function expectCounterCard(title: string, value: number) {
  const card = getCardByTitle(title);

  expect(within(card).getByText(String(value))).toBeInTheDocument();
  expect(within(card).getByText(String(value))).toHaveAttribute('data-counter-value', title);

  const badges = card.querySelectorAll('[data-slot="badge"]');
  expect(badges, `${title} card must include exactly one shadcn Badge primitive`).toHaveLength(1);

  return { card, badge: badges[0] as HTMLElement };
}

describe('DashboardCounters', () => {
  it('renders the fixed summary as a prototype-parity row of shadcn Card tiles with title, value, and Badge', async () => {
    const DashboardCounters = await loadDashboardCounters();

    render(<DashboardCounters summary={fixedSummary} />);

    const region = getKpiRegion();
    expect(region).toHaveAttribute('data-prototype-anchor', 'npd/fa-screens.jsx:32-174');

    const cards = region.querySelectorAll('[data-slot="card"]');
    expect(cards).toHaveLength(5);

    expectCounterCard('Total FAs', fixedSummary.totalFas);
    expectCounterCard('Done', fixedSummary.done);
    expectCounterCard('Pending', fixedSummary.pending);
    expectCounterCard('Blocked', fixedSummary.blocked);
    expectCounterCard('Overdue', fixedSummary.overdueAlerts);
  });

  it('marks the Overdue tile Badge as destructive when overdueAlerts is greater than zero', async () => {
    const DashboardCounters = await loadDashboardCounters();

    render(<DashboardCounters summary={fixedSummary} />);

    const { badge } = expectCounterCard('Overdue', fixedSummary.overdueAlerts);
    expect(badge).toHaveAttribute('data-variant', 'destructive');
    expect(badge).toHaveTextContent(/overdue/i);
  });

  it('reactively updates every value and clears the destructive overdue Badge variant after summary prop changes', async () => {
    const DashboardCounters = await loadDashboardCounters();
    const nextSummary: DashboardCountersSummary = {
      totalFas: 52,
      done: 25,
      pending: 16,
      blocked: 8,
      overdueAlerts: 0,
    };

    const { rerender } = render(<DashboardCounters summary={fixedSummary} />);

    expectCounterCard('Total FAs', fixedSummary.totalFas);
    expectCounterCard('Done', fixedSummary.done);
    expectCounterCard('Pending', fixedSummary.pending);
    expectCounterCard('Blocked', fixedSummary.blocked);
    expectCounterCard('Overdue', fixedSummary.overdueAlerts);

    rerender(<DashboardCounters summary={nextSummary} />);

    expectCounterCard('Total FAs', nextSummary.totalFas);
    expectCounterCard('Done', nextSummary.done);
    expectCounterCard('Pending', nextSummary.pending);
    expectCounterCard('Blocked', nextSummary.blocked);
    const { badge: overdueBadge } = expectCounterCard('Overdue', nextSummary.overdueAlerts);
    expect(overdueBadge).not.toHaveAttribute('data-variant', 'destructive');
  });
});
