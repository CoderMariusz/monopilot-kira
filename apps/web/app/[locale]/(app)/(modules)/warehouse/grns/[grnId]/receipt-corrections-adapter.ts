'use server';

/**
 * C-R3 — page-local server-action adapter for the GRN-line cancel UI.
 *
 * The warehouse corrections lane OWNS cancelGrnLine in
 * warehouse/_actions/receipt-corrections-actions.ts and has SHIPPED, so this seam
 * is a direct import-only delegation — the action is NEVER authored here (route
 * convention). A real import/module error must surface as a build/runtime failure,
 * never be masked as a typed `persistence_failed` (mirrors the matured production
 * void-actions-adapter note once both lanes landed).
 */

import { cancelGrnLine } from '../../_actions/receipt-corrections-actions';
import type {
  CancelGrnLineInput,
  CancelGrnLineResult,
} from './_components/grn-line-cancel-modal.client';

export async function cancelGrnLineAction(input: CancelGrnLineInput): Promise<CancelGrnLineResult> {
  return cancelGrnLine(input) as Promise<CancelGrnLineResult>;
}
