'use server';

/**
 * WAVE E2B — page-local server-action adapter for the GRN delivery-condition
 * (cold-chain) temperature control.
 *
 * The cold-chain backend lane OWNS submitConditionCheck in
 * quality/_actions/cold-chain-actions.ts; this seam is a direct import-only
 * delegation — the action is NEVER authored here (route convention, mirrors
 * receipt-corrections-adapter.ts). The action re-validates RBAC
 * (quality.coldchain.record) + inputs and, on out-of-range, routes a quality hold
 * through the canonical hold path. A real import/module error surfaces as a
 * build/runtime failure, never masked as a typed result.
 */

import { submitConditionCheck } from '../../../quality/_actions/cold-chain-actions';
import type {
  SubmitTempCheckInput,
  SubmitTempCheckResult,
} from './_components/grn-temp-check.client';

export async function submitConditionCheckAction(
  input: SubmitTempCheckInput,
): Promise<SubmitTempCheckResult> {
  return submitConditionCheck(input) as Promise<SubmitTempCheckResult>;
}
