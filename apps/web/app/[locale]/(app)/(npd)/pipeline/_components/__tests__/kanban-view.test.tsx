/**
 * @vitest-environment jsdom
 * T-059 — Pipeline Kanban view (kanban_view prototype) component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:19-52 (KanbanCard + KanbanView)
 *
 * RED → GREEN: asserts the parity checklist (stage columns brief..launched, the
 * KanbanCard fields code+name+prio badge+owner+target_launch + progress, shadcn
 * Card + Badge primitives), the advance affordance ROUTING THROUGH THE GATE MODAL
 * (F-C08 fix: "Advance →" navigates to /pipeline/[id]?modal=advanceGate — the
 * AdvanceGateModal owns notes/checklist/e-sign; no direct advanceProjectGate call
 * from the kanban), the five required UI states (loading / empty / populated /
 * error / permission), the i18n-key resolution (no hard-coded user-facing
 * strings), and the RBAC advance gate (server-supplied canAdvance — no
 * render-then-disable).
 *
 * Conflict deviation (documented in closeout deviation log):
 *   The canonical prototype KanbanView (pipeline.jsx:36-52) is read-only and uses
 *   the LEGACY stage model (brief/recipe/trial/…). The production pipeline is the
 *   Stage-Gate model (G0-G4 + Launched, gate-helpers.ts) and the gate move is the
 *   merged advanceProjectGate Server Action (T-058) which enforces adjacency +
 *   returns 422 ADJACENCY_VIOLATION. We translate the gate move to an explicit,
 *   accessible "Advance" affordance per card (not literal @dnd-kit drag) — the
 *   optimistic-update + 422-revert contract (§17.12) is preserved 1:1.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  KanbanView,
  resolveAdvanceError,
  type KanbanLabels,
  type KanbanProject,
} from '../kanban-view';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/pipeline',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  pushMock.mockReset();
});

// Mirror the prototype's data shape (window.NPD_PROJECTS) → the real
// ProjectSummary returned by the merged listProjects Server Action.
const PROJECTS: KanbanProject[] = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    code: 'DEV-052',
    name: 'Strawberry Yogurt 150g',
    type: 'single',
    currentGate: 'G0',
    currentStage: 'brief',
    prio: 'high',
    owner: 'Ana Owner',
    targetLaunch: '2026-09-01',
    progressPercent: 20,
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    code: 'DEV-061',
    name: 'Vanilla Custard 500g',
    type: 'multi',
    currentGate: 'G2',
    currentStage: 'recipe',
    prio: 'normal',
    owner: 'Bo Owner',
    targetLaunch: '2026-10-15',
    progressPercent: 60,
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    code: 'DEV-070',
    name: 'Lemon Tart 90g',
    type: 'single',
    currentGate: 'Launched',
    currentStage: 'handoff',
    prio: 'low',
    owner: null,
    targetLaunch: null,
    progressPercent: 100,
  },
  {
    // FINAL-NIGHT gap 2: a project whose terminal stage is the real
    // `current_stage = 'launched'` value (migration 242). It must land in the
    // dedicated Launched column — NOT fall back into BRIEF — and carry no
    // Advance affordance (terminal gate).
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    code: 'DEV-088',
    name: 'Mango Sorbet 250g',
    type: 'single',
    currentGate: 'Launched',
    currentStage: 'launched',
    prio: 'normal',
    owner: 'Cy Owner',
    targetLaunch: '2026-05-01',
    progressPercent: 100,
  },
];

// Distinct sentinel strings so the test proves the component renders LABELS
// (i18n message values), never inline English literals.
const LABELS: KanbanLabels = {
  title: 'lbl.title',
  subtitle: 'lbl.subtitle',
  stageBrief: 'lbl.stageBrief',
  stageRecipe: 'lbl.stageRecipe',
  stagePackaging: 'lbl.stagePackaging',
  stageCostingNutrition: 'lbl.stageCostingNutrition',
  stageTrial: 'lbl.stageTrial',
  stageSensory: 'lbl.stageSensory',
  stagePilot: 'lbl.stagePilot',
  stageApproval: 'lbl.stageApproval',
  stageHandoff: 'lbl.stageHandoff',
  stageLaunched: 'lbl.stageLaunched',
  gateG0: 'lbl.gateG0',
  gateG1: 'lbl.gateG1',
  gateG2: 'lbl.gateG2',
  gateG3: 'lbl.gateG3',
  gateG4: 'lbl.gateG4',
  gateLaunched: 'lbl.gateLaunched',
  prioHigh: 'lbl.prioHigh',
  prioNormal: 'lbl.prioNormal',
  prioLow: 'lbl.prioLow',
  advance: 'lbl.advance',
  advancing: 'lbl.advancing',
  noOwner: 'lbl.noOwner',
  noTarget: 'lbl.noTarget',
  columnEmpty: 'lbl.columnEmpty',
  open: 'lbl.open',
  loading: 'lbl.loading',
  empty: 'lbl.empty',
  emptyBody: 'lbl.emptyBody',
  error: 'lbl.error',
  forbidden: 'lbl.forbidden',
  advanceError: 'lbl.advanceError',
  adjacencyError: 'lbl.adjacencyError',
  esignRequiredError: 'lbl.esignRequiredError',
  checklistIncompleteError: 'lbl.checklistIncompleteError',
};

function renderView(overrides: Partial<React.ComponentProps<typeof KanbanView>> = {}) {
  const advanceAction =
    overrides.advanceAction ??
    vi.fn(async () => ({ ok: true as const, data: { currentGate: 'G3' as const } }));
  return {
    advanceAction,
    ...render(
      <KanbanView
        projects={PROJECTS}
        labels={LABELS}
        canAdvance
        state="ready"
        advanceAction={advanceAction}
        {...overrides}
      />,
    ),
  };
}

describe('KanbanView — prototype parity (pipeline.jsx:36-52, stage board)', () => {
  it('renders 10 stage columns in order brief → recipe → packaging → costing_nutrition → trial → sensory → pilot → approval → handoff → launched', () => {
    renderView();
    const cols = screen.getAllByTestId(/^kanban-col-/);
    expect(cols).toHaveLength(10);
    const order = cols.map((c) => c.getAttribute('data-stage'));
    expect(order).toEqual([
      'brief',
      'recipe',
      'packaging',
      'costing_nutrition',
      'trial',
      'sensory',
      'pilot',
      'approval',
      'handoff',
      'launched',
    ]);
  });

  it('buckets a launched project into the Launched column (not BRIEF) with no Advance affordance', () => {
    renderView();
    const launchedCol = screen.getByTestId('kanban-col-launched');
    const card = within(launchedCol).getByTestId('kanban-card-DEV-088');
    expect(card).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: LABELS.advance })).toBeNull();
    // …and it must NOT have leaked into BRIEF.
    const brief = screen.getByTestId('kanban-col-brief');
    expect(within(brief).queryByTestId('kanban-card-DEV-088')).toBeNull();
  });

  it('renders each column header label + a per-column count', () => {
    renderView();
    const brief = screen.getByTestId('kanban-col-brief');
    expect(within(brief).getByText(LABELS.stageBrief)).toBeInTheDocument();
    // brief has exactly one project (DEV-052)
    expect(within(brief).getByTestId('kanban-count-brief')).toHaveTextContent('1');
    // packaging has no persisted rows → count 0 + placeholder (honest empty column)
    const packaging = screen.getByTestId('kanban-col-packaging');
    expect(within(packaging).getByTestId('kanban-count-packaging')).toHaveTextContent('0');
    expect(within(packaging).getByText(LABELS.columnEmpty)).toBeInTheDocument();
  });

  it('renders a KanbanCard per project with code + name + prio badge + owner + target', () => {
    renderView();
    const card = screen.getByTestId('kanban-card-DEV-052');
    expect(within(card).getByText('Strawberry Yogurt 150g')).toBeInTheDocument();
    expect(within(card).getByText(/DEV-052/)).toBeInTheDocument();
    expect(within(card).getByText(LABELS.prioHigh)).toBeInTheDocument();
    expect(within(card).getByText('Ana Owner')).toBeInTheDocument();
    expect(within(card).getByText(/2026-09-01/)).toBeInTheDocument();
  });

  it('uses shadcn Card + Badge primitives (no raw prototype divs)', () => {
    renderView();
    const card = screen.getByTestId('kanban-card-DEV-052');
    expect(card.querySelector('[data-slot="card"]')).not.toBeNull();
    expect(card.querySelector('[data-slot="badge"]')).not.toBeNull();
  });

  it('links each card to the Stage-Gate project detail (locale-prefixed /pipeline/[id])', () => {
    renderView();
    const card = screen.getByTestId('kanban-card-DEV-052');
    const link = within(card).getByRole('link', { name: /Strawberry Yogurt 150g/ });
    // Batch-D F3: the open link carries the locale prefix from usePathname().
    expect(link).toHaveAttribute('href', '/en/pipeline/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  });
});

describe('KanbanView — advance routes through the gate modal (F-C08 fix)', () => {
  it('navigates to /pipeline/[id]?modal=advanceGate instead of calling advanceProjectGate directly', async () => {
    const advanceAction = vi.fn(async () => ({
      ok: true as const,
      data: { currentGate: 'G3' as const },
    }));
    renderView({ advanceAction });

    const card = screen.getByTestId('kanban-card-DEV-061'); // currently G2 / recipe stage
    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: LABELS.advance }));
    });

    // F-C08: the kanban "Advance →" must route through the SAME AdvanceGateModal
    // as the project header (notes / checklist / e-sign owned by the modal) — the
    // direct Server-Action bypass is gone. Batch-D F3: the route carries the
    // locale prefix derived from usePathname() ('/en/pipeline' mocked above).
    expect(pushMock).toHaveBeenCalledWith(
      '/en/pipeline/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb?modal=advanceGate',
    );
    expect(advanceAction).not.toHaveBeenCalled();
    // The card stays in its stage column (no optimistic gate reshuffle).
    const recipe = screen.getByTestId('kanban-col-recipe');
    expect(within(recipe).getByTestId('kanban-card-DEV-061')).toBeInTheDocument();
  });

  it('routes a G0/brief card through the modal too (no direct G0→G1 claim anywhere)', async () => {
    const advanceAction = vi.fn(async () => ({
      ok: true as const,
      data: { currentGate: 'G2' as const },
    }));
    renderView({ advanceAction });

    const card = screen.getByTestId('kanban-card-DEV-052'); // G0 / brief stage
    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: LABELS.advance }));
    });

    expect(pushMock).toHaveBeenCalledWith(
      '/en/pipeline/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa?modal=advanceGate',
    );
    expect(advanceAction).not.toHaveBeenCalled();
  });

  it('does not render an advance affordance on a Launched card (terminal gate)', () => {
    renderView();
    const card = screen.getByTestId('kanban-card-DEV-070'); // Launched
    expect(within(card).queryByRole('button', { name: LABELS.advance })).toBeNull();
  });
});

describe('KanbanView — RBAC advance gate (server-supplied canAdvance)', () => {
  it('shows the advance affordance when canAdvance is true', () => {
    renderView({ canAdvance: true });
    const card = screen.getByTestId('kanban-card-DEV-052');
    expect(within(card).getByRole('button', { name: LABELS.advance })).toBeInTheDocument();
  });

  it('hides the advance affordance when canAdvance is false (no render-then-disable)', () => {
    renderView({ canAdvance: false });
    const card = screen.getByTestId('kanban-card-DEV-052');
    expect(within(card).queryByRole('button', { name: LABELS.advance })).toBeNull();
  });
});

describe('KanbanView — required UI states', () => {
  it('loading: shows a polite status with the loading label', () => {
    renderView({ state: 'loading' });
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('empty: shows the empty-state copy with no columns rendered', () => {
    renderView({ projects: [], state: 'empty' });
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
    expect(screen.queryByTestId(/^kanban-col-/)).toBeNull();
  });

  it('error: shows an alert with the error label and no columns', () => {
    renderView({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.error);
    expect(screen.queryByTestId(/^kanban-col-/)).toBeNull();
  });

  it('permission_denied: shows an alert with the forbidden label and no columns', () => {
    renderView({ state: 'permission_denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
    expect(screen.queryByTestId(/^kanban-col-/)).toBeNull();
  });

  it('populated: renders one card per project across the columns', () => {
    renderView();
    expect(screen.getAllByTestId(/^kanban-card-/)).toHaveLength(PROJECTS.length);
  });
});

describe('resolveAdvanceError — error → toast mapping', () => {
  it('maps ESIGN_REQUIRED to the e-sign-required label', () => {
    expect(resolveAdvanceError('ESIGN_REQUIRED', LABELS)).toBe(LABELS.esignRequiredError);
  });
  it('maps CHECKLIST_INCOMPLETE to the checklist label', () => {
    expect(resolveAdvanceError('CHECKLIST_INCOMPLETE', LABELS)).toBe(LABELS.checklistIncompleteError);
  });
  it('maps ADJACENCY_VIOLATION to the adjacency label', () => {
    expect(resolveAdvanceError('ADJACENCY_VIOLATION', LABELS)).toBe(LABELS.adjacencyError);
  });
  it('falls back to the generic revert label for unknown codes', () => {
    expect(resolveAdvanceError('PERSISTENCE_FAILED', LABELS)).toBe(LABELS.advanceError);
    expect(resolveAdvanceError('WHATEVER', LABELS)).toBe(LABELS.advanceError);
  });
});
