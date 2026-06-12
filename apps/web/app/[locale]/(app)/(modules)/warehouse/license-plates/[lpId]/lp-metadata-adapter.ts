'use server';

/**
 * C-R3 — page-local server-action adapter for the LP edit-metadata UI.
 *
 * The warehouse corrections lane OWNS updateLpMetadata in
 * warehouse/_actions/receipt-corrections-actions.ts (it co-located the LP
 * metadata + GRN line-cancel corrections in one module). That lane has SHIPPED, so
 * this seam is a direct import-only delegation — the action is NEVER authored here
 * (route convention). A real import/module error must surface as a build/runtime
 * failure, never be masked as a typed `persistence_failed` (mirrors the matured
 * production void-actions-adapter note once both lanes landed).
 */

import { updateLpMetadata } from '../../_actions/receipt-corrections-actions';
import type {
  UpdateLpMetadataInput,
  UpdateLpMetadataResult,
} from './_components/lp-metadata-edit-modal.client';

export async function updateLpMetadataAction(
  input: UpdateLpMetadataInput,
): Promise<UpdateLpMetadataResult> {
  return updateLpMetadata(input) as Promise<UpdateLpMetadataResult>;
}
