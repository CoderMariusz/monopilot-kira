import {
  allergenProfileKey,
  effectiveChangeoverMinutes,
  isChangeoverMatrixConfigured,
  normalizedAllergenIds,
  resolveChangeoverTransition,
  transitionScore,
} from './changeover-matrix-lookup';
import {
  UTC_DAY_MS,
  utcDayOverlapsForInterval,
} from '../../planning/schedule/_lib/board';
import type {
  ChangeoverMatrixEntry,
  OmittedWorkOrder,
  PmWindow,
  SequencedAssignment,
  SequencePreoccupiedSeed,
  SequenceSolverConfig,
  SequenceSolverResult,
  WorkOrderForScheduling,
} from './scheduler-types';

const DEFAULT_MIN_DURATION_MS = 60 * 60 * 1000;
const DAY_MS = UTC_DAY_MS;
const MAX_CAPACITY_PLACEMENT_ATTEMPTS = 400;

export type LineShiftWindow = {
  line_id: string;
  start_at: string;
  end_at: string;
};

type ShiftAwareSolverConfig = SequenceSolverConfig & {
  shiftCalendarLineIds?: string[];
  shiftWindows?: LineShiftWindow[];
};

export class SequenceCapacityInfeasibleError extends Error {
  readonly code = 'capacity_infeasible' as const;

  constructor(
    readonly lineKey: string,
    readonly earliestMs: number,
    readonly runDurationMs: number,
  ) {
    super(`No feasible capacity placement for ${runDurationMs}ms on line ${lineKey}`);
    this.name = 'SequenceCapacityInfeasibleError';
  }
}

/**
 * Default solver config. `sequencingStrategy: 'local_search'` is stored in DB but
 * not implemented yet — it falls back to `allergen_optimized`. `pmWindows` is
 * optional caller input (maintenance integration loads these when available).
 */
export const DEFAULT_SEQUENCE_SOLVER_CONFIG: SequenceSolverConfig = {
  sequencingStrategy: 'allergen_optimized',
  changeoverWeight: 1,
  duedateWeight: 1,
  utilizationWeight: 1,
  capacityHoursPerDay: 16,
  respectPmWindows: true,
  pmWindows: [],
};

function cloneDefaultSolverConfig(): SequenceSolverConfig {
  return { ...DEFAULT_SEQUENCE_SOLVER_CONFIG, pmWindows: [] };
}

function capacityHoursForLine(lineKey: string, config: SequenceSolverConfig): number | null {
  if (lineKey !== '__unassigned__') {
    const perLine = config.capacityHoursPerDayByLine?.[lineKey];
    if (perLine !== undefined) return perLine;
  }
  return config.capacityHoursPerDay;
}

function dueTime(wo: WorkOrderForScheduling): number {
  return new Date(wo.due_date).getTime();
}

function compareByDueDateThenId(a: WorkOrderForScheduling, b: WorkOrderForScheduling): number {
  const dueDelta = dueTime(a) - dueTime(b);
  if (dueDelta !== 0) return dueDelta;
  return a.id.localeCompare(b.id);
}

