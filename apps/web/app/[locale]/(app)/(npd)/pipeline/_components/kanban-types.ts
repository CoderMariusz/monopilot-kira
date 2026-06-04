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
  prio: ProjectPriority;
  owner: string | null;
  targetLaunch: string | null;
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
};

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
