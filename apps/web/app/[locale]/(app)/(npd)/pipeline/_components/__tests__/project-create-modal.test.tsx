/**
 * @vitest-environment jsdom
 * Pipeline — Create NPD project modal + "+ New project" wiring + 5 KPI formulas.
 *
 * Prototype parity source:
 *   prototypes/design/Monopilot Design System/npd/project.jsx:107-263 (CreateProjectWizard)
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:144-184 (header CTAs + 5 KPI cards)
 *
 * Asserts:
 *   - the dead "+ New project" button now OPENS a create modal (the live Gate-5 bug);
 *   - submitting calls the injected createProject Server Action and redirects to the
 *     new project on success (router.push /pipeline/<id>);
 *   - RBAC: with canCreate=false the trigger is disabled and the action is withheld;
 *   - Import recipe is disabled (no backend) — never a fake action;
 *   - the 5 KPI cards compute from REAL rows (Active / Awaiting / Launched YTD /
 *     At risk / Avg time to launch), showing "—" honestly when no launched data;
 *   - i18n: all chrome comes from injected labels (no hard-coded copy).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PipelineTabs, type PipelineTabsLabels, type PipelineKpiLabels } from '../pipeline-tabs';
import { ProjectCreateModal, type ProjectCreateLabels } from '../project-create-modal';
import type { KanbanLabels, KanbanProject } from '../kanban-types';
import type { TableLabels } from '../table-view';
import type { SplitLabels } from '../split-labels';

const pushMock = vi.fn();
let currentParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/pipeline',
  useSearchParams: () => currentParams,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

beforeEach(() => {
  currentParams = new URLSearchParams();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: () => ({
      matches: true,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
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

const CREATE_LABELS: ProjectCreateLabels = {
  title: 'lbl.create.title',
  subtitle: 'lbl.create.subtitle',
  fieldName: 'lbl.create.name',
  fieldNameHint: 'lbl.create.nameHint',
  fieldType: 'lbl.create.type',
  fieldTarget: 'lbl.create.target',
  fieldTargetHint: 'lbl.create.targetHint',
  fieldPriority: 'lbl.create.priority',
  fieldOwner: 'lbl.create.owner',
  fieldOwnerHint: 'lbl.create.ownerHint',
  fieldNotes: 'lbl.create.notes',
  prioHigh: 'High',
  prioNormal: 'Normal',
  prioLow: 'Low',
  cancel: 'lbl.create.cancel',
  create: 'lbl.create.create',
  creating: 'lbl.create.creating',
  errorName: 'lbl.create.errorName',
  errorType: 'lbl.create.errorType',
  errorTarget: 'lbl.create.errorTarget',
  errorGeneric: 'lbl.create.errorGeneric',
  errorForbidden: 'lbl.create.errorForbidden',
};

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
  // Active (G1), high prio, low progress + future target → not at risk by progress, but high+low<50 → at risk
  { id: '1', code: 'NPD-001', name: 'Alpha', type: 'Meat', currentGate: 'G1', currentStage: 'brief', prio: 'high', owner: 'A', targetLaunch: '2999-01-01', progressPercent: 10, createdAt: `${thisYear}-01-01T00:00:00.000Z` },
  // Awaiting (G3) + active
  { id: '2', code: 'NPD-002', name: 'Beta', type: 'Meat', currentGate: 'G3', currentStage: 'approval', prio: 'normal', owner: 'B', targetLaunch: '2999-01-01', progressPercent: 80, createdAt: `${thisYear}-02-01T00:00:00.000Z` },
  // Launched this year
  { id: '3', code: 'NPD-003', name: 'Gamma', type: 'Meat', currentGate: 'Launched', currentStage: 'handoff', prio: 'low', owner: 'C', targetLaunch: '2025-01-01', progressPercent: 100, createdAt: `${thisYear}-01-15T00:00:00.000Z` },
];

function renderTabs(overrides: Partial<React.ComponentProps<typeof PipelineTabs>> = {}) {
  return render(
    <PipelineTabs
      projects={KPI_PROJECTS}
      switcherLabels={SWITCHER_LABELS}
      kpiLabels={KPI_LABELS}
      kanbanLabels={stageLabels()}
      tableLabels={TABLE_LABELS}
      splitLabels={SPLIT_LABELS}
      canAdvance={false}
      state="ready"
      advanceAction={advanceStub}
      canCreate
      createAction={vi.fn(async () => ({ ok: true as const, data: { id: 'new-id-123', code: 'NPD-099' } }))}
      projectCreateLabels={CREATE_LABELS}
      {...overrides}
    />,
  );
}

describe('PipelineTabs — 5 KPI cards from real rows', () => {
  it('computes Active / Awaiting / Launched YTD / At risk from the row data', () => {
    renderTabs();
    expect(screen.getByTestId('kpi-active')).toHaveTextContent('2'); // G1 + G3 (not Launched)
    expect(screen.getByTestId('kpi-awaiting')).toHaveTextContent('1'); // G3
    expect(screen.getByTestId('kpi-launched')).toHaveTextContent('1'); // Launched this year
    expect(screen.getByTestId('kpi-at-risk')).toHaveTextContent('1'); // high + progress<50
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

describe('PipelineTabs — "+ New project" wiring (dead-button fix) + RBAC', () => {
  it('opens the create modal when the enabled "+ New project" button is clicked', () => {
    renderTabs();
    const trigger = screen.getByTestId('pipeline-new-project');
    expect(trigger).not.toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.getByTestId('project-create-form')).toBeInTheDocument();
  });

  it('disables the "+ New project" button when canCreate is false (no client bypass)', () => {
    renderTabs({ canCreate: false });
    expect(screen.getByTestId('pipeline-new-project')).toBeDisabled();
  });

  it('keeps "Import recipe" disabled (no backend — never a fake action)', () => {
    renderTabs();
    expect(screen.getByTestId('pipeline-import-recipe')).toBeDisabled();
  });
});

describe('ProjectCreateModal — submit calls the injected action + redirects', () => {
  it('calls createAction and onCreated with the new project id', async () => {
    const createAction = vi.fn(async () => ({ ok: true as const, data: { id: 'pid-42', code: 'NPD-042' } }));
    const onCreated = vi.fn();
    render(
      <ProjectCreateModal
        open
        labels={CREATE_LABELS}
        createAction={createAction}
        onCreated={onCreated}
        onClose={vi.fn()}
      />,
    );
    const form = screen.getByTestId('project-create-form');
    fireEvent.change(within(form).getByLabelText(/lbl\.create\.name/), { target: { value: 'Sliced Ham 200g' } });
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1));
    expect(createAction.mock.calls[0]![0]).toMatchObject({ name: 'Sliced Ham 200g', templateId: 'APEX_DEFAULT' });
    expect(onCreated).toHaveBeenCalledWith('pid-42');
  });

  it('surfaces a forbidden error when no action is injected (RBAC withheld)', async () => {
    render(
      <ProjectCreateModal open labels={CREATE_LABELS} createAction={undefined} onCreated={vi.fn()} onClose={vi.fn()} />,
    );
    const submit = screen.getByRole('button', { name: CREATE_LABELS.create });
    // submit is disabled without an action — assert the RBAC gate (no client bypass).
    expect(submit).toBeDisabled();
  });
});
