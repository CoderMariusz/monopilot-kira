'use server';

/**
 * C-R2 — page-local server-action adapter for the reversibility UI.
 *
 * The corrections backend lane OWNS production/_actions/corrections-actions.ts
 * (import-only — never authored here). Both `voidWasteEntry` and `voidWoOutput`
 * (e-sign) have shipped, so the adapter is a direct delegation — no runtime
 * namespace guard: a real import/module error must surface as a build/runtime
 * failure, never be masked as a typed `persistence_failed`. The file itself
 * stays as the page-local 'use server' seam (route convention).
 */

import { reverseConsumption, voidWasteEntry, voidWoOutput } from '../../_actions/corrections-actions';
import type {
  VoidWasteEntryInput,
  VoidWasteEntryResult,
  VoidWoOutputInput,
  VoidWoOutputResult,
} from './_components/void-correction-modal';
import type {
  ReverseConsumptionInput,
  ReverseConsumptionResult,
} from './_components/reverse-consumption-modal';

export async function voidWasteEntryAction(input: VoidWasteEntryInput): Promise<VoidWasteEntryResult> {
  return voidWasteEntry(input);
}

export async function voidWoOutputAction(input: VoidWoOutputInput): Promise<VoidWoOutputResult> {
  return voidWoOutput(input);
}

/**
 * C-R3 — reverse-consumption adapter seam. `reverseConsumption` (e-sign) has
 * SHIPPED in corrections-actions.ts, so this is a direct import-only delegation —
 * the action is NEVER authored here. A real import/module error must surface as a
 * build/runtime failure, never be masked as a typed `persistence_failed` (same
 * convention as voidWoOutput / voidWasteEntry above).
 */
export async function reverseConsumptionAction(
  input: ReverseConsumptionInput,
): Promise<ReverseConsumptionResult> {
  return reverseConsumption(input) as Promise<ReverseConsumptionResult>;
}
