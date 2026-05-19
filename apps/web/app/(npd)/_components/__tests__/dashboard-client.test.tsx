/**
 * @vitest-environment jsdom
 * T-134 — RED: NPD dashboard page wiring client wrapper.
 *
 * These tests specify the behavior before apps/web/app/(npd)/_components/dashboard-client.tsx
 * exists. The dynamic loader converts the missing wrapper into an empty component
 * so RED fails on behavior assertions instead of module-resolution errors.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

type DashboardSummary = {
  totalFas: number;
  byStatus: {
    done: number;
    pending: number;
    blocked: number;
  };
  overdueAlerts: number;
};

type RecentNpdProject = {
  projectId: string;
  productCode: string;
  projectName: string;
  owner: string;
  currentGate: string;
  gateStatus: 'todo' | 'in-progress' | 'blocked' | 'done';
};

type DashboardClientProps = {
  summary: DashboardSummary;
  recentProjects: RecentNpdProject[];
};

type DashboardClientComponent = (props: DashboardClientProps) => React.ReactElement;

const SUMMARY_FIXTURE: DashboardSummary = {
  totalFas: 9,
  byStatus: {
    done: 3,
    pending: 4,
    blocked: 2,
  },
  overdueAlerts: 5,
};

const RECENT_PROJECTS_FIXTURE: RecentNpdProject[] = [
  {
    projectId: 'npd-project-fa5101',
    productCode: 'FA5101',
    projectName: 'Smoked Almond Yoghurt',
    owner: 'Jane Nowak',
    currentGate: 'G2 Formulation',
    gateStatus: 'blocked',
  },
  {
    projectId: 'npd-project-fa5102',
    productCode: 'FA5102',
    projectName: 'Reduced Sugar Kefir',
    owner: 'Piotr Zielinski',
    currentGate: 'G3 Trial',
    gateStatus: 'in-progress',
  },
];

async function loadDashboardClient(): Promise<DashboardClientComponent> {
  try {
    const modulePath = '../dashboard-client';
    const mod = await import(/* @vite-ignore */ modulePath);
    return (mod.DashboardClient ?? mod.default) as DashboardClientComponent;
  } catch {
    return function MissingDashboardClient() {
      return React.createElement('main', {
        'data-testid': 'missing-npd-dashboard-client',
      });
    };
  }
}

async function renderDashboardClient(
  props: DashboardClientProps = {
    summary: SUMMARY_FIXTURE,
    recentProjects: RECENT_PROJECTS_FIXTURE,
  },
) {
  const DashboardClient = await loadDashboardClient();
  return render(React.createElement(DashboardClient, props));
}

describe('T-134 NPD dashboard wrapper composition', () => {
  it('renders DashboardCounters before DashboardPipelinePreview with RSC-provided data', async () => {
    await renderDashboardClient();

    const countersRegion = screen.getByRole('region', {
      name: /dashboard counters|kpi counters|summary counters/i,
    });
    const pipelineRegion = screen.getByRole('region', {
      name: /dashboard pipeline preview|pipeline preview|pipeline \(recent\)/i,
    });

    expect(countersRegion.compareDocumentPosition(pipelineRegion)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    expect(within(countersRegion).getByText(/total fas/i)).toBeInTheDocument();
    expect(within(countersRegion).getByText('9')).toBeInTheDocument();
    expect(within(pipelineRegion).getByText(/smoked almond yoghurt/i)).toBeInTheDocument();
    expect(within(pipelineRegion).getByText(/fa5101/i)).toBeInTheDocument();
  });

  it('passes mocked RSC summary values into DashboardCounters and reacts to new props', async () => {
    const DashboardClient = await loadDashboardClient();
    const { rerender } = render(
      React.createElement(DashboardClient, {
        summary: SUMMARY_FIXTURE,
        recentProjects: RECENT_PROJECTS_FIXTURE,
      }),
    );

    const countersRegion = screen.getByRole('region', {
      name: /dashboard counters|kpi counters|summary counters/i,
    });
    expect(within(countersRegion).getByText('9')).toBeInTheDocument();
    expect(within(countersRegion).getByText('3')).toBeInTheDocument();
    expect(within(countersRegion).getByText('4')).toBeInTheDocument();
    expect(within(countersRegion).getByText('2')).toBeInTheDocument();
    expect(within(countersRegion).getByText('5')).toBeInTheDocument();

    rerender(
      React.createElement(DashboardClient, {
        summary: {
          totalFas: 17,
          byStatus: { done: 8, pending: 6, blocked: 3 },
          overdueAlerts: 1,
        },
        recentProjects: RECENT_PROJECTS_FIXTURE,
      }),
    );

    const updatedCountersRegion = screen.getByRole('region', {
      name: /dashboard counters|kpi counters|summary counters/i,
    });
    expect(within(updatedCountersRegion).getByText('17')).toBeInTheDocument();
    expect(within(updatedCountersRegion).getByText('8')).toBeInTheDocument();
    expect(within(updatedCountersRegion).getByText('6')).toBeInTheDocument();
    expect(within(updatedCountersRegion).getByText('3')).toBeInTheDocument();
    expect(within(updatedCountersRegion).getByText('1')).toBeInTheDocument();
  });

  it('exposes route links for full pipeline and each FA detail row', async () => {
    await renderDashboardClient();

    const pipelineLink = screen.getByRole('link', { name: /view all pipeline/i });
    expect(pipelineLink).toHaveAttribute('href', '/(npd)/pipeline');

    const links = screen.getAllByRole('link');
    const fa5101Link = links.find((link) => link.getAttribute('href') === '/(npd)/fa/FA5101');
    const fa5102Link = links.find((link) => link.getAttribute('href') === '/(npd)/fa/FA5102');

    expect(fa5101Link, 'FA5101 row must link to /(npd)/fa/FA5101').toBeInTheDocument();
    expect(fa5101Link).toHaveTextContent(/fa5101|smoked almond yoghurt/i);
    expect(fa5102Link, 'FA5102 row must link to /(npd)/fa/FA5102').toBeInTheDocument();
  });
});
