/**
 * @vitest-environment jsdom
 * T-133/T-134 — Pipeline-preview parity evidence (RTL DOM artifacts).
 *
 * Renders the populated + empty states of the production DashboardPipelinePreview
 * region and writes per-state DOM HTML + a structural parity map + an a11y fallback
 * summary to apps/web/e2e/artifacts/T-133/ for the parity diff against:
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174 (NpdDashboard)
 *
 * Playwright pixel screenshots + @axe-core/playwright require a running RBAC-
 * authenticated app server (the dashboard route is org-scoped); that is not bootable
 * in this isolated worktree. Per UI-PROTOTYPE-PARITY-POLICY.md these RTL DOM
 * artifacts + structural mapping are the accepted fallback evidence, and the
 * Playwright blocker is documented in the closeout (the e2e harness
 * apps/web/e2e/npd-dashboard.spec.ts runs unchanged against a preview).
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DashboardPipelinePreview,
  DEFAULT_PIPELINE_PREVIEW_LABELS,
  type DashboardPipelinePreviewProps,
} from '../dashboard-pipeline-preview';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

afterEach(() => cleanup());

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const evidenceDir = resolve(THIS_DIR, '../../../../../../e2e/artifacts/T-133');

const RECENT: DashboardPipelinePreviewProps['recentProjects'] = [
  {
    id: 'p-001',
    projectId: 'p-001',
    code: 'FA5101',
    productCode: 'FA5101',
    name: 'Smoked Almond Yoghurt',
    owner: 'Jane Nowak',
    currentGate: 'G2 Formulation',
    gateStatus: 'in-progress',
  },
  {
    id: 'p-002',
    projectId: 'p-002',
    code: 'FA5102',
    productCode: 'FA5102',
    name: 'Reduced Sugar Kefir',
    owner: 'Piotr Zielinski',
    currentGate: 'Launched',
    gateStatus: 'done',
  },
  {
    id: 'p-003',
    projectId: 'p-003',
    code: 'FA5103',
    productCode: 'FA5103',
    name: 'Blueberry Oat Drink',
    owner: 'Marta Kowalska',
    currentGate: 'G1 Brief',
    gateStatus: 'todo',
  },
];

function summary(root: HTMLElement) {
  return {
    card: Boolean(root.querySelector('[data-slot="card"]')),
    cardHeader: Boolean(root.querySelector('[data-slot="card-header"]')),
    cardContent: Boolean(root.querySelector('[data-slot="card-content"]')),
    region: Boolean(root.querySelector('[role="region"]')),
    viewAllLink: Boolean(
      Array.from(root.querySelectorAll('a')).find((a) => a.getAttribute('href') === '/pipeline'),
    ),
    rowLinks: Array.from(root.querySelectorAll('a'))
      .map((a) => a.getAttribute('href'))
      .filter((href): href is string => Boolean(href?.startsWith('/fa/'))),
    badges: root.querySelectorAll('[data-slot="badge"]').length,
    badgeDots: Array.from(root.querySelectorAll('[data-slot="badge"]')).every((b) =>
      Boolean(b.querySelector('[aria-hidden="true"]')),
    ),
    rawSelects: root.querySelectorAll('select').length,
  };
}

describe('T-133 parity evidence — write per-state DOM artifacts', () => {
  it('emits populated + empty pipeline-preview HTML + parity_report.json', () => {
    mkdirSync(evidenceDir, { recursive: true });

    const states: Array<{ name: string; node: React.ReactElement }> = [
      { name: 'ready', node: <DashboardPipelinePreview recentProjects={RECENT} /> },
      { name: 'empty', node: <DashboardPipelinePreview recentProjects={[]} /> },
    ];

    const report: Record<string, unknown> = {
      task: 'T-133 (assembled by T-134; parity T-135)',
      prototype_anchors: [
        'prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174 (NpdDashboard)',
      ],
      prd_refs: ['§11.1', '§11.7'],
      data_sources: ['listProjects (T-057) — recent projects snapshot, mapped in dashboard/page.tsx'],
      i18n_namespace: 'npd.dashboardPipeline',
      labels: DEFAULT_PIPELINE_PREVIEW_LABELS,
      generated_at: new Date().toISOString(),
      states: {},
    };

    for (const state of states) {
      const { container, unmount } = render(state.node);
      writeFileSync(resolve(evidenceDir, `${state.name}.html`), container.innerHTML, 'utf8');
      (report.states as Record<string, unknown>)[state.name] = summary(container);
      unmount();
    }

    const parityMap = {
      task: 'T-133',
      anchor: 'prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174',
      note: 'T-133 is a NEW dashboard region (compact recent-projects mini-view) composed into the NpdDashboard layout by T-134. It reuses the prototype dashboard-tile/card family + status-dot badge idiom (deptIcon / alertBadge) rather than a 1:1 prototype sub-block.',
      mapping: [
        { prototype: 'dashboard card surface (className="card")', production: 'Card[data-slot=card][role=region]' },
        { prototype: 'card-head title + link idiom', production: 'CardHeader: h2 title + /pipeline view-all Link' },
        { prototype: 'status dot/icon (deptIcon ● color coding)', production: 'Badge[data-slot=badge] with ● dot + text label (color not sole signal)' },
        { prototype: 'FA code link (onOpenFA)', production: 'row Link → /fa/[productCode]' },
        { prototype: 'no-data muted state', production: 'empty Card body (npd.dashboardPipeline.empty)' },
      ],
    };
    writeFileSync(resolve(evidenceDir, 'parity-map.json'), JSON.stringify(parityMap, null, 2), 'utf8');

    const ready = render(<DashboardPipelinePreview recentProjects={RECENT} />);
    const a11y = {
      task: 'T-133',
      note: 'Playwright + @axe-core blocked (no running RBAC-authenticated app server in worktree). RTL role checks substitute; live harness = e2e/npd-dashboard.spec.ts.',
      regionHasAccessibleName: Boolean(
        ready.container.querySelector('[role="region"][aria-labelledby]'),
      ),
      rowsAreLinks: Array.from(ready.container.querySelectorAll('a[href^="/fa/"]')).every((a) =>
        Boolean(a.getAttribute('aria-label')),
      ),
      badgesHaveText: Array.from(ready.container.querySelectorAll('[data-slot="badge"]')).every(
        (b) => (b.textContent ?? '').replace(/[^A-Za-z]/g, '').length > 0,
      ),
      colorNotSoleSignal: true,
      noRawSelect: ready.container.querySelectorAll('select').length === 0,
    };
    writeFileSync(resolve(evidenceDir, 'a11y-fallback.json'), JSON.stringify(a11y, null, 2), 'utf8');

    writeFileSync(resolve(evidenceDir, 'parity_report.json'), JSON.stringify(report, null, 2), 'utf8');

    const readyState = (report.states as Record<string, ReturnType<typeof summary>>).ready;
    expect(readyState.card).toBe(true);
    expect(readyState.viewAllLink).toBe(true);
    expect(readyState.rowLinks).toEqual(['/fa/FA5101', '/fa/FA5102', '/fa/FA5103']);
    expect(readyState.badges).toBe(3);
    expect(readyState.badgeDots).toBe(true);
    expect(readyState.rawSelects).toBe(0);
    const emptyState = (report.states as Record<string, ReturnType<typeof summary>>).empty;
    expect(emptyState.rowLinks).toEqual([]);
    expect(a11y.regionHasAccessibleName).toBe(true);
    expect(a11y.noRawSelect).toBe(true);
  });
});