function timestampMs(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function numericMs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function routingDurationMs(wo: WorkOrderForScheduling): number | null {
  return numericMs(wo.routing_duration_ms);
}

function processDurationMs(wo: WorkOrderForScheduling): number | null {
  return numericMs(wo.process_duration_ms);
}

/** Derive WO run duration: scheduled/planned window, then routing, then process masters, else 1h floor. */
export function durationMs(wo: WorkOrderForScheduling): number {
  const pairs: Array<[string | Date | null, string | Date | null]> = [
    [wo.scheduled_start_time, wo.scheduled_end_time],
    [wo.planned_start_date, wo.planned_end_date],
  ];
  for (const [startValue, endValue] of pairs) {
    const start = timestampMs(startValue);
    const end = timestampMs(endValue);
    if (start === null || end === null || end <= start) continue;
    return end - start;
  }

  const routing = routingDurationMs(wo);
  if (routing !== null) return routing;

  const process = processDurationMs(wo);
  if (process !== null) return process;

  return DEFAULT_MIN_DURATION_MS;
}

function changeoverBetween(
  fromWo: WorkOrderForScheduling,
  toWo: WorkOrderForScheduling,
  matrix: ChangeoverMatrixEntry[],
  changeoverWeight: number,
  matrixConfigured: boolean,
): { cost: number; transitionMinutes: number; feasible: boolean } {
  const transition = resolveChangeoverTransition(
    normalizedAllergenIds(fromWo.allergen_ids),
    normalizedAllergenIds(toWo.allergen_ids),
    toWo.production_line_id,
    matrix,
    { matrixConfigured },
  );
  return {
    cost: transitionScore(transition, changeoverWeight),
    transitionMinutes: effectiveChangeoverMinutes(transition),
    feasible: transition.feasible,
  };
}

function enforceChangeoverFeasibility(matrixConfigured: boolean): boolean {
  return matrixConfigured;
}

function dueDatePenalty(candidate: WorkOrderForScheduling, anchorDueMs: number, duedateWeight: number): number {
  if (duedateWeight <= 0) return 0;
  return ((dueTime(candidate) - anchorDueMs) / DAY_MS) * duedateWeight;
}

function utilizationPenalty(
  transitionMinutes: number,
  candidate: WorkOrderForScheduling,
  utilizationWeight: number,
): number {
  if (utilizationWeight <= 0) return 0;
  const runMinutes = durationMs(candidate) / (60 * 1000);
  if (runMinutes <= 0) return 0;
  return (transitionMinutes / runMinutes) * utilizationWeight;
}

function dayBucketKey(lineKey: string, ms: number): string {
  return `${lineKey}|${new Date(ms).toISOString().slice(0, 10)}`;
}

function pmWindowBlocks(
  lineKey: string,
  startMs: number,
  endMs: number,
  windows: PmWindow[],
): PmWindow | null {
  for (const window of windows) {
    if (window.line_id !== null && window.line_id !== lineKey) continue;
    const windowStart = timestampMs(window.start_at);
    const windowEnd = timestampMs(window.end_at);
    if (windowStart === null || windowEnd === null || windowEnd <= windowStart) continue;
    if (startMs < windowEnd && endMs > windowStart) return window;
  }
  return null;
}

function availableShiftWindows(
  lineKey: string,
  config: ShiftAwareSolverConfig,
): Array<{ start: number; end: number }> | null {
  if (!config.shiftCalendarLineIds?.includes(lineKey)) return null;

  const sorted = (config.shiftWindows ?? [])
    .filter((window) => window.line_id === lineKey)
    .map((window) => ({ start: timestampMs(window.start_at), end: timestampMs(window.end_at) }))
    .filter((window): window is { start: number; end: number } =>
      window.start !== null && window.end !== null && window.end > window.start,
    )
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const window of sorted) {
    const previous = merged.at(-1);
    if (previous && window.start <= previous.end) {
      previous.end = Math.max(previous.end, window.end);
    } else {
      merged.push({ ...window });
    }
  }
  return merged;
}

function nextShiftStart(
  earliestMs: number,
  runDurationMs: number,
  windows: Array<{ start: number; end: number }>,
): number | null {
  for (const window of windows) {
    const start = Math.max(earliestMs, window.start);
    if (start + runDurationMs <= window.end) return start;
  }
  return null;
}

function bucketUsedMs(lineKey: string, dayStartMs: number, dayUsageMs: Map<string, number>): number {
  const bucketKey = dayBucketKey(lineKey, dayStartMs);
  return dayUsageMs.get(bucketKey) ?? 0;
}

function canReserveCapacity(
  lineKey: string,
  startMs: number,
  runDurationMs: number,
  capacityMs: number,
  dayUsageMs: Map<string, number>,
): boolean {
  const endMs = startMs + runDurationMs;
  for (const overlap of utcDayOverlapsForInterval(startMs, endMs)) {
    const usedMs = bucketUsedMs(lineKey, overlap.dayStartMs, dayUsageMs);
    if (overlap.overlapMs > capacityMs - usedMs) return false;
  }
  return true;
}

