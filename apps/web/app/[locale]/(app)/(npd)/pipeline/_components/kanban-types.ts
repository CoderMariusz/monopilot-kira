/**
 * T-059 — Pipeline Kanban shared types.
 *
 * Mirrors the merged Stage-Gate model (gate-helpers.ts / shared.ts) without
 * importing the Server Action modules into the client bundle. The page.tsx
 * Server Component imports the real `listProjects` / `advanceProjectGate`
 * actions and adapts their results to these client-facing shapes.
 */

export type ProjectGate = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'Launched';
export type ProjectPriority = 'high' | 'normal' | 'low';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

/** Ordered gate columns — parity with the 6-column board (G0..Launched). */
export const GATE_ORDER: ProjectGate[] = ['G0', 'G1', 'G2', 'G3', 'G4', 'Launched'];

/**
 * Stage-based Kanban columns (pipeline.jsx:36-52 — `window.NPD_STAGES`, the
 * legacy R&D stage rail) the product-owner spec asks for: BRIEF → RECIPE →
 * PACKAGING → TRIAL → SENSORY → PILOT → APPROVAL → HANDOFF.
 *
 * DEVIATION (honest real-data note): the live `npd_projects.current_stage` CHECK
 * constraint (migration 242) now persists all 8 operational stages PLUS the
 * terminal 'launched'. PACKAGING / SENSORY / PILOT columns are rendered for
 * prototype parity but rarely hold a real card until those per-stage flows are
 * fully wired — they show the empty "—" placeholder. No mock rows are injected.
 *
 * 'launched' is the TERMINAL stage (migration 242 / gate-helpers STAGE_ORDER +
 * nextStage → null). Launched projects (current_gate === 'Launched') own a final,
 * non-advanceable "Launched" column. Before this column existed an unknown
 * 'launched' value fell back to BRIEF via {@link normalizeStage} — the gap this
 * fixes (FINAL-NIGHT gap 2). The prototype (pipeline.jsx) has no launched stage
 * column — "Launched YTD" there is only a KPI tile — so this column is an additive
 * deviation, documented in the closeout log.
 */
export type ProjectStage =
  | 'brief'
  | 'recipe'
  | 'packaging'
  | 'costing_nutrition'
  | 'trial'
  | 'sensory'
  | 'pilot'
  | 'approval'
  | 'handoff'
  | 'launched';

export const STAGE_ORDER: ProjectStage[] = [
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
];

/** Stages the DB can actually persist (migration 242 / 422 CHECK constraint). */
export const PERSISTED_STAGES: ProjectStage[] = [
  'brief',
  'recipe',
  'packaging',
  'costing_nutrition',
  'trial',
  'sensory',
  'pilot',
  'approval',
  'handoff',
];

export function normalizeStage(raw: string | null | undefined): ProjectStage {
  return (STAGE_ORDER as string[]).includes(raw ?? '') ? (raw as ProjectStage) : 'brief';
}

/** The single source of truth for adjacency (mirrors gate-helpers.nextGate). */
export function nextGateOf(gate: ProjectGate): ProjectGate | null {
  const index = GATE_ORDER.indexOf(gate);
  if (index < 0 || index >= GATE_ORDER.length - 1) return null;
  return GATE_ORDER[index + 1] ?? null;
}

/** Card data — a projection of the merged ProjectSummary (listProjects). */
export type KanbanProject = {
  id: string;
  code: string;
  name: string;
  type: string;
  currentGate: ProjectGate;
  /**
   * Lifecycle stage (drives the stage-based Kanban columns + stage filter tabs).
   * Optional at the type level so legacy fixtures stay valid; consumers normalize
   * a missing/unknown value to 'brief' via {@link normalizeStage}.
   */
  currentStage?: ProjectStage | string | null;
  prio: ProjectPriority;
  owner: string | null;
  targetLaunch: string | null;
  /** ISO timestamp — used for the "Avg time to launch" KPI. */
  createdAt?: string | null;
  progressPercent: number;
  closeoutStatus?: import('./launched-card-closeout-pill').LegacyCloseoutStatus | null;
};

/**
 * Result shape the view expects from the injected advance action. This is a
 * structural subset of the merged advanceProjectGate result — the page wires the
 * real action; tests inject a stub. We only read `ok`, `error` and the resulting
 * `currentGate` (for the optimistic-confirm reconcile).
 */
export type AdvanceResult =
  | { ok: true; data: { currentGate: ProjectGate } }
  | { ok: false; error: string; status?: number };

export type AdvanceInput = { projectId: string; targetGate: ProjectGate };

export type AdvanceAction = (input: AdvanceInput) => Promise<AdvanceResult>;

export type KanbanLabels = {
  title: string;
  subtitle: string;
  // Stage column headers (BRIEF … HANDOFF) — drive the stage-based Kanban board.
  stageBrief: string;
  stageRecipe: string;
  stagePackaging: string;
  stageCostingNutrition: string;
  stageTrial: string;
  stageSensory: string;
  stagePilot: string;
  stageApproval: string;
  stageHandoff: string;
  stageLaunched: string;
  gateG0: string;
  gateG1: string;
  gateG2: string;
  gateG3: string;
  gateG4: string;
  gateLaunched: string;
  prioHigh: string;
  prioNormal: string;
  prioLow: string;
  advance: string;
  advancing: string;
  noOwner: string;
  noTarget: string;
  columnEmpty: string;
  open: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  advanceError: string;
  adjacencyError: string;
  esignRequiredError: string;
  checklistIncompleteError: string;
};

export function stageLabel(stage: ProjectStage, labels: KanbanLabels): string {
  switch (stage) {
    case 'brief':
      return labels.stageBrief;
    case 'recipe':
      return labels.stageRecipe;
    case 'packaging':
      return labels.stagePackaging;
    case 'costing_nutrition':
      return labels.stageCostingNutrition;
    case 'trial':
      return labels.stageTrial;
    case 'sensory':
      return labels.stageSensory;
    case 'pilot':
      return labels.stagePilot;
    case 'approval':
      return labels.stageApproval;
    case 'handoff':
      return labels.stageHandoff;
    case 'launched':
      return labels.stageLaunched;
    default:
      return stage;
  }
}

export function gateLabel(gate: ProjectGate, labels: KanbanLabels): string {
  switch (gate) {
    case 'G0':
      return labels.gateG0;
    case 'G1':
      return labels.gateG1;
    case 'G2':
      return labels.gateG2;
    case 'G3':
      return labels.gateG3;
    case 'G4':
      return labels.gateG4;
    case 'Launched':
      return labels.gateLaunched;
    default:
      return gate;
  }
}
