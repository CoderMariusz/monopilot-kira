/**
 * 01-NPD TRIAL stage — shared error codes + types (NON-`'use server'` sibling).
 *
 * A `'use server'` file may ONLY export async functions (Next.js compiles every
 * export into a callable server-action reference). Error-code unions and result
 * shapes live here so the action files can import them without breaking
 * `next build` (MON-t2-api §"'use server' export rule").
 */

export type TrialResult = 'pass' | 'fail' | 'pending';

/**
 * Field-specific validation codes. `invalid_input` alone forced the UI to say
 * "Could not save" for a 101% yield (PF-R04-12) — these name the offending
 * field so the modal can point at it.
 */
export type TrialFieldError = 'yield_out_of_range' | 'batch_size_invalid';

export type LogTrialBatchError =
  | 'invalid_input'
  | TrialFieldError
  | 'forbidden'
  | 'not_found'
  | 'duplicate_trial_no'
  | 'persistence_failed';

export type UpdateTrialBatchError =
  | 'invalid_input'
  | TrialFieldError
  | 'forbidden'
  | 'not_found'
  | 'duplicate_trial_no'
  | 'voided'
  | 'persistence_failed';

/**
 * Void = corrective withdrawal of a persisted trial (migration 518). Curated
 * per-module list, mirroring shipping's CANCEL_SHIPMENT_REASON_CODES rather
 * than the production ledger codes (wrong_batch/wrong_product don't apply).
 */
export const TRIAL_VOID_REASON_CODES = [
  'entry_error',
  'trial_not_run',
  'wrong_project',
  'duplicate_entry',
  'other',
] as const;

export type TrialVoidReasonCode = (typeof TRIAL_VOID_REASON_CODES)[number];

export type VoidTrialBatchError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'already_voided'
  /** A signed G4 approval relies on this trial — revert the gate first. */
  | 'gate_approved'
  | 'persistence_failed';

/** Releasing a trial's booked line time (unbook) — a planning-side reversal. */
export type ReleaseTrialLineTimeError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'not_booked'
  | 'persistence_failed';

/**
 * Result shapes for the two corrective actions. They live HERE, not next to the
 * action, because a `'use server'` module must export nothing but async server
 * actions — even a type export makes the App-RSC build treat it as an action
 * reference (the Fala-1 build failure).
 */
export type VoidTrialBatchResult =
  | { ok: true; data: { id: string; releasedLineTime: boolean } }
  | { ok: false; error: VoidTrialBatchError; message?: string };

export type ReleaseTrialLineTimeResult =
  | { ok: true; data: { trialId: string } }
  | { ok: false; error: ReleaseTrialLineTimeError; message?: string };

export type DeleteTrialBatchError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'has_progressed'
  /** Voided trials are corrective evidence — they are never hard-deleted. */
  | 'voided'
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
  /** Set once the trial has been voided (migration 518) — read-only from then on. */
  voidedAt?: string | null;
  voidedByName?: string | null;
  voidReasonCode?: TrialVoidReasonCode | string | null;
  voidNote?: string | null;
};