function canReserveCapacityIntervals(
  lineKey: string,
  intervals: readonly PendingChangeoverCapacity[],
  capacityMs: number,
  dayUsageMs: Map<string, number>,
): boolean {
  const scratch = new Map(dayUsageMs);
  for (const interval of intervals) {
    if (interval.durationMs <= 0) continue;
    if (!canReserveCapacity(lineKey, interval.startMs, interval.durationMs, capacityMs, scratch)) {
      return false;
    }
    reserveCapacity(lineKey, interval.startMs, interval.durationMs, scratch);
  }
  return true;
}

function reserveCapacityIntervals(
  lineKey: string,
  intervals: readonly PendingChangeoverCapacity[],
  dayUsageMs: Map<string, number>,
): void {
  for (const interval of intervals) {
    if (interval.durationMs <= 0) continue;
    reserveCapacity(lineKey, interval.startMs, interval.durationMs, dayUsageMs);
  }
}

function reserveCapacity(
  lineKey: string,
  startMs: number,
  runDurationMs: number,
  dayUsageMs: Map<string, number>,
): void {
  const endMs = startMs + runDurationMs;
  for (const overlap of utcDayOverlapsForInterval(startMs, endMs)) {
    const bucketKey = dayBucketKey(lineKey, overlap.dayStartMs);
    dayUsageMs.set(bucketKey, (dayUsageMs.get(bucketKey) ?? 0) + overlap.overlapMs);
  }
}

function nextCapacityRetryStart(
  lineKey: string,
  startMs: number,
  runDurationMs: number,
  capacityMs: number,
  dayUsageMs: Map<string, number>,
): number {
  const endMs = startMs + runDurationMs;
  let advanceTo = startMs + 60 * 1000;
  for (const overlap of utcDayOverlapsForInterval(startMs, endMs)) {
    const usedMs = bucketUsedMs(lineKey, overlap.dayStartMs, dayUsageMs);
    const remainingMs = capacityMs - usedMs;
    if (overlap.overlapMs <= remainingMs) continue;
    if (remainingMs <= 0) {
      advanceTo = Math.max(advanceTo, overlap.dayStartMs + DAY_MS);
      continue;
    }
    advanceTo = Math.max(advanceTo, startMs + (overlap.overlapMs - remainingMs));
  }
  return advanceTo;
}

/** Changeover interval charged against the daily capacity budget before the run. */
type PendingChangeoverCapacity = {
  startMs: number;
  durationMs: number;
};

function resolvePlannedStart(
  lineKey: string,
  earliestMs: number,
  runDurationMs: number,
  config: ShiftAwareSolverConfig,
  dayUsageMs: Map<string, number>,
  pendingChangeover?: PendingChangeoverCapacity,
): number {
  const capacityHours = capacityHoursForLine(lineKey, config);
  const capacityMs =
    capacityHours !== null && capacityHours > 0 ? capacityHours * 60 * 60 * 1000 : null;
  const pmWindows = config.respectPmWindows ? (config.pmWindows ?? []) : [];
  const shiftWindows = availableShiftWindows(lineKey, config);
  let start = earliestMs;

  for (let guard = 0; guard < MAX_CAPACITY_PLACEMENT_ATTEMPTS; guard += 1) {
    if (shiftWindows !== null) {
      const shiftedStart = nextShiftStart(start, runDurationMs, shiftWindows);
      if (shiftedStart === null) break;
      start = shiftedStart;
    }
    const end = start + runDurationMs;

    const blocker = pmWindows.length > 0 ? pmWindowBlocks(lineKey, start, end, pmWindows) : null;
    if (blocker) {
      const windowEnd = timestampMs(blocker.end_at);
      if (windowEnd === null) break;
      start = Math.max(start, windowEnd);
      continue;
    }

    if (capacityMs !== null) {
      const reservationIntervals: PendingChangeoverCapacity[] = [];
      if (pendingChangeover && pendingChangeover.durationMs > 0) {
        reservationIntervals.push(pendingChangeover);
      }
      reservationIntervals.push({ startMs: start, durationMs: runDurationMs });
      if (canReserveCapacityIntervals(lineKey, reservationIntervals, capacityMs, dayUsageMs)) {
        reserveCapacityIntervals(lineKey, reservationIntervals, dayUsageMs);
        return start;
      }
      start = nextCapacityRetryStart(lineKey, start, runDurationMs, capacityMs, dayUsageMs);
      if (pendingChangeover && pendingChangeover.durationMs > 0) {
        start = Math.max(start, pendingChangeover.startMs + pendingChangeover.durationMs);
        const scratch = new Map(dayUsageMs);
        reserveCapacity(
          lineKey,
          pendingChangeover.startMs,
          pendingChangeover.durationMs,
          scratch,
        );
        if (!canReserveCapacity(lineKey, start, runDurationMs, capacityMs, scratch)) {
          const changeoverEnd = pendingChangeover.startMs + pendingChangeover.durationMs;
          for (const overlap of utcDayOverlapsForInterval(pendingChangeover.startMs, changeoverEnd)) {
            if (start < overlap.dayStartMs + DAY_MS) {
              start = Math.max(start, overlap.dayStartMs + DAY_MS);
            }
          }
        }
      }
      continue;
    }

    return start;
  }

  throw new SequenceCapacityInfeasibleError(lineKey, earliestMs, runDurationMs);
}

