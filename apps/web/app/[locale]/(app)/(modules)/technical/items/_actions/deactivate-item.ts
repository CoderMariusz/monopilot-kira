'use server';

/**
 * Lane A — 03-technical Items Master: deactivate Server Action (T-011).
 *
 * Gated on the real `technical.items.deactivate` RBAC permission. The items
 * table has no soft-delete column, so "deactivate" sets status to 'blocked'
 * (a terminal of items_status_check). Idempotent: re-blocking an already-blocked
 * item is a no-op success. RLS-scoped under withOrgContext.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from './revalidate';
import {
  DeactivateItemInput,
  type DeactivateItemResult,
  hasPermission,
  ITEMS_DEACTIVATE_PERMISSION,
  type OrgActionContext,
  type QueryClient,
  writeAudit,
} from './shared';

export async function deactivateItem(rawInput: unknown): Promise<DeactivateItemResult> {
  const parsed = DeactivateItemInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<DeactivateItemResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, ITEMS_DEACTIVATE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const before = await (client as QueryClient).query<{ status: string }>(
        `select status from public.items
          where org_id = app.current_org_id() and id = $1::uuid`,
        [input.id],
      );
      if (before.rows.length === 0) return { ok: false, error: 'not_found' };

      const { rows } = await (client as QueryClient).query<{ id: string; status: string }>(
        `update public.items
            set status = 'blocked'
          where org_id = app.current_org_id()
            and id = $1::uuid
        returning id, status`,
        [input.id],
      );
      const updated = rows[0];
      if (!updated) return { ok: false, error: 'not_found' };

      await writeAudit(client as QueryClient, {
        orgId,
        actorUserId: userId,
        action: 'item.deactivated',
        resourceId: input.id,
        beforeState: { status: before.rows[0]?.status },
        // TEC-081 / V-TEC-05: capture the deactivation reason + notes in the audit
        // chain (no items column added). reason/notes are absent for legacy callers.
        afterState: {
          status: 'blocked',
          reason: input.reason ?? null,
          notes: input.notes ?? null,
        },
      });

      safeRevalidatePath('/technical/items');
      return { ok: true, data: { id: updated.id, status: 'blocked' } };
    });
  } catch (err) {
    console.error('[technical/items] deactivateItem persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
