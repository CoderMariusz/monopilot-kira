/**
 * Wave E8 — UI view-model + mappers for the scheduler board.
 *
 * UI-OWNED (this lane). The backend lane owns the DB-row contract in
 * `../_actions/scheduler-types`; this module is the thin anti-corruption layer
 * that flattens those rows into the display shape the client components + tests
 * consume. When the backend enriches `SchedulerRunResult` (e.g. adds wo_number /
 * line code / profile key), only the mappers below change — the components stay
 * stable.
 *
 * NOT a 'use server' module (pure functions/types), so both the client island
 * and the RTL tests can import it.
 */

import type {
  SchedulerAssignment,
  SchedulerRunResult,
  ChangeoverMatrixEntry,
  ListChangeoverMatrixResult,
} from '../_actions/scheduler-types';

/** Flattened, display-ready proposed placement of one WO on a line. */
export type ProposedAssignment = {
  woId: string;
  /** Display label for the WO (wo_number when the backend supplies it, else a short id). */
  woLabel: string;
  lineId: string;
  /** 1-based order within the line lane. */
  sequence: number;
  /** ISO timestamp the WO is proposed to start (null when not yet placed). */
  plannedStart: string | null;
  /** Allergen/changeover profile key (best-effort; '' when absent). */
  profileKey: string;
  /**
   * Changeover cost (minutes) incurred from the previous WO on this line.
   * > 0 ⇒ a wash/clean-down is required and the badge is shown.
   */
  changeoverFromPrev: number;
};

export type SchedulerLane = {
  lineId: string;
  lineCode: string;
  lineName: string;
  assignments: ProposedAssignment[];
};

export type SchedulerProposal = {
  runId: string;
  applied: boolean;
  totalChangeoverCost: number;
  lanes: SchedulerLane[];
};

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toNumber(value: string | number | null): number {
  if (value === null) return 0;
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Short, stable label for an id when no human code is supplied by the backend. */
function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/** Read the allergen/changeover profile key the solver stashed in `ext`. */
function profileKeyFromExt(ext: SchedulerAssignment['ext']): string {
  if (ext && typeof ext === 'object' && !Array.isArray(ext)) {
    const value = ext.allergen_profile_key;
    if (typeof value === 'string') return value;
  }
  return '';
}

/**
 * A run is "applied" when the backend stamps `output_summary.applied_at` (see
 * applySchedule → markRunApplied). The run row's `status` is 'completed' as soon
 * as the solve finishes, so it is NOT a reliable applied signal.
 */
function runWasApplied(
  output: Extract<SchedulerRunResult, { ok: true }>['run']['output_summary'],
): boolean {
  return (
    !!output &&
    typeof output === 'object' &&
    !Array.isArray(output) &&
    typeof output.applied_at === 'string'
  );
}

/**
 * Optional enrichment the page can pass alongside the run result so lanes show
 * WO numbers / line codes / profile keys. Keyed by id; missing entries degrade
 * to short-id labels. The backend result alone is sufficient to render — this
 * only upgrades the labels.
 */
export type SchedulerLabelMaps = {
  woNumberById?: Record<string, string>;
  lineById?: Record<string, { code: string; name: string }>;
  profileByWoId?: Record<string, string>;
};

/**
 * Map a successful backend run result + optional label maps into the flat
 * proposal the board renders. Assignments are grouped into per-line lanes,
 * ordered by sequence_index. `changeover_minutes` on each row is treated as the
 * cost incurred moving from the previous WO on that line.
 */
export function toProposal(
  result: Extract<SchedulerRunResult, { ok: true }>,
  labels: SchedulerLabelMaps = {},
): SchedulerProposal {
  const { woNumberById = {}, lineById = {}, profileByWoId = {} } = labels;

  const byLine = new Map<string, SchedulerAssignment[]>();
  for (const row of result.assignments) {
    const key = row.line_id ?? '__unassigned__';
    const list = byLine.get(key) ?? [];
    list.push(row);
    byLine.set(key, list);
  }

  let total = 0;
  const lanes: SchedulerLane[] = Array.from(byLine.entries())
    .map(([lineKey, rows]) => {
      const sorted = [...rows].sort(
        (a, b) => toNumber(a.sequence_index) - toNumber(b.sequence_index),
      );
      const assignments: ProposedAssignment[] = sorted.map((row, idx) => {
        const cost = toNumber(row.changeover_minutes);
        total += cost;
        return {
          woId: row.wo_id,
          woLabel: woNumberById[row.wo_id] ?? shortId(row.wo_id),
          lineId: row.line_id ?? '',
          sequence: row.sequence_index != null ? toNumber(row.sequence_index) : idx + 1,
          plannedStart: toIso(row.planned_start_at),
          profileKey: profileByWoId[row.wo_id] ?? profileKeyFromExt(row.ext),
          changeoverFromPrev: cost,
        };
      });
      const meta = lineById[lineKey];
      return {
        lineId: lineKey,
        lineCode: meta?.code ?? (lineKey === '__unassigned__' ? '' : shortId(lineKey)),
        lineName: meta?.name ?? '',
        assignments,
      };
    })
    .sort((a, b) => a.lineCode.localeCompare(b.lineCode));

  return {
    runId: result.run.run_id,
    applied: runWasApplied(result.run.output_summary),
    totalChangeoverCost: total,
    lanes,
  };
}

/** Distinct, sorted profile keys (allergen_from ∪ allergen_to) for the grid axes. */
export function matrixProfileKeys(entries: ChangeoverMatrixEntry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    set.add(e.allergen_from);
    set.add(e.allergen_to);
  }
  return Array.from(set).sort();
}

/** Lookup map keyed "from→to" for O(1) cell reads. */
export function matrixCellIndex(
  entries: ChangeoverMatrixEntry[],
): Map<string, { changeoverMinutes: number; requiresCleaning: boolean }> {
  const map = new Map<string, { changeoverMinutes: number; requiresCleaning: boolean }>();
  for (const e of entries) {
    map.set(`${e.allergen_from}→${e.allergen_to}`, {
      changeoverMinutes: toNumber(e.changeover_minutes),
      requiresCleaning: e.requires_cleaning,
    });
  }
  return map;
}

export function unwrapMatrix(
  result: ListChangeoverMatrixResult,
): { profileKeys: string[]; entries: ChangeoverMatrixEntry[] } | null {
  if (!result.ok) return null;
  return { profileKeys: matrixProfileKeys(result.entries), entries: result.entries };
}
