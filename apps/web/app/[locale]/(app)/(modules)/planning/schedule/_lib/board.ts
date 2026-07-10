/**
 * Pure schedule-board domain helpers + shared types for /planning/schedule.
 *
 * NOT a 'use server' module — the action file may only export async functions,
 * so the board's types, geometry math, and conflict detection live here where
 * both the Server Action and the client component (and tests) can import them.
 */

import type { PaginatedResult } from '../../../../../../../lib/shared/pagination';
import { wallClockToInstant } from '../../../../../../../lib/shared/wall-clock-time';

/** WO statuses that appear on the board (planning-phase + running). */
export const BOARD_STATUSES = ['DRAFT', 'RELEASED', 'IN_PROGRESS'] as const;

/** WO statuses rescheduleWorkOrder accepts ("planned"=DRAFT + RELEASED). */
export const RESCHEDULE_LEGAL_STATUSES = ['DRAFT', 'RELEASED'] as const;

/** Board window length — 7 days starting today (UTC midnight). */
export const BOARD_WINDOW_DAYS = 7;

/** Fallback bar length when scheduled_end_time is NULL (open-ended WO). */
export const OPEN_END_FALLBACK_MS = 60 * 60 * 1000;

export type ScheduleBoardLine = {
  id: string;
  code: string;
  name: string;
};

export type ScheduleBoardWo = {
  id: string;
  woNumber: string;
  itemCode: string | null;
  itemName: string | null;
  status: string;
  priority: string;
  productionLineId: string | null;
  scheduledStart: string | null; // ISO
  scheduledEnd: string | null; // ISO; null = open-ended (fallback width)
  plannedQuantity: string;
  uom: string;
};

export type ScheduleCapacityBlock = {
  id: string;
  lineId: string;
  projectId: string | null;
  trialId: string | null;
  label: string;
  blockDate: string;
  startTime: string;
  endTime: string;
  blockType: string;
};

export type ScheduleLineDayUtilization = {
  lineId: string;
  dayKey: string; // YYYY-MM-DD (UTC)
  scheduledHours: number;
  capacityHours: number | null;
  /** null when capacityHours is null or zero. */
  utilizationPct: number | null;
};

export type ScheduleBoardData = {
  windowStart: string; // ISO, UTC midnight today
  windowEnd: string; // ISO, windowStart + 7d
  /** IANA timezone for the active site — capacity-block wall times are interpreted here. */
  siteTimezone: string;
  lines: ScheduleBoardLine[];
  scheduled: ScheduleBoardWo[];
  unscheduled: ScheduleBoardWo[];
  unscheduledPagination: PaginatedResult<ScheduleBoardWo>;
  capacityBlocks: ScheduleCapacityBlock[];
  /** Per-line/day finite-capacity utilisation from scheduler_config + scheduled WOs. */
  lineDayUtilization: ScheduleLineDayUtilization[];
};

export type BarInterval = {
  id: string;
  lineId: string | null;
  startMs: number;
  endMs: number;
};

/**
 * IDs of bars that overlap another bar on the SAME line (open interval
 * comparison — touching end==start is NOT a conflict). Bars without a line
 * never conflict (they render in the "no line" lane purely informationally).
 */
export function computeConflictIds(bars: readonly BarInterval[]): Set<string> {
  const conflictIds = new Set<string>();
  const byLine = new Map<string, BarInterval[]>();
  for (const bar of bars) {
    if (bar.lineId === null) continue;
    const lane = byLine.get(bar.lineId);
    if (lane) lane.push(bar);
    else byLine.set(bar.lineId, [bar]);
  }
  for (const lane of byLine.values()) {
    const sorted = [...lane].sort((a, b) => a.startMs - b.startMs);
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = sorted[i] as BarInterval;
        const b = sorted[j] as BarInterval;
        if (b.startMs >= a.endMs) break; // sorted — no later bar can overlap a
        conflictIds.add(a.id);
        conflictIds.add(b.id);
      }
    }
  }
  return conflictIds;
}

/** Interval for a WO bar, applying the open-end fallback. */
export function barInterval(wo: ScheduleBoardWo): BarInterval | null {
  if (!wo.scheduledStart) return null;
  const startMs = Date.parse(wo.scheduledStart);
  if (Number.isNaN(startMs)) return null;
  const endParsed = wo.scheduledEnd ? Date.parse(wo.scheduledEnd) : Number.NaN;
  const endMs = Number.isNaN(endParsed) ? startMs + OPEN_END_FALLBACK_MS : endParsed;
  return { id: wo.id, lineId: wo.productionLineId, startMs, endMs: Math.max(endMs, startMs) };
}

export function capacityBlockInterval(
  block: ScheduleCapacityBlock,
  siteTimezone: string,
): BarInterval | null {
  const startMs = wallClockToInstant(block.blockDate, block.startTime, siteTimezone);
  const endMs = wallClockToInstant(block.blockDate, block.endTime, siteTimezone);
  if (startMs === null || endMs === null) return null;
  return { id: block.id, lineId: block.lineId, startMs, endMs: Math.max(endMs, startMs) };
}

/**
 * Percentage geometry of a bar inside the board window, clamped to [0,100].
 * Returns null when the bar lies fully outside the window. Minimum width
 * 0.75% keeps zero/short bars clickable.
 */
