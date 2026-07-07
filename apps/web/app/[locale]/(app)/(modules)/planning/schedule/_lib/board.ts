/**
 * Pure schedule-board domain helpers + shared types for /planning/schedule.
 *
 * NOT a 'use server' module — the action file may only export async functions,
 * so the board's types, geometry math, and conflict detection live here where
 * both the Server Action and the client component (and tests) can import them.
 */

import type { PaginatedResult } from '../../../../../../../lib/shared/pagination';

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

export type ScheduleBoardData = {
  windowStart: string; // ISO, UTC midnight today
  windowEnd: string; // ISO, windowStart + 7d
  lines: ScheduleBoardLine[];
  scheduled: ScheduleBoardWo[];
  unscheduled: ScheduleBoardWo[];
  unscheduledPagination: PaginatedResult<ScheduleBoardWo>;
  capacityBlocks: ScheduleCapacityBlock[];
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

export function capacityBlockInterval(block: ScheduleCapacityBlock): BarInterval | null {
  const startMs = Date.parse(`${block.blockDate}T${block.startTime}Z`);
  const endMs = Date.parse(`${block.blockDate}T${block.endTime}Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
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
