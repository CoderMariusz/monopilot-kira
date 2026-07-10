'use server';

/**
 * Ensure a clone-on-write draft exists for an immutable (active/technical_approved)
 * BOM version via the canonical DB helper bom_request_version_edit (mig 168).
 *
 * Idempotent per source: concurrent edits attach to the SAME in-flight draft.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { callBomRequestVersionEdit } from '../../../../../../../lib/technical/bom-request-version-edit';
import { safeRevalidatePath } from './revalidate';
import {
  BOM_CREATE_PERMISSION,
  hasPermission,
  isPgError,
  type EnsureBomVersionEditDraftResult,
  type OrgActionContext,
  type QueryClient,
} from './shared';
import { z } from 'zod';

const EnsureBomVersionEditDraftInput = z.object({
  sourceBomHeaderId: z.string().uuid(),
  notes: z.string().trim().max(2000).optional(),
});

export async function ensureBomVersionEditDraft(rawInput: unknown): Promise<EnsureBomVersionEditDraftResult> {
  const parsed = EnsureBomVersionEditDraftInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<EnsureBomVersionEditDraftResult> => {
      const c = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: c };
      if (!(await hasPermission(ctx, BOM_CREATE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows: sourceRows } = await c.query<{ status: string }>(
        `select header.status
           from public.bom_headers header
          where header.org_id = app.current_org_id()
            and header.id = $1::uuid`,
        [parsed.data.sourceBomHeaderId],
      );
      const source = sourceRows[0];
      if (!source) return { ok: false, error: 'not_found' };
      if (!['technical_approved', 'active'].includes(source.status)) {
        return {
          ok: false,
          error: 'invalid_state',
          message: `clone-on-write only applies to technical_approved/active versions (is ${source.status})`,
        };
      }

      const edit = await callBomRequestVersionEdit(c, {
        sourceBomHeaderId: parsed.data.sourceBomHeaderId,
        requestedBy: userId,
        notes: parsed.data.notes ?? null,
      });
      if (!edit) return { ok: false, error: 'persistence_failed' };

      safeRevalidatePath('/technical/bom');
      return {
        ok: true,
        data: {
          id: edit.bom_header_id,
          version: edit.version,
          decision: edit.decision,
          supersedesBomHeaderId: edit.supersedes_bom_header_id,
        },
      };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') {
      return { ok: false, error: 'invalid_state', message: err.message };
    }
    console.error('[technical/bom] ensureBomVersionEditDraft persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
