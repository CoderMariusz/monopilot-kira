/**
 * @vitest-environment jsdom
 * Pipeline — 5 KPI formulas + "+ New project" navigation (full-page wizard) + RBAC.
 *
 * Prototype parity source:
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:144-184 (header CTAs + 5 KPI cards)
 *
 * The condensed create modal was replaced by a full-page wizard at
 * /{locale}/pipeline/new. The "+ New project" CTA now NAVIGATES (a <Link>) instead
 * of opening a modal; this suite asserts:
 *   - the 5 KPI cards compute from REAL rows (Active / Awaiting / Launched YTD /
 *     At risk / Avg time to launch), showing "—" honestly when no launched data;
 *   - "+ New project" links to /{locale}/pipeline/new when canCreate is true;
 *   - RBAC: with canCreate=false the CTA is a disabled button (no link target);
 *   - Import recipe stays disabled (no backend — never a fake action);
 *   - i18n: all chrome comes from injected labels (no hard-coded copy).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PipelineTabs, type PipelineTabsLabels, type PipelineKpiLabels } from '../pipeline-tabs';
import type { KanbanLabels, KanbanProject } from '../kanban-types';
import type { TableLabels } from '../table-view';
import type { SplitLabels } from '../split-labels';

const pushMock = vi.fn();
let currentParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/pipeline',
  useParams: () => ({ locale: 'en' }),
  useSearchParams: () => currentParams,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

beforeEach(() => {
  currentParams = new URLSearchParams();
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: { pathname: '/en/pipeline' },
  });
});

afterEach(() => {
  cleanup();
  pushMock.mockReset();
});

const SWITCHER_LABELS: PipelineTabsLabels = {
  viewsLabel: 'Pipeline views',
  tabKanban: 'Kanban',
  tabTable: 'Table',
  tabSplit: 'Split',
  filtersLabel: 'Filters',
  filterAll: 'All',
  filterMine: 'Mine',
  filterBrief: 'Brief',
  filterRecipe: 'Recipe',
  filterTrial: 'Trial',
  filterApproval: 'Approval',
  searchLabel: 'Search projects',
  searchPlaceholder: 'Search…',
  newProject: 'New project',
  importRecipe: 'Import recipe',
  importRecipeDisabledHint: 'Recipe import is not available yet.',
  pageTitle: 'New Product Development',
  pageSubtitle: 'Pipeline oversight.',
  breadcrumbRoot: 'NPD',
  breadcrumbCurrent: 'Pipeline',
};

const KPI_LABELS: PipelineKpiLabels = {
  activeLabel: 'Active projects',
  activeHint: 'Projects in gates G0–G4',
  awaitingLabel: 'Awaiting approval',
  awaitingHint: 'At gates G3/G4',
  launchedLabel: 'Launched YTD',
  launchedHint: '↑ vs last year',
  atRiskLabel: 'At risk',
  atRiskHint: 'Margin / behind schedule',
  avgTimeLabel: 'Avg time to launch',
  avgTimeHint: 'Target: 90 days',
  avgTimeUnit: 'days',
  empty: '—',
};

function stageLabels(): KanbanLabels {
  return {
    title: 'Pipeline',
    subtitle: 'sub',
    stageBrief: 'Brief',
    stageRecipe: 'Recipe',
    stagePackaging: 'Packaging',
    stageTrial: 'Trial',
    stageSensory: 'Sensory',
    stagePilot: 'Pilot',
    stageApproval: 'Approval',
    stageHandoff: 'Handoff',
    gateG0: 'G0',
    gateG1: 'G1',
    gateG2: 'G2',
    gateG3: 'G3',
    gateG4: 'G4',
    gateLaunched: 'Launched',
    prioHigh: 'High',
    prioNormal: 'Normal',
    prioLow: 'Low',
    advance: 'Advance',
    advancing: 'Advancing',
    noOwner: 'Unassigned',
    noTarget: 'No target',
    columnEmpty: '—',
    open: 'Open',
    loading: 'Loading',
    empty: 'Empty',
    emptyBody: 'Empty body',
    error: 'Error',
    forbidden: 'Forbidden',
    advanceError: 'Advance error',
    adjacencyError: 'Adjacency error',
  };
}

const TABLE_LABELS = { title: 'Pipeline' } as unknown as TableLabels;
const SPLIT_LABELS = { title: 'Pipeline', subtitle: '' } as unknown as SplitLabels;

const advanceStub = vi.fn(async () => ({ ok: true as const, data: { currentGate: 'G1' as const } }));

const thisYear = new Date().getUTCFullYear();
const KPI_PROJECTS: KanbanProject[] = [
  { id: '1', code: 'NPD-001', name: 'Alpha', type: 'Meat', currentGate: 'G1', currentStage: 'brief', prio: 'high', owner: 'A', targetLaunch: '2999-01-01', progressPercent: 10, createdAt: `${thisYear}-01-01T00:00:00.000Z` },
  { id: '2', code: 'NPD-002', name: 'Beta', type: 'Meat', currentGate: 'G3', currentStage: 'approval', prio: 'normal', owner: 'B', targetLaunch: '2999-01-01', progressPercent: 80, createdAt: `${thisYear}-02-01T00:00:00.000Z` },
  { id: '3', code: 'NPD-003', name: 'Gamma', type: 'Meat', currentGate: 'Launched', currentStage: 'handoff', prio: 'low', owner: 'C', targetLaunch: '2025-01-01', progressPercent: 100, createdAt: `${thisYear}-01-15T00:00:00.000Z` },
];

function renderTabs(overrides: Partial<React.ComponentProps<typeof PipelineTabs>> = {}) {
  const props = {
    projects: KPI_PROJECTS,
    switcherLabels: SWITCHER_LABELS,
    kpiLabels: KPI_LABELS,
    kanbanLabels: stageLabels(),
    tableLabels: TABLE_LABELS,
    splitLabels: SPLIT_LABELS,
    canAdvance: false,
    state: 'ready' as const,
    advanceAction: advanceStub,
    canCreate: true,
    ...overrides,
  };
  return render(<PipelineTabs {...props} />);
}

describe('PipelineTabs — 5 KPI cards from real rows', () => {
  it('computes Active / Awaiting / Launched YTD / At risk from the row data', () => {
    renderTabs();
    expect(screen.getByTestId('kpi-active')).toHaveTextContent('2');
    expect(screen.getByTestId('kpi-awaiting')).toHaveTextContent('1');
    expect(screen.getByTestId('kpi-launched')).toHaveTextContent('1');
    expect(screen.getByTestId('kpi-at-risk')).toHaveTextContent('1');
  });

  it('shows "—" for Avg time to launch when there is no launched-with-dates data', () => {
    renderTabs({
      projects: [
        { id: 'x', code: 'NPD-010', name: 'Only Brief', type: 'Meat', currentGate: 'G0', currentStage: 'brief', prio: 'normal', owner: null, targetLaunch: null, progressPercent: 0, createdAt: null },
      ],
    });
    expect(screen.getByTestId('kpi-avg-time')).toHaveTextContent('—');
    expect(screen.getByTestId('kpi-launched')).toHaveTextContent('0');
  });

  it('renders all 5 KPI labels (no hard-coded copy)', () => {
    renderTabs();
    expect(screen.getByText(KPI_LABELS.activeLabel)).toBeInTheDocument();
    expect(screen.getByText(KPI_LABELS.awaitingLabel)).toBeInTheDocument();
    expect(screen.getByText(KPI_LABELS.launchedLabel)).toBeInTheDocument();
    expect(screen.getByText(KPI_LABELS.atRiskLabel)).toBeInTheDocument();
    expect(screen.getByText(KPI_LABELS.avgTimeLabel)).toBeInTheDocument();
  });
});

describe('PipelineTabs — "+ New project" navigation + RBAC', () => {
  it('links to /{locale}/pipeline/new when canCreate is true', () => {
    renderTabs();
    const cta = screen.getByTestId('pipeline-new-project');
    expect(cta).toHaveAttribute('href', '/en/pipeline/new');
  });

  it('disables the "+ New project" CTA (a plain button, no link) when canCreate is false', () => {
    renderTabs({ canCreate: false });
    const cta = screen.getByTestId('pipeline-new-project');
    expect(cta).toBeDisabled();
    expect(cta).not.toHaveAttribute('href');
  });

  it('keeps "Import recipe" disabled (no backend — never a fake action)', () => {
    renderTabs();
    expect(screen.getByTestId('pipeline-import-recipe')).toBeDisabled();
  });
});
