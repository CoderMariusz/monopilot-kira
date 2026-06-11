'use server';

/**
 * Wave 8b Lane IA — items draft→active promotion (audit finding #8).
 *
 * `items.status = 'draft'` previously had NO UI path to 'active' — items created
 * as drafts (import, NPD handoff) were stuck without SQL. This action moves an
 * item along the explicit lifecycle validated by isAllowedStatusTransition():
 * draft→active (Activate), active→deprecated (Deprecate), deprecated→active
 * (Reactivate). 'blocked' remains owned by deactivateItem (TEC-081) and nothing
 * ever returns to 'draft'.
 *
 * Gated on `technical.items.edit` (the same write permission as updateItem —
 * a status change is a master-data edit, not a TEC-081 removal). RLS-scoped
 * under withOrgContext; audited like the deactivate neighbor.
 *
 * Activation data gate (pragmatic, this wave): draft→active requires uom_base
 * to be one of the CANONICAL_UOMS (migration 267 closed list). Legacy pre-267
 * rows can carry free text like 'eac'; activating those would leak a broken
 * unit into BOMs/planning. Everything else required for activation is already
 * NOT NULL on the table (name, item_type, uom_base presence).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from './revalidate';
import {
  CANONICAL_UOMS,
  hasPermission,
  isAllowedStatusTransition,
  ITEMS_EDIT_PERMISSION,
  type ItemStatus,
  type OrgActionContext,
  type QueryClient,
  TransitionItemStatusInput,
  type TransitionItemStatusResult,
  writeAudit,
} from './shared';

const CANONICAL_UOM_SET = new Set<string>(CANONICAL_UOMS);

export async function transitionItemStatus(rawInput: unknown): Promise<TransitionItemStatusResult> {
  const parsed = TransitionItemStatusInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<TransitionItemStatusResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, ITEMS_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      const before = await (client as QueryClient).query<{ status: string; uom_base: string }>(
        `select status, uom_base from public.items
          where org_id = app.current_org_id() and id = $1::uuid`,
        [input.id],
      );
      const current = before.rows[0];
      if (!current) return { ok: false, error: 'not_found' };

      // Idempotent: re-applying the status the item already has is a no-op success.
      if (current.status === input.toStatus) {
        return { ok: true, data: { id: input.id, status: input.toStatus as ItemStatus } };
      }

      if (!isAllowedStatusTransition(current.status, input.toStatus)) {
        return {
          ok: false,
          error: 'invalid_transition',
          message: `transition ${current.status} -> ${input.toStatus} is not allowed`,
        };
      }

      // Activation data gate: a draft may only go live with a canonical base UoM.
      if (current.status === 'draft' && input.toStatus === 'active' && !CANONICAL_UOM_SET.has(current.uom_base)) {
        return {
          ok: false,
          error: 'activation_gate_failed',
          message: `uom_base '${current.uom_base}' is not canonical (${CANONICAL_UOMS.join(', ')})`,
        };
      }

      const { rows } = await (client as QueryClient).query<{ id: string; status: string }>(
        `update public.items
            set status = $2
          where org_id = app.current_org_id()
            and id = $1::uuid
        returning id, status`,
        [input.id, input.toStatus],
      );
      const updated = rows[0];
      if (!updated) return { ok: false, error: 'not_found' };

      await writeAudit(client as QueryClient, {
        orgId,
        actorUserId: userId,
        action: 'item.status_transitioned',
        resourceId: input.id,
        beforeState: { status: current.status },
        afterState: { status: input.toStatus },
      });

      safeRevalidatePath('/technical/items');
      return { ok: true, data: { id: updated.id, status: updated.status as ItemStatus } };
    });
  } catch (err) {
    console.error('[technical/items] transitionItemStatus persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
