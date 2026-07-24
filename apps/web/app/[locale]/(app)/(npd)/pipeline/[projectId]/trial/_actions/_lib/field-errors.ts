/**
 * Trial stage — zod failure → field-specific error code (NON-`'use server'`).
 *
 * PF-R04-12: a rejected `101%` yield returned a bare `invalid_input`, which the
 * modal could only render as "Could not save". Naming the field that failed lets
 * the UI point at it and state the rule.
 *
 * Lives under `_lib/` because a `'use server'` module may only export async
 * server actions.
 */

import type { ZodError } from 'zod';

import { percentFieldError } from '../../../_lib/yield-percent';
import type { TrialFieldError } from '../errors';

/**
 * `raw` is the unparsed action input — needed to tell "yield is 101" (a rule
 * violation the user can act on) from "yield is gibberish" (a format problem).
 */
export function trialFieldErrorFrom(
  error: ZodError,
  raw: unknown,
): TrialFieldError | 'invalid_input' {
  const failed = new Set(error.issues.map((issue) => String(issue.path[0] ?? '')));

  if (failed.has('yieldPct')) {
    const value = (raw as { yieldPct?: unknown } | null | undefined)?.yieldPct;
    return typeof value === 'string' && percentFieldError(value) === 'yield_out_of_range'
      ? 'yield_out_of_range'
      : 'invalid_input';
  }
  if (failed.has('batchSizeKg')) return 'batch_size_invalid';

  return 'invalid_input';
}
