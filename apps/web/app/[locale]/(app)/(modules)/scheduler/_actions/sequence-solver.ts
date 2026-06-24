import type {
  ChangeoverMatrixEntry,
  SequencedAssignment,
  WorkOrderForScheduling,
} from './scheduler-types';

function allergenProfileKey(wo: WorkOrderForScheduling): string {
  return wo.allergen_ids
    .map((id) => id.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join('|');
}

function dueTime(wo: WorkOrderForScheduling): number {
  return new Date(wo.due_date).getTime();
}

function minutes(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function matrixKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

function buildCostLookup(matrix: ChangeoverMatrixEntry[]): Map<string, number> {
  const lookup = new Map<string, number>();
  for (const entry of matrix) {
    lookup.set(matrixKey(entry.allergen_from, entry.allergen_to), minutes(entry.changeover_minutes));
  }
  return lookup;
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

function durationMs(wo: WorkOrderForScheduling): number | null {
  const pairs: Array<[string | Date | null, string | Date | null]> = [
    [wo.scheduled_start_time, wo.scheduled_end_time],
    [wo.planned_start_date, wo.planned_end_date],
  ];
  for (const [startValue, endValue] of pairs) {
    const start = timestampMs(startValue);
    const end = timestampMs(endValue);
    if (start === null || end === null || end < start) continue;
    return end - start;
  }
  return null;
}

export function sequenceWorkOrders(
  wos: WorkOrderForScheduling[],
  matrix: ChangeoverMatrixEntry[],
): SequencedAssignment[] {
  if (wos.length === 0) return [];

  const costLookup = buildCostLookup(matrix);
  const unscheduled = [...wos].sort(compareByDueDateThenId);
  const sequence: WorkOrderForScheduling[] = [];

  const first = unscheduled.shift();
  if (!first) return [];
  sequence.push(first);

  while (unscheduled.length > 0) {
    const tail = sequence[sequence.length - 1];
    const fromKey = allergenProfileKey(tail);
    let bestIndex = 0;
    let bestCost = Number.POSITIVE_INFINITY;

    for (let index = 0; index < unscheduled.length; index += 1) {
      const candidate = unscheduled[index];
      const toKey = allergenProfileKey(candidate);
      const cost = costLookup.get(matrixKey(fromKey, toKey)) ?? 0;
      const best = unscheduled[bestIndex];
      const dueDelta = compareByDueDateThenId(candidate, best);
      if (cost < bestCost || (cost === bestCost && dueDelta < 0)) {
        bestIndex = index;
        bestCost = cost;
      }
    }

    const [next] = unscheduled.splice(bestIndex, 1);
    sequence.push(next);
  }

  let cumulative = 0;
  const now = Date.now();
  const plannedEndByLine = new Map<string, number>();

  return sequence.map((workOrder, index) => {
    const previous = index === 0 ? null : sequence[index - 1];
    const fromKey = previous ? allergenProfileKey(previous) : '';
    const toKey = allergenProfileKey(workOrder);
    const changeoverCost = previous ? costLookup.get(matrixKey(fromKey, toKey)) ?? 0 : 0;
    const lineKey = workOrder.production_line_id ?? '__unassigned__';
    const plannedStart = Math.max(now, plannedEndByLine.get(lineKey) ?? now);
    const plannedEnd = Math.max(plannedStart, plannedStart + (durationMs(workOrder) ?? 0));
    plannedEndByLine.set(lineKey, plannedEnd);
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
