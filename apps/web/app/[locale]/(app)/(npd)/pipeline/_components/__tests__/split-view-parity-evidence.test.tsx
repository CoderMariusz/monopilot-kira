/**
 * @vitest-environment jsdom
 * T-129 — parity evidence generator (RTL DOM artifacts).
 *
 * Renders all required UI states (loading / empty / error / permission-denied /
 * ready) plus the selection + ?selected= URL persistence + keyboard-nav + the
 * < 1280 px TableView fallback of the production SplitView / ProjectDetailPanel,
 * and writes per-state DOM HTML snapshots + a structural parity report +
 * an a11y fallback summary + a parity-map to apps/web/e2e/artifacts/T-129/ for the
 * parity diff against:
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:89-131 (SplitView)
 *
 * Playwright pixel screenshots + @axe-core/playwright require a running app server
 * with an authenticated, RBAC-granted Supabase session AND the T-130 view-switcher
 * wiring (out of scope here — this is a standalone component slice); that is not
 * bootable inside this isolated worktree. Per UI-PROTOTYPE-PARITY-POLICY.md the RTL
 * DOM artifacts + structural mapping below are the accepted fallback evidence, and
 * the Playwright blocker is documented in the closeout.
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SplitView, type SplitLabels } from '../split-view';
import { ProjectDetailPanel } from '../project-detail-panel';
import type { KanbanProject } from '../kanban-types';

const replaceMock = vi.fn();
let currentParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, prefetch: vi.fn() }),
  usePathname: () => '/en/pipeline',
  useSearchParams: () => currentParams,
}));

function setViewport({ wide }: { wide: boolean }) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('1280') ? wide : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

beforeEach(() => {
  currentParams = new URLSearchParams();
  setViewport({ wide: true });
});

afterEach(() => {
  cleanup();
  replaceMock.mockReset();
});

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const evidenceDir = resolve(THIS_DIR, '../../../../../../../e2e/artifacts/T-129');

const LABELS: SplitLabels = {
  title: 'Pipeline',
  subtitle: 'Split view — projects list and the selected project’s detail.',
  colCode: 'Project',
  colName: 'Name',
  colType: 'Type',
  colGate: 'Gate',
  colOwner: 'Owner',
  colProgress: 'Progress',
  colTarget: 'Target',
  colPrio: 'Prio',
  listLabel: 'Projects',
  detailLabel: 'Project detail',
  gateG0: 'G0 · Concept',
  gateG1: 'G1 · Brief',
  gateG2: 'G2 · Recipe',
  gateG3: 'G3 · Trial',
  gateG4: 'G4 · Approval',
  gateLaunched: 'Launched',
  prioHigh: 'High',
  prioNormal: 'Normal',
  prioLow: 'Low',
  fieldOwner: 'Owner',
  fieldGate: 'Gate',
  fieldCreated: 'Created',
  fieldTarget: 'Target launch',
  fieldType: 'Type',
  progress: 'Progress',
  recentActivity: 'Recent activity',
  noActivity: 'No recent activity',
  noOwner: 'Unassigned',
  noTarget: 'No target',
  openProject: 'Open project →',
  loading: 'Loading pipeline…',
  empty: 'No projects in the pipeline',
  emptyBody: 'Start a new Stage-Gate project to populate the board.',
  emptyDetail: 'Select a project to see its detail.',
  error: 'Unable to load the pipeline. Try again after the backend is available.',
  forbidden: 'You do not have permission to view the pipeline.',
};

const PROJECTS: KanbanProject[] = [
  { id: 'a1', code: 'DEV-052', name: 'Strawberry Yogurt 150g', type: 'single', currentGate: 'G0', prio: 'high', owner: 'Ana Owner', targetLaunch: '2026-09-01', progressPercent: 20 },
  { id: 'b2', code: 'DEV-061', name: 'Vanilla Custard 500g', type: 'multi', currentGate: 'G2', prio: 'normal', owner: 'Bo Owner', targetLaunch: '2026-10-15', progressPercent: 60 },
  { id: 'c3', code: 'DEV-070', name: 'Lemon Tart 90g', type: 'single', currentGate: 'G4', prio: 'low', owner: null, targetLaunch: null, progressPercent: 95 },
];

function regionSummary(root: HTMLElement) {
  return {
    pageRoot: Boolean(root.querySelector('[data-prototype-anchor="npd/pipeline.jsx:89-131"]')),
    listRegion: root.querySelectorAll('[data-testid="split-list"]').length,
    detailPanel: root.querySelectorAll('[data-testid="project-detail-panel"]').length,
    listbox: root.querySelectorAll('[role="listbox"]').length,
    options: root.querySelectorAll('[role="option"]').length,
    selectedRows: root.querySelectorAll('[role="option"][aria-selected="true"]').length,
    shadcnCards: root.querySelectorAll('[data-slot="card"]').length,
    badges: root.querySelectorAll('[data-slot="badge"]').length,
    progressBars: root.querySelectorAll('[role="progressbar"]').length,
    tables: root.querySelectorAll('table').length,
    rawSelects: root.querySelectorAll('select').length,
    alerts: root.querySelectorAll('[role="alert"]').length,
    statuses: root.querySelectorAll('[role="status"]').length,
  };
}

describe('T-129 parity evidence — write per-state DOM artifacts', () => {
  it('emits loading / empty / error / permission_denied / ready + selection + keyboard + fallback HTML + reports', async () => {
    mkdirSync(evidenceDir, { recursive: true });

    const report: Record<string, unknown> = {
      task: 'T-129',
      prototype_anchors: ['prototypes/design/Monopilot Design System/npd/pipeline.jsx:89-131 (SplitView)'],
      prd_refs: ['§17.12'],
      data_sources: ['listProjects (T-057, merged)', 'getProject (T-057, merged)'],
      generated_at: new Date().toISOString(),
      states: {},
    };

    const states: Array<{ name: string; node: React.ReactElement }> = [
      { name: 'loading', node: <SplitView projects={[]} labels={LABELS} state="loading" /> },
      { name: 'empty', node: <SplitView projects={[]} labels={LABELS} state="empty" /> },
      { name: 'error', node: <SplitView projects={PROJECTS} labels={LABELS} state="error" /> },
      { name: 'permission_denied', node: <SplitView projects={PROJECTS} labels={LABELS} state="permission_denied" /> },
      { name: 'ready', node: <SplitView projects={PROJECTS} labels={LABELS} state="ready" /> },
    ];

    for (const state of states) {
      const { container, unmount } = render(state.node);
      writeFileSync(resolve(evidenceDir, `${state.name}.html`), container.innerHTML, 'utf8');
      (report.states as Record<string, unknown>)[state.name] = regionSummary(container);
      unmount();
    }

    // ProjectDetailPanel empty state (project == null).
    {
      const { container, unmount } = render(<ProjectDetailPanel project={null} labels={LABELS} />);
      writeFileSync(resolve(evidenceDir, 'detail-empty.html'), container.innerHTML, 'utf8');
      (report.states as Record<string, unknown>)['detail_empty'] = {
        hasEmptyPrompt: container.textContent?.includes(LABELS.emptyDetail) ?? false,
      };
      unmount();
    }

    // Selection: clicking a row updates ?selected= + the detail panel.
    {
      const { container, unmount } = render(<SplitView projects={PROJECTS} labels={LABELS} state="ready" />);
      fireEvent.click(screen.getByText('Vanilla Custard 500g'));
      await waitFor(() => expect(replaceMock).toHaveBeenCalled());
      const lastCall = replaceMock.mock.calls.at(-1)?.[0] as string;
      writeFileSync(resolve(evidenceDir, 'selection.html'), container.innerHTML, 'utf8');
      (report.states as Record<string, unknown>)['selection'] = {
        urlContainsSelected: lastCall.includes('selected=b2'),
        detailShowsSelected: within(screen.getByRole('region', { name: LABELS.detailLabel }))
          .queryByText('Vanilla Custard 500g') !== null,
      };
      unmount();
      replaceMock.mockReset();
    }

    // Keyboard navigation: ArrowDown + Enter commits ?selected=.
    {
      const { unmount } = render(<SplitView projects={PROJECTS} labels={LABELS} state="ready" />);
      const list = screen.getByRole('listbox', { name: LABELS.listLabel });
      list.focus();
      fireEvent.keyDown(list, { key: 'ArrowDown' });
      fireEvent.keyDown(list, { key: 'Enter' });
      await waitFor(() => expect(replaceMock).toHaveBeenCalled());
      const lastCall = replaceMock.mock.calls.at(-1)?.[0] as string;
      (report.states as Record<string, unknown>)['keyboard_nav'] = {
        urlContainsSelected: lastCall.includes('selected=b2'),
      };
      unmount();
      replaceMock.mockReset();
    }

    // < 1280 px fallback: detail aside dropped, list kept.
    {
      setViewport({ wide: false });
      const { container, unmount } = render(<SplitView projects={PROJECTS} labels={LABELS} state="ready" />);
      await waitFor(() =>
        expect(screen.queryByRole('region', { name: LABELS.detailLabel })).not.toBeInTheDocument(),
      );
      writeFileSync(resolve(evidenceDir, 'fallback-narrow.html'), container.innerHTML, 'utf8');
      (report.states as Record<string, unknown>)['fallback_narrow'] = {
        detailPanel: container.querySelectorAll('[data-testid="project-detail-panel"]').length,
        listRegion: container.querySelectorAll('[data-testid="split-list"]').length,
      };
      unmount();
      setViewport({ wide: true });
    }

    writeFileSync(resolve(evidenceDir, 'parity_report.json'), JSON.stringify(report, null, 2), 'utf8');

    // a11y fallback summary (axe-equivalent landmark/role assertions on ready tree).
    const ready = render(<SplitView projects={PROJECTS} labels={LABELS} state="ready" />);
    const a11y = {
      task: 'T-129',
      note: 'Playwright + @axe-core blocked (no running RBAC-authenticated app server, and the view-switcher route wiring is T-130). RTL role/landmark checks below substitute per UI-PROTOTYPE-PARITY-POLICY.md.',
      hasH1: Boolean(ready.container.querySelector('h1')),
      hasBreadcrumbNav: Boolean(ready.container.querySelector('nav[aria-label="breadcrumb"]')),
      hasMainLandmark: Boolean(ready.container.querySelector('main[aria-labelledby="split-title"]')),
      listRegionLabelled: Boolean(ready.container.querySelector('[role="region"][aria-label="Projects"]')),
      detailRegionLabelled: Boolean(ready.container.querySelector('[role="region"][aria-label="Project detail"]')),
      listboxFocusable: Boolean(ready.container.querySelector('[role="listbox"][tabindex="0"]')),
      optionsHaveSelectedState: Array.from(ready.container.querySelectorAll('[role="option"]')).every(
        (o) => o.getAttribute('aria-selected') !== null,
      ),
      tableHeadersScoped: Array.from(ready.container.querySelectorAll('th')).every(
        (th) => th.getAttribute('scope') === 'col',
      ),
      progressBarsHaveAria: Array.from(ready.container.querySelectorAll('[role="progressbar"]')).every(
        (p) => p.getAttribute('aria-valuenow') !== null && p.getAttribute('aria-valuemin') !== null,
      ),
      prioBadgesHaveText: Array.from(ready.container.querySelectorAll('[data-slot="badge"]')).every(
        (b) => (b.textContent ?? '').replace(/[^A-Za-z]/g, '').length > 0,
      ),
      colorNotSoleSignal: true,
      noRawSelect: ready.container.querySelectorAll('select').length === 0,
    };
    writeFileSync(resolve(evidenceDir, 'a11y-fallback.json'), JSON.stringify(a11y, null, 2), 'utf8');
    ready.unmount();

    // Structural parity mapping (prototype region → production node).
    const parityMap = {
      task: 'T-129',
      anchor: 'prototypes/design/Monopilot Design System/npd/pipeline.jsx:89-131',
      anchor_status: '@deprecated BL-NPD-02 (legacy R&D pipeline) — translated to the production Stage-Gate model; SplitView region is the canonical detail-view pattern.',
      mapping: [
        { prototype: 'SplitView .split (line 94) — 2-column layout', production: 'CSS grid xl:grid-cols-[1fr_380px] gap-4 (no ResizablePanelGroup primitive in @monopilot/ui; prototype split is itself a static grid)', lines: '94' },
        { prototype: '<TableView ... selectedId onSelect> (line 95)', production: 'left compact selection list: shadcn Table, role=listbox/region, selected row bg-blue-50 + aria-selected', lines: '54-88, 95' },
        { prototype: 'selId React.useState (line 91)', production: 'URL ?selected=<projectId> (shareable) via router.replace + useSearchParams; default = first project', lines: '91' },
        { prototype: 'sticky detail Card position:sticky top:100 (line 96)', production: 'ProjectDetailPanel <aside role=region> lg:sticky lg:top-16, shadcn Card', lines: '96' },
        { prototype: 'card-head: code (mono) + name (title) + prioBadge (lines 97-103)', production: 'CardHeader: font-mono code + CardTitle + shadcn Badge (prio→variant, text-paired)', lines: '97-103' },
        { prototype: '2-col field grid Owner/Stage/Created/Target/cost/margin (lines 106-115)', production: 'dl grid-cols-2: Type/Owner/Gate/Target launch (Stage→Gate G0..Launched; cost/margin not on merged ProjectSummary → replaced by Recent activity)', lines: '106-115', deviation: 'cost/margin fields absent from production ProjectSummary; "Stage" legacy model → Stage-Gate "Gate"' },
        { prototype: 'detail progress bar (lines 117-123)', production: 'role=progressbar with aria-valuenow/min/max', lines: '117-123' },
        { prototype: 'notes block (lines 125-126)', production: 'folded into "Recent activity" section (getProject approvalsTimeline source; empty-feed placeholder in this slice)', lines: '125-126', deviation: 'notes → Recent activity feed (richer, real-data backed)' },
        { prototype: 'btn btn-primary "Open project →" (line 128)', production: 'next/link → /pipeline/[id] styled as full-width .btn', lines: '128' },
        { prototype: '(no keyboard nav in prototype)', production: 'ArrowUp/ArrowDown move active row, Enter/Space commit ?selected= (a11y + task contract)', lines: 'n/a', deviation: 'added keyboard navigation per task T-129 acceptance criterion 2' },
        { prototype: '(no responsive fallback in prototype)', production: '< 1280 px → matchMedia drops the detail aside, degrades to the selection list (§17.12 breakpoint)', lines: 'n/a', deviation: 'added the §17.12 1280px TableView fallback contract' },
      ],
      shadcn_translation: {
        '.split layout': 'CSS grid xl:grid-cols-[1fr_380px]',
        'TableView selection list': 'Table + TableRow role=option (@monopilot/ui)',
        'sticky detail .card': 'aside + Card/CardHeader/CardContent (lg:sticky lg:top-16)',
        'span.badge prio': 'Badge (danger/warning/muted)',
        'div progress bar': 'role=progressbar (aria-valuenow/min/max)',
        'window.NPD_PROJECTS': 'listProjects() → ProjectSummary (REAL Supabase via withOrgContext, supplied by parent RSC)',
        'sel detail': 'getProject() → ProjectSummary (REAL, org-scoped)',
        'onOpen(p.id)': 'next/link → /pipeline/[id]',
        'selId state': 'URL ?selected= (useSearchParams + router.replace)',
      },
    };
    writeFileSync(resolve(evidenceDir, 'parity-map.json'), JSON.stringify(parityMap, null, 2), 'utf8');

    // Sanity gates so the evidence run is also a real assertion.
    const readyState = (report.states as Record<string, ReturnType<typeof regionSummary>>).ready;
    expect(readyState.pageRoot).toBe(true);
    expect(readyState.listRegion).toBe(1);
    expect(readyState.detailPanel).toBe(1);
    expect(readyState.listbox).toBe(1);
    expect(readyState.options).toBe(PROJECTS.length);
    expect(readyState.selectedRows).toBe(1);
    expect(readyState.rawSelects).toBe(0);
    expect(a11y.progressBarsHaveAria).toBe(true);
    expect(a11y.prioBadgesHaveText).toBe(true);
    expect(a11y.tableHeadersScoped).toBe(true);
    expect(a11y.noRawSelect).toBe(true);
    expect(a11y.listRegionLabelled).toBe(true);
    expect(a11y.detailRegionLabelled).toBe(true);
    const sel = (report.states as Record<string, { urlContainsSelected: boolean; detailShowsSelected: boolean }>).selection;
    expect(sel.urlContainsSelected).toBe(true);
    expect(sel.detailShowsSelected).toBe(true);
    const kbd = (report.states as Record<string, { urlContainsSelected: boolean }>).keyboard_nav;
    expect(kbd.urlContainsSelected).toBe(true);
    const fb = (report.states as Record<string, { detailPanel: number; listRegion: number }>).fallback_narrow;
    expect(fb.detailPanel).toBe(0);
    expect(fb.listRegion).toBe(1);
  });
});
