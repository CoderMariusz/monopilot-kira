/**
 * T-133 — DashboardPipelinePreview RED tests.
 *
 * Prototype contract: prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174
 * RED scope: tests only. The production component is expected to be added by IMPL.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string | { pathname?: string }; children: React.ReactNode }) => {
    const resolvedHref = typeof href === 'string' ? href : href.pathname ?? '';
    return React.createElement('a', { href: resolvedHref, ...props }, children);
  },
}));

type GateStatus = 'todo' | 'in-progress' | 'blocked' | 'done';

type RecentProject = {
  id: string;
  projectId: string;
  code: string;
  productCode: string;
  name: string;
  owner: string;
  currentGate: string;
  gateStatus: GateStatus;
};

type DashboardPipelinePreviewProps = {
  recentProjects: RecentProject[];
};

type DashboardPipelinePreviewComponent = React.ComponentType<DashboardPipelinePreviewProps>;

const currentFile = fileURLToPath(import.meta.url);
const componentPath = path.resolve(path.dirname(currentFile), '../dashboard-pipeline-preview.tsx');

const sampleRecentProjects: RecentProject[] = [
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

async function loadDashboardPipelinePreview(): Promise<DashboardPipelinePreviewComponent> {
  if (!existsSync(componentPath)) {
    expect.fail(
      'DashboardPipelinePreview production component is missing at apps/web/app/(npd)/_components/dashboard-pipeline-preview.tsx; IMPL must add the client component before these RTL behavior tests can render.',
    );
  }

  const componentUrl = pathToFileURL(componentPath).href;
  const mod = (await import(componentUrl)) as {
    default?: DashboardPipelinePreviewComponent;
    DashboardPipelinePreview?: DashboardPipelinePreviewComponent;
  };
  const Component = mod.DashboardPipelinePreview ?? mod.default;
  expect(Component, 'DashboardPipelinePreview must be exported as a named or default React component').toBeTypeOf('function');
  return Component;
}

async function renderPreview(recentProjects: RecentProject[]) {
  const DashboardPipelinePreview = await loadDashboardPipelinePreview();
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
      ['/fa/FA5601', '/pipeline/npd-project-001'].some((allowedHref) => href === allowedHref),
      `row href must target either /(npd)/fa/[productCode] or /(npd)/pipeline/[projectId], got ${href}`,
    ).toBe(true);
  });
});
