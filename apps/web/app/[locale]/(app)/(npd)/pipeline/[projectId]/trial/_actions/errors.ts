/**
 * 01-NPD TRIAL stage — shared error codes + types (NON-`'use server'` sibling).
 *
 * A `'use server'` file may ONLY export async functions (Next.js compiles every
 * export into a callable server-action reference). Error-code unions and result
 * shapes live here so the action files can import them without breaking
 * `next build` (MON-t2-api §"'use server' export rule").
 */

export type TrialResult = 'pass' | 'fail' | 'pending';

export type LogTrialBatchError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'duplicate_trial_no'
  | 'persistence_failed';

export type UpdateTrialBatchError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'duplicate_trial_no'
  | 'persistence_failed';

export type ListTrialBatchesError =
  | 'forbidden'
  | 'not_found'
  | 'persistence_failed';

/** Canonical RLS-scoped read/write permission strings (BYTE-IDENTICAL to seed). */
export const TRIAL_READ_PERMISSION = 'npd.trial.read';
export const TRIAL_WRITE_PERMISSION = 'npd.trial.write';

/** A single trial-batch row as carried across the RSC boundary. */
export type TrialBatchView = {
  id: string;
  trialNo: string;
  /** ISO date (YYYY-MM-DD) or null. */
  trialDate: string | null;
  /** NUMERIC kept as a decimal STRING (never a JS float) or null. */
  batchSizeKg: string | null;
  /** NUMERIC(5,2) kept as a decimal STRING or null. */
  yieldPct: string | null;
  technologistUserId: string | null;
  technologistName: string | null;
  result: TrialResult;
  notes: string | null;
};
