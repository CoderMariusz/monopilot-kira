/**
 * Trial stage — capacity-block types (NON-'use server' sibling).
 *
 * Shapes mirror `upsertCapacityBlock` in planning/schedule/_actions/capacity-block-actions.ts.
 */

export type ProductionLineOption = {
  id: string;
  code: string;
  name: string;
};

export type TrialCapacityBookingView = {
  id: string;
  trialId: string;
  lineId: string;
  lineCode: string;
  lineName: string;
  blockDate: string;
  /** HH:MM (normalized from DB time). */
  startTime: string;
  /** HH:MM (normalized from DB time). */
  endTime: string;
};

export type UpsertCapacityBlockCall = {
  trialId: string;
  lineId: string;
  blockDate: string;
  startTime: string;
  endTime: string;
};

export type UpsertCapacityBlockError =
  | 'invalid_input'
  | 'invalid_range'
  | 'forbidden'
  | 'invalid_line'
  | 'trial_not_found'
  | 'persistence_failed';

export type CapacityBlockActionOutcome = { ok: boolean; error?: UpsertCapacityBlockError };

/** Normalize Postgres `time` text ("09:00:00") to the HH:MM the action expects. */
export function normalizeTimeHHMM(value: string): string {
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  return trimmed.slice(0, 5);
}
