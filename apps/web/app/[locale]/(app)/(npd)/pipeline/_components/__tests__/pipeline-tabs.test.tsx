/**
 * @vitest-environment jsdom
 * T-130 — Pipeline tabbed view switcher (Kanban | Table | Split) component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:133-208 (Pipeline page wrapper)
 *     - the view-mode pills (lines 197-201 ▦ Kanban / ≡ Table / ⊟ Split) → an
 *       accessible tablist whose active tab is driven by the URL ?view= param
 *       (default kanban); switching does NOT full-reload (router.push, not <a>).
 *     - the filter pills (lines 188-195 All/Mine/Brief/Recipe/Trial/Approval) →
 *       a shared filter strip above the tabs that updates ?filter=; all three
 *       view modes consume the SAME filtered project list (no per-view state).
 *
 * RED → GREEN. Asserts the T-130 acceptance criteria:
 *   1. ?view=kanban|table|split renders the matching view inside the tablist with
 *      no page reload on switch (router.push called, not navigation).
 *   2. Changing filter updates ?filter= and every view consumes the same filtered
 *      list (shared state via URL, never duplicated per view).
 *   3. Switching view modes PRESERVES ?filter, ?sort, ?dir and ?selected.
 *   + i18n: tab/filter chrome comes from injected labels (no hard-coded copy).
 *   + RBAC: canAdvance is server-resolved and passed through to the Kanban view
 *     (never client-trusted).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PipelineTabs, type PipelineTabsLabels } from '../pipeline-tabs';
import type { KanbanLabels, KanbanProject } from '../kanban-types';
import type { TableLabels } from '../table-view';
import type { SplitLabels } from '../split-labels';

const pushMock = vi.fn();
let currentParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/pipeline',
  useSearchParams: () => currentParams,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

// matchMedia stub: SplitView assumes desktop unless told otherwise.
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
  filterG0: 'G0',
  filterG1: 'G1',
  filterG2: 'G2',
  filterG3: 'G3',
  filterG4: 'G4',
  searchLabel: 'Search projects',
  searchPlaceholder: 'Search by name or code…',
};

const KANBAN_LABELS: KanbanLabels = {
  title: 'Pipeline',
  subtitle: 'Stage-Gate pipeline — projects by gate',
  gateG0: 'G0 · Concept',
  gateG1: 'G1 · Brief',
  gateG2: 'G2 · Recipe',
  gateG3: 'G3 · Trial',
  gateG4: 'G4 · Approval',
  gateLaunched: 'Launched',
  prioHigh: 'High',
  prioNormal: 'Normal',
  prioLow: 'Low',
  advance: 'Advance →',
  advancing: 'Advancing…',
  noOwner: 'Unassigned',
  noTarget: 'No target',
  columnEmpty: '—',
  open: 'Open',
  loading: 'Loading pipeline…',
  empty: 'No projects in the pipeline',
  emptyBody: 'Start a new Stage-Gate project to populate the board.',
  error: 'Unable to load the pipeline.',
  forbidden: 'You do not have permission to view the pipeline.',
  advanceError: 'Could not advance the project. The change was reverted.',
  adjacencyError: 'Projects can only advance to the next gate. The change was reverted.',
};

const TABLE_LABELS: TableLabels = {
  title: 'Pipeline',
  caption: 'NPD projects',
  colCode: 'Code',
  colName: 'Name',
  colType: 'Type',
  colGate: 'Current Gate',
  colPriority: 'Priority',
  colOwner: 'Owner',
  colTarget: 'Target Launch',
  colProgress: 'Progress',
  gateG0: 'G0 · Concept',
  gateG1: 'G1 · Brief',
  gateG2: 'G2 · Recipe',
  gateG3: 'G3 · Trial',
  gateG4: 'G4 · Approval',
  gateLaunched: 'Launched',
  prioHigh: 'High',
  prioNormal: 'Normal',
  prioLow: 'Low',
  noOwner: 'Unassigned',
  noTarget: 'No target',
  sortAsc: 'sorted ascending',
  sortDesc: 'sorted descending',
  sortNone: 'not sorted',
  selectAll: 'Select all',
  selectRow: 'Select row',
  selectedCount: '{count} selected',
  bulkAssignOwner: 'Assign owner',
  bulkSetPriority: 'Set priority',
  bulkMoveGate: 'Move gate',
  loading: 'Loading pipeline…',
  empty: 'No projects in the pipeline',
  emptyBody: 'Start a new Stage-Gate project to populate the board.',
  error: 'Unable to load the pipeline.',
  forbidden: 'You do not have permission to view the pipeline.',
};

const SPLIT_LABELS: SplitLabels = {
  title: 'Pipeline',
  subtitle: 'Split view — list + project detail',
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
  error: 'Unable to load the pipeline.',
  forbidden: 'You do not have permission to view the pipeline.',
};

const PROJECTS: KanbanProject[] = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    code: 'DEV-052',
    name: 'Strawberry Yogurt 150g',
    type: 'single',
    currentGate: 'G0',
    prio: 'high',
    owner: 'Ana Owner',
    targetLaunch: '2026-09-01',
    progressPercent: 20,
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    code: 'DEV-053',
    name: 'Oat Drink Barista',
    type: 'range',
    currentGate: 'G2',
    prio: 'normal',
    owner: null,
    targetLaunch: null,
    progressPercent: 60,
  },
];

const advanceStub = vi.fn(async () => ({ ok: true as const, data: { currentGate: 'G1' as const } }));

function renderTabs(overrides: Partial<React.ComponentProps<typeof PipelineTabs>> = {}) {
  return render(
    <PipelineTabs
      projects={PROJECTS}
      switcherLabels={SWITCHER_LABELS}
      kanbanLabels={KANBAN_LABELS}
      tableLabels={TABLE_LABELS}
      splitLabels={SPLIT_LABELS}
      canAdvance={false}
      state="ready"
      advanceAction={advanceStub}
      {...overrides}
    />,
  );
}

describe('PipelineTabs — tablist + view routing (AC1)', () => {
  it('renders an accessible tablist with Kanban/Table/Split tabs', () => {
    renderTabs();
    const tablist = screen.getByRole('tablist', { name: SWITCHER_LABELS.viewsLabel });
    expect(within(tablist).getByRole('tab', { name: SWITCHER_LABELS.tabKanban })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: SWITCHER_LABELS.tabTable })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: SWITCHER_LABELS.tabSplit })).toBeInTheDocument();
  });

  it('defaults to the Kanban view when ?view= is absent', () => {
    renderTabs();
    expect(screen.getByTestId('kanban-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('pipeline-table-screen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('split-screen')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: SWITCHER_LABELS.tabKanban })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('renders the Table view when ?view=table', () => {
    currentParams = new URLSearchParams('view=table');
    renderTabs();
    expect(screen.getByTestId('pipeline-table-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('kanban-screen')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: SWITCHER_LABELS.tabTable })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('renders the Split view when ?view=split', () => {
    currentParams = new URLSearchParams('view=split');
    renderTabs();
    expect(screen.getByTestId('split-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('kanban-screen')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: SWITCHER_LABELS.tabSplit })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('switches view via router.push (no full reload) when a tab is clicked', () => {
    renderTabs();
    fireEvent.click(screen.getByRole('tab', { name: SWITCHER_LABELS.tabTable }));
    expect(pushMock).toHaveBeenCalled();
    const url = pushMock.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain('view=table');
  });
});

describe('PipelineTabs — shared filter state via URL (AC2)', () => {
  it('renders shared filter chips above the tabs', () => {
    renderTabs();
    const filters = screen.getByRole('group', { name: SWITCHER_LABELS.filtersLabel });
    expect(within(filters).getByRole('button', { name: SWITCHER_LABELS.filterAll })).toBeInTheDocument();
    expect(within(filters).getByRole('button', { name: SWITCHER_LABELS.filterMine })).toBeInTheDocument();
  });

  it('updates ?filter= when a filter chip is clicked (shared, not per-view)', () => {
    renderTabs();
    fireEvent.click(screen.getByRole('button', { name: SWITCHER_LABELS.filterMine }));
    expect(pushMock).toHaveBeenCalled();
    const url = pushMock.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain('filter=mine');
  });

  it('marks the active filter from the URL', () => {
    currentParams = new URLSearchParams('filter=mine');
    renderTabs();
    expect(screen.getByRole('button', { name: SWITCHER_LABELS.filterMine })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: SWITCHER_LABELS.filterAll })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('feeds the SAME projects array to whichever view is active (no per-view fetch)', () => {
    currentParams = new URLSearchParams('view=table');
    renderTabs();
    // both rows from the shared list are present in the table view
    expect(screen.getByTestId('pipeline-table-row-DEV-052')).toBeInTheDocument();
    expect(screen.getByTestId('pipeline-table-row-DEV-053')).toBeInTheDocument();
  });
});

describe('PipelineTabs — params preserved across switches (AC3)', () => {
  it('preserves ?filter, ?sort, ?dir, ?selected when switching tabs', () => {
    currentParams = new URLSearchParams(
      'view=table&filter=mine&sort=name&dir=desc&selected=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    );
    renderTabs();
    fireEvent.click(screen.getByRole('tab', { name: SWITCHER_LABELS.tabSplit }));
    const url = pushMock.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain('view=split');
    expect(url).toContain('filter=mine');
    expect(url).toContain('sort=name');
    expect(url).toContain('dir=desc');
    expect(url).toContain('selected=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  });

  it('preserves the active filter when switching tabs (shared state contract)', () => {
    currentParams = new URLSearchParams('filter=mine');
    renderTabs();
    fireEvent.click(screen.getByRole('tab', { name: SWITCHER_LABELS.tabTable }));
    const url = pushMock.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain('filter=mine');
    expect(url).toContain('view=table');
  });
});

describe('PipelineTabs — RBAC + states + i18n', () => {
  it('forwards server-resolved canAdvance to the Kanban view (never client-trusted)', () => {
    renderTabs({ canAdvance: true });
    // Kanban active by default; the advance affordance is present only when canAdvance.
    expect(screen.getByTestId('kanban-screen')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: KANBAN_LABELS.advance }).length).toBeGreaterThan(0);
  });

  it('omits the advance affordance when canAdvance is false', () => {
    renderTabs({ canAdvance: false });
    expect(screen.queryByRole('button', { name: KANBAN_LABELS.advance })).not.toBeInTheDocument();
  });

  it('renders the loading state inside the active view', () => {
    renderTabs({ state: 'loading', projects: [] });
    expect(screen.getByRole('status')).toHaveTextContent(KANBAN_LABELS.loading);
  });

  it('renders the permission_denied state', () => {
    renderTabs({ state: 'permission_denied', projects: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(KANBAN_LABELS.forbidden);
  });

  it('renders the error state', () => {
    renderTabs({ state: 'error', projects: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(KANBAN_LABELS.error);
  });

  it('renders the empty state', () => {
    renderTabs({ state: 'empty', projects: [] });
    expect(screen.getAllByText(KANBAN_LABELS.empty).length).toBeGreaterThan(0);
  });

  it('uses only injected labels for the switcher chrome (no hard-coded strings)', () => {
    renderTabs();
    expect(screen.getByRole('tablist', { name: SWITCHER_LABELS.viewsLabel })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: SWITCHER_LABELS.filterAll }),
    ).toBeInTheDocument();
  });
});
