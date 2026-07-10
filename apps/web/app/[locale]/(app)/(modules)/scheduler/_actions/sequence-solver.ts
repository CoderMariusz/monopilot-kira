import {
  allergenProfileKey,
  effectiveChangeoverMinutes,
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
  PmWindow,
  SequencedAssignment,
  SequenceSolverConfig,
  WorkOrderForScheduling,
} from './scheduler-types';

const DEFAULT_MIN_DURATION_MS = 60 * 60 * 1000;
const DAY_MS = UTC_DAY_MS;
const MAX_CAPACITY_PLACEMENT_ATTEMPTS = 400;

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
  capacityHoursPerDay: null,
  respectPmWindows: false,
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
): { cost: number; transitionMinutes: number; feasible: boolean } {
  const transition = resolveChangeoverTransition(
    normalizedAllergenIds(fromWo.allergen_ids),
    normalizedAllergenIds(toWo.allergen_ids),
    toWo.production_line_id,
    matrix,
  );
  return {
    cost: transitionScore(transition, changeoverWeight),
    transitionMinutes: effectiveChangeoverMinutes(transition),
    feasible: transition.feasible,
  };
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

function resolvePlannedStart(
  lineKey: string,
  earliestMs: number,
  runDurationMs: number,
  config: SequenceSolverConfig,
  dayUsageMs: Map<string, number>,
): number {
  const capacityHours = capacityHoursForLine(lineKey, config);
  const capacityMs =
    capacityHours !== null && capacityHours > 0 ? capacityHours * 60 * 60 * 1000 : null;
  const pmWindows = config.respectPmWindows ? (config.pmWindows ?? []) : [];
  let start = earliestMs;

  for (let guard = 0; guard < MAX_CAPACITY_PLACEMENT_ATTEMPTS; guard += 1) {
    const end = start + runDurationMs;

    const blocker = pmWindows.length > 0 ? pmWindowBlocks(lineKey, start, end, pmWindows) : null;
    if (blocker) {
      const windowEnd = timestampMs(blocker.end_at);
      if (windowEnd === null) break;
      start = Math.max(start, windowEnd);
      continue;
    }

    if (capacityMs !== null) {
      if (canReserveCapacity(lineKey, start, runDurationMs, capacityMs, dayUsageMs)) {
        reserveCapacity(lineKey, start, runDurationMs, dayUsageMs);
        return start;
      }
      start = nextCapacityRetryStart(lineKey, start, runDurationMs, capacityMs, dayUsageMs);
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
): number {
  const useChangeover = config.sequencingStrategy !== 'greedy';
  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < unscheduled.length; index += 1) {
    const candidate = unscheduled[index];
    const { cost, transitionMinutes, feasible } = changeoverBetween(
      tail,
      candidate,
      matrix,
      config.changeoverWeight,
    );
    if (useChangeover && !feasible) continue;

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
    bestIndex = 0;
    for (let index = 1; index < unscheduled.length; index += 1) {
      if (compareByDueDateThenId(unscheduled[index], unscheduled[bestIndex]) < 0) {
        bestIndex = index;
      }
    }
  }

  return bestIndex;
}

export function sequenceWorkOrders(
  wos: WorkOrderForScheduling[],
  matrix: ChangeoverMatrixEntry[],
  config: SequenceSolverConfig = cloneDefaultSolverConfig(),
): SequencedAssignment[] {
  if (wos.length === 0) return [];

  const unscheduled = [...wos].sort(compareByDueDateThenId);
  const sequence: WorkOrderForScheduling[] = [];

  const first = unscheduled.shift();
  if (!first) return [];
  sequence.push(first);

  while (unscheduled.length > 0) {
    const tail = sequence[sequence.length - 1];
    const bestIndex = pickNextIndex(tail, unscheduled, matrix, config);
    const [next] = unscheduled.splice(bestIndex, 1);
    sequence.push(next);
  }

  let cumulative = 0;
  const now = Date.now();
  const plannedEndByLine = new Map<string, number>();
  const dayUsageMs = new Map<string, number>();
  const lastWoByLine = new Map<string, WorkOrderForScheduling>();

  return sequence.map((workOrder, index) => {
    const lineKey = workOrder.production_line_id ?? '__unassigned__';
    const previous = lastWoByLine.get(lineKey) ?? null;
    const profile = normalizedAllergenIds(workOrder.allergen_ids);
    const toKey = allergenProfileKey(profile);
    const { transitionMinutes } = previous
      ? changeoverBetween(previous, workOrder, matrix, config.changeoverWeight)
      : { transitionMinutes: 0 };
    const changeoverCost = transitionMinutes;
    const earliestStart = Math.max(now, (plannedEndByLine.get(lineKey) ?? now) + changeoverCost * 60 * 1000);
    const runDuration = durationMs(workOrder);
    const plannedStart = resolvePlannedStart(lineKey, earliestStart, runDuration, config, dayUsageMs);
    const plannedEnd = plannedStart + runDuration;
    plannedEndByLine.set(lineKey, plannedEnd);
    lastWoByLine.set(lineKey, workOrder);
    cumulative += changeoverCost;

    return {
      wo_id: workOrder.id,
      sequence_index: index + 1,
      line_id: workOrder.production_line_id,
      planned_start_at: new Date(plannedStart).toISOString(),
      planned_end_at: new Date(plannedEnd).toISOString(),
      changeover_cost: changeoverCost,
      cumulative_changeover_cost: cumulative,
      allergen_profile_key: toKey,
      work_order: workOrder,
    };
  });
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
  config: SequenceSolverConfig,
  dayUsageMs: Map<string, number>,
): number {
  return resolvePlannedStart(lineKey, earliestMs, runDurationMs, config, dayUsageMs);
}
