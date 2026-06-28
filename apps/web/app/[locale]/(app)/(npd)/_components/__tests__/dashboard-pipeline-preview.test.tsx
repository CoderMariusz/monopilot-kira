/**
 * T-133 — DashboardPipelinePreview RED tests.
 *
 * Prototype contract: prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174
 * RED scope: tests only. The production component is expected to be added by IMPL.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DashboardPipelinePreview } from '../dashboard-pipeline-preview';
import type { DashboardPipelinePreviewProps } from '../dashboard-pipeline-preview';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string | { pathname?: string }; children: React.ReactNode }) => {
    const resolvedHref = typeof href === 'string' ? href : href.pathname ?? '';
    return React.createElement('a', { href: resolvedHref, ...props }, children);
  },
}));

const sampleRecentProjects: DashboardPipelinePreviewProps['recentProjects'] = [
  {
    id: 'npd-project-001',
    projectId: 'npd-project-001',
    code: 'FA5601',
    productCode: 'FA5601',
    name: 'High Protein Strawberry Yogurt',
    owner: 'Jane Nowak',
    currentGate: 'Technical',
    gateStatus: 'in-progress',
  },
  {
    id: 'npd-project-002',
    projectId: 'npd-project-002',
    code: 'FA5602',
    productCode: 'FA5602',
    name: 'Blueberry Oat Drink',
    owner: 'Marta Kowalska',
    currentGate: 'Commercial',
    gateStatus: 'blocked',
  },
];

function makeRecentProject(index: number): DashboardPipelinePreviewProps['recentProjects'][number] {
  const code = `FA57${String(index).padStart(2, '0')}`;
  return {
    id: `npd-project-${index}`,
    projectId: `npd-project-${index}`,
    code,
    productCode: code,
    name: `Compact preview project ${index}`,
    owner: 'NPD Owner',
    currentGate: index % 2 === 0 ? 'Commercial' : 'Technical',
    gateStatus: ['todo', 'in-progress', 'blocked', 'done'][index % 4] as DashboardPipelinePreviewProps['recentProjects'][number]['gateStatus'],
  };
}

function renderPreview(recentProjects: DashboardPipelinePreviewProps['recentProjects']) {
  return render(<DashboardPipelinePreview recentProjects={recentProjects} />);
}

describe('AC1: populated pipeline preview card parity', () => {
  it('renders a shadcn Card with header, view-all link, rows, and gate-status Badge dots', async () => {
    const { container } = await renderPreview(sampleRecentProjects);

    const card = container.querySelector('[data-slot="card"]') ?? screen.getByRole('region', { name: /pipeline/i });
    expect(card, 'preview must render as a shadcn Card surface or named region').toBeInTheDocument();

    const header = container.querySelector('[data-slot="card-header"]') ?? within(card as HTMLElement).getByText(/pipeline \(recent\)/i).closest('div');
    expect(header, 'Card header must contain the compact pipeline title').toBeInTheDocument();
    expect(within(card as HTMLElement).getByText('Pipeline (recent)')).toBeInTheDocument();

    const viewAllLink = within(card as HTMLElement).getByRole('link', { name: /view all/i });
    expect(viewAllLink).toHaveAttribute('href', '/pipeline');

    for (const project of sampleRecentProjects) {
      const row = within(card as HTMLElement).getByRole('link', { name: new RegExp(`${project.code}.*${project.name}`, 'i') });
      expect(row).toBeInTheDocument();
      expect(row).toHaveTextContent(project.owner);
      expect(row).toHaveTextContent(project.currentGate);
    }

    const badges = Array.from(container.querySelectorAll('[data-slot="badge"]'));
    expect(badges, 'each project row must render a shadcn Badge dot for gate status').toHaveLength(sampleRecentProjects.length);
    expect(badges[0]).toHaveTextContent(/in progress/i);
    expect(badges[1]).toHaveTextContent(/blocked/i);
    expect(badges.every((badge) => /●|•|dot/i.test(badge.textContent ?? '') || badge.querySelector('[aria-hidden="true"]'))).toBe(true);
  });

  it('keeps the mini-view compact by rendering no more than the first ten recent projects', async () => {
    const elevenRecentProjects = Array.from({ length: 11 }, (_, index) => makeRecentProject(index + 1));
    const { container } = await renderPreview(elevenRecentProjects);

    const card = container.querySelector('[data-slot="card"]') ?? screen.getByRole('region', { name: /pipeline/i });
    const projectRows = within(card as HTMLElement).getAllByRole('link', { name: /FA57\d{2}.*Compact preview project/i });

    expect(projectRows, 'Dashboard mini-view must stay within the top 5-10 recent-project rows').toHaveLength(10);
    expect(within(card as HTMLElement).queryByRole('link', { name: /FA5711.*Compact preview project 11/i })).not.toBeInTheDocument();
  });
});

describe('AC2: empty recentProjects state', () => {
  it('renders an empty Card body and no project row links when recentProjects is empty', async () => {
    const { container } = await renderPreview([]);

    const card = container.querySelector('[data-slot="card"]') ?? screen.getByRole('region', { name: /pipeline/i });
    expect(within(card as HTMLElement).getByText('Pipeline (recent)')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="card-content"]'), 'empty state must live in the Card body/content').toBeInTheDocument();
    expect(within(card as HTMLElement).getByText(/no recent projects|no pipeline projects|pipeline is empty/i)).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByRole('link', { name: /FA\d{4}/i })).not.toBeInTheDocument();
  });
});

describe('AC3: row navigation target', () => {
  it('makes each row a link to the matching FA detail or pipeline detail route', async () => {
    await renderPreview(sampleRecentProjects);

    const firstRow = screen.getByRole('link', { name: /FA5601.*High Protein Strawberry Yogurt/i });
    const href = firstRow.getAttribute('href');
    expect(href).toBeTruthy();
    expect(
      ['/fg/FA5601', '/pipeline/npd-project-001'].some((allowedHref) => href === allowedHref),
      `row href must target either /(npd)/fg/[productCode] or /(npd)/pipeline/[projectId], got ${href}`,
    ).toBe(true);
  });
});