function pickNextIndex(
  tail: WorkOrderForScheduling,
  unscheduled: WorkOrderForScheduling[],
  matrix: ChangeoverMatrixEntry[],
  config: SequenceSolverConfig,
  matrixConfigured: boolean,
): number {
  const useChangeover = config.sequencingStrategy !== 'greedy';
  const enforceFeasibility = enforceChangeoverFeasibility(matrixConfigured);
  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < unscheduled.length; index += 1) {
    const candidate = unscheduled[index];
    const { cost, transitionMinutes, feasible } = changeoverBetween(
      tail,
      candidate,
      matrix,
      config.changeoverWeight,
      matrixConfigured,
    );
    if (useChangeover && enforceFeasibility && !feasible) continue;

    let score = useChangeover
      ? cost + dueDatePenalty(candidate, dueTime(tail), config.duedateWeight)
      : dueDatePenalty(candidate, dueTime(tail), config.duedateWeight);
    if (useChangeover) {
      score += utilizationPenalty(transitionMinutes, candidate, config.utilizationWeight);
    }

    const tieCandidate =
      bestIndex === -1 ? candidate : unscheduled[bestIndex];
    const dueDelta = compareByDueDateThenId(candidate, tieCandidate);
    if (score < bestScore || (score === bestScore && dueDelta < 0)) {
      bestIndex = index;
      bestScore = score;
    }
  }

  if (bestIndex === -1) {
    if (enforceFeasibility) return -1;
    bestIndex = 0;
    for (let index = 1; index < unscheduled.length; index += 1) {
      if (compareByDueDateThenId(unscheduled[index], unscheduled[bestIndex]) < 0) {
        bestIndex = index;
      }
    }
  }

  return bestIndex;
}

function startNextSequenceSegment(unscheduled: WorkOrderForScheduling[]): WorkOrderForScheduling {
  unscheduled.sort(compareByDueDateThenId);
  const [next] = unscheduled.splice(0, 1);
  return next;
}

type PlaceSequencedWorkOrderResult =
  | { ok: true; assignment: SequencedAssignment; cumulative: number }
  | { ok: false; reason: OmittedWorkOrder['reason'] };