export function barGeometry(
  startMs: number,
  endMs: number,
  windowStartMs: number,
  windowEndMs: number,
): { leftPct: number; widthPct: number } | null {
  const span = windowEndMs - windowStartMs;
  if (span <= 0) return null;
  if (endMs <= windowStartMs || startMs >= windowEndMs) return null;
  const clampedStart = Math.max(startMs, windowStartMs);
  const clampedEnd = Math.min(endMs, windowEndMs);
  const leftPct = ((clampedStart - windowStartMs) / span) * 100;
  const widthPct = Math.max(((clampedEnd - clampedStart) / span) * 100, 0.75);
  return { leftPct, widthPct: Math.min(widthPct, 100 - leftPct) };
}

/** The 7 day-key strings (YYYY-MM-DD, UTC) of the window for headers. */
export function windowDayKeys(windowStartIso: string, days: number = BOARD_WINDOW_DAYS): string[] {
  const startMs = Date.parse(windowStartIso);
  return Array.from({ length: days }, (_, i) =>
    new Date(startMs + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
}

export const UTC_DAY_MS = 24 * 60 * 60 * 1000;

/** UTC midnight for the day containing `ms`. */
export function startOfUtcDayMs(ms: number): number {
  const day = new Date(ms);
  day.setUTCHours(0, 0, 0, 0);
  return day.getTime();
}

/** Milliseconds of [startMs, endMs) overlapping a UTC day bucket. */
export function overlapMsWithUtcDay(startMs: number, endMs: number, dayStartMs: number): number {
  const dayEndMs = dayStartMs + UTC_DAY_MS;
  const overlapStart = Math.max(startMs, dayStartMs);
  const overlapEnd = Math.min(endMs, dayEndMs);
  return Math.max(0, overlapEnd - overlapStart);
}

export type UtcDayOverlap = {
  dayStartMs: number;
  overlapMs: number;
};

/** Split [startMs, endMs) into per-UTC-day overlap slices (shared with the scheduler solver). */
export function utcDayOverlapsForInterval(startMs: number, endMs: number): UtcDayOverlap[] {
  if (endMs <= startMs) return [];
  const overlaps: UtcDayOverlap[] = [];
  let dayStartMs = startOfUtcDayMs(startMs);
  while (dayStartMs < endMs) {
    const overlapMs = overlapMsWithUtcDay(startMs, endMs, dayStartMs);
    if (overlapMs > 0) overlaps.push({ dayStartMs, overlapMs });
    dayStartMs += UTC_DAY_MS;
  }
  return overlaps;
}

function numericCapacity(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveLineCapacityHours(
  lineId: string,
  perLine: Map<string, number | null>,
  orgDefault: number | null,
): number | null {
  if (perLine.has(lineId)) return perLine.get(lineId) ?? null;
  return orgDefault;
}

/**
 * Aggregate scheduled WO hours per line/day and compare to scheduler_config capacity.
 * `capacityRows` uses null line_id for the org-wide default.
 */
export function computeLineDayUtilization(input: {
  lines: readonly ScheduleBoardLine[];
  scheduled: readonly ScheduleBoardWo[];
  capacityRows: ReadonlyArray<{ line_id: string | null; capacity_hours_per_day: string | number | null }>;
  windowStartIso: string;
  days?: number;
}): ScheduleLineDayUtilization[] {
  const days = input.days ?? BOARD_WINDOW_DAYS;
  const windowStartMs = Date.parse(input.windowStartIso);
  const dayKeys = windowDayKeys(input.windowStartIso, days);

  const perLine = new Map<string, number | null>();
  let orgDefault: number | null = null;
  for (const row of input.capacityRows) {
    const hours = numericCapacity(row.capacity_hours_per_day);
    if (row.line_id === null) orgDefault = hours;
    else perLine.set(row.line_id, hours);
  }

  const scheduledHours = new Map<string, number>();
  for (const wo of input.scheduled) {
    const interval = barInterval(wo);
    if (!interval?.lineId) continue;
    for (let index = 0; index < days; index += 1) {
      const dayStartMs = windowStartMs + index * UTC_DAY_MS;
      const overlapMs = overlapMsWithUtcDay(interval.startMs, interval.endMs, dayStartMs);
      if (overlapMs <= 0) continue;
      const key = `${interval.lineId}|${dayKeys[index]}`;
      scheduledHours.set(key, (scheduledHours.get(key) ?? 0) + overlapMs / (60 * 60 * 1000));
    }
  }

  const results: ScheduleLineDayUtilization[] = [];
  for (const line of input.lines) {
    const capacityHours = resolveLineCapacityHours(line.id, perLine, orgDefault);
    for (const dayKey of dayKeys) {
      const key = `${line.id}|${dayKey}`;
      const hours = scheduledHours.get(key) ?? 0;
      if (hours <= 0 && capacityHours === null) continue;
      const utilizationPct =
        capacityHours !== null && capacityHours > 0 ? (hours / capacityHours) * 100 : null;
      results.push({
        lineId: line.id,
        dayKey,
        scheduledHours: Math.round(hours * 100) / 100,
        capacityHours,
        utilizationPct: utilizationPct === null ? null : Math.round(utilizationPct * 10) / 10,
      });
    }
  }
  return results;
}