function placeSequencedWorkOrder(
  workOrder: WorkOrderForScheduling,
  sequenceIndex: number,
  matrix: ChangeoverMatrixEntry[],
  config: ShiftAwareSolverConfig,
  matrixConfigured: boolean,
  plannedEndByLine: Map<string, number>,
  dayUsageMs: Map<string, number>,
  lastWoByLine: Map<string, WorkOrderForScheduling>,
  now: number,
  cumulative: number,
): PlaceSequencedWorkOrderResult {
  const lineKey = workOrder.production_line_id ?? '__unassigned__';
  const previous = lastWoByLine.get(lineKey) ?? null;
  const profile = normalizedAllergenIds(workOrder.allergen_ids);
  const toKey = allergenProfileKey(profile);
  const changeover = previous
    ? changeoverBetween(previous, workOrder, matrix, config.changeoverWeight, matrixConfigured)
    : { transitionMinutes: 0, feasible: true, cost: 0 };
  if (enforceChangeoverFeasibility(matrixConfigured) && previous && !changeover.feasible) {
    return { ok: false, reason: 'no_feasible_changeover' };
  }
  const changeoverCost = changeover.transitionMinutes;
  const previousEndMs = plannedEndByLine.get(lineKey) ?? now;
  const changeoverMs = changeoverCost * 60 * 1000;
  const earliestStart = Math.max(now, previousEndMs + changeoverMs);
  const runDuration = durationMs(workOrder);
  const pendingChangeover =
    previous && changeoverMs > 0
      ? { startMs: Math.max(now, previousEndMs), durationMs: changeoverMs }
      : undefined;
  let plannedStart: number;
  try {
    plannedStart = resolvePlannedStart(
      lineKey,
      earliestStart,
      runDuration,
      config,
      dayUsageMs,
      pendingChangeover,
    );
  } catch (error) {
    if (error instanceof SequenceCapacityInfeasibleError) {
      return { ok: false, reason: 'no_feasible_capacity' };
    }
    throw error;
  }
  const plannedEnd = plannedStart + runDuration;
  plannedEndByLine.set(lineKey, plannedEnd);
  lastWoByLine.set(lineKey, workOrder);
  const nextCumulative = cumulative + changeoverCost;

  return {
    ok: true,
    assignment: {
      wo_id: workOrder.id,
      sequence_index: sequenceIndex,
      line_id: workOrder.production_line_id,
      planned_start_at: new Date(plannedStart).toISOString(),
      planned_end_at: new Date(plannedEnd).toISOString(),
      changeover_cost: changeoverCost,
      cumulative_changeover_cost: nextCumulative,
      allergen_profile_key: toKey,
      work_order: workOrder,
    },
    cumulative: nextCumulative,
  };
}

export function sequenceWorkOrders(
  wos: WorkOrderForScheduling[],
  matrix: ChangeoverMatrixEntry[],
  config: ShiftAwareSolverConfig = cloneDefaultSolverConfig(),
): SequenceSolverResult {
  if (wos.length === 0) return { assignments: [], omitted: [] };

  const matrixConfigured = isChangeoverMatrixConfigured(matrix);
  const unscheduled = [...wos].sort(compareByDueDateThenId);
  const sequence: WorkOrderForScheduling[] = [];

  const first = unscheduled.shift();
  if (!first) return { assignments: [], omitted: [] };
  sequence.push(first);

  while (unscheduled.length > 0) {
    const tail = sequence[sequence.length - 1];
    const bestIndex = pickNextIndex(tail, unscheduled, matrix, config, matrixConfigured);
    if (bestIndex === -1) {
      sequence.push(startNextSequenceSegment(unscheduled));
      continue;
    }
    const [next] = unscheduled.splice(bestIndex, 1);
    sequence.push(next);
  }

  const now = config.nowMs ?? Date.now();
  const plannedEndByLine = new Map<string, number>(
    Object.entries(config.preoccupied?.plannedEndByLine ?? {}),
  );
  const dayUsageMs = new Map<string, number>(
    Object.entries(config.preoccupied?.dayUsageMs ?? {}),
  );
  const lastWoByLine = new Map<string, WorkOrderForScheduling>(
    Object.entries(config.preoccupied?.lastWoByLine ?? {}),
  );

  const assignments: SequencedAssignment[] = [];
  const deferred: WorkOrderForScheduling[] = [];
  const omitReasons = new Map<string, OmittedWorkOrder['reason']>();
  let cumulative = 0;
  let sequenceIndex = 0;

  for (const workOrder of sequence) {
    const placed = placeSequencedWorkOrder(
      workOrder,
      sequenceIndex + 1,
      matrix,
      config,
      matrixConfigured,
      plannedEndByLine,
      dayUsageMs,
      lastWoByLine,
      now,
      cumulative,
    );
    if (!placed.ok) {
      omitReasons.set(workOrder.id, placed.reason);
      deferred.push(workOrder);
      continue;
    }
    omitReasons.delete(workOrder.id);
    assignments.push(placed.assignment);
    cumulative = placed.cumulative;
    sequenceIndex += 1;
  }

  for (const workOrder of deferred) {
    const placed = placeSequencedWorkOrder(
      workOrder,
      sequenceIndex + 1,
      matrix,
      config,
      matrixConfigured,
      plannedEndByLine,
      dayUsageMs,
      lastWoByLine,
      now,
      cumulative,
    );
    if (!placed.ok) {
      omitReasons.set(workOrder.id, placed.reason);
      continue;
    }
    omitReasons.delete(workOrder.id);
    assignments.push(placed.assignment);
    cumulative = placed.cumulative;
    sequenceIndex += 1;
  }

  const assignedIds = new Set(assignments.map((assignment) => assignment.wo_id));
  const omitted: OmittedWorkOrder[] = wos
    .filter((workOrder) => !assignedIds.has(workOrder.id))
    .map((workOrder) => ({
      wo_id: workOrder.id,
      reason: omitReasons.get(workOrder.id) ?? 'no_feasible_changeover',
    }));

  return { assignments, omitted };
}

/** Build occupancy seed maps from WOs already consuming line capacity. */
export function buildPreoccupiedSeed(
  occupying: WorkOrderForScheduling[],
  config: SequenceSolverConfig,
): SequencePreoccupiedSeed {
  const plannedEndByLine: Record<string, number> = {};
  const dayUsageMs: Record<string, number> = {};
  const lastWoByLine: Record<string, WorkOrderForScheduling> = {};
  const lineEndMs = new Map<string, { end: number; wo: WorkOrderForScheduling }>();

  for (const wo of occupying) {
    const lineKey = wo.production_line_id ?? '__unassigned__';
    const runDuration = durationMs(wo);
    const scheduledStart = timestampMs(wo.scheduled_start_time) ?? timestampMs(wo.planned_start_date);
    const scheduledEnd = timestampMs(wo.scheduled_end_time) ?? timestampMs(wo.planned_end_date);
    let startMs = scheduledStart;
    let endMs = scheduledEnd;
    const nowMs = config.nowMs ?? Date.now();
    if ((wo.status as string) === 'IN_PROGRESS' && (endMs === null || endMs <= nowMs)) {
      startMs = nowMs;
      endMs = nowMs + runDuration;
    } else if (startMs === null && endMs !== null) {
      startMs = endMs - runDuration;
    } else if (startMs !== null && endMs === null) {
      endMs = startMs + runDuration;
    } else if (startMs === null && endMs === null) {
      continue;
    }
    if (startMs === null || endMs === null || endMs <= startMs) continue;

    plannedEndByLine[lineKey] = Math.max(plannedEndByLine[lineKey] ?? 0, endMs);
    const current = lineEndMs.get(lineKey);
    if (!current || endMs >= current.end) {
      lineEndMs.set(lineKey, { end: endMs, wo });
      lastWoByLine[lineKey] = wo;
    }

    const capacityHours = capacityHoursForLine(lineKey, config);
    if (capacityHours !== null && capacityHours > 0) {
      const tempMap = new Map<string, number>(Object.entries(dayUsageMs));
      reserveCapacity(lineKey, startMs, runDuration, tempMap);
      for (const [key, val] of tempMap) {
        dayUsageMs[key] = val;
      }
    }
  }

  return { plannedEndByLine, dayUsageMs, lastWoByLine };
}

/** @internal Test helper — exposes per-line/day reserved hours after a sequencing run. */
export function __dayUsageHoursForTests(dayUsageMs: Map<string, number>): Map<string, number> {
  return new Map(
    [...dayUsageMs.entries()].map(([key, usedMs]) => [key, usedMs / (60 * 60 * 1000)]),
  );
}

export function __resolvePlannedStartForTests(
  lineKey: string,
  earliestMs: number,
  runDurationMs: number,
  config: ShiftAwareSolverConfig,
  dayUsageMs: Map<string, number>,
  pendingChangeover?: PendingChangeoverCapacity,
): number {
  return resolvePlannedStart(
    lineKey,
    earliestMs,
    runDurationMs,
    config,
    dayUsageMs,
    pendingChangeover,
  );
}
