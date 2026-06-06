'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  ApproveEcoInput,
  ECO_APPROVE_PERMISSION,
  hasPermission,
  type MutateEcoResult,
  type OrgActionContext,
  type QueryClient,
  writeEcoAudit,
} from './shared';

export async function approveChangeOrder(rawInput: unknown): Promise<MutateEcoResult> {
  const parsed = ApproveEcoInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<MutateEcoResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, ECO_APPROVE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows } = await qc.query<{ id: string; previous_status: string; status: string }>(
        `update public.technical_change_orders
            set status = 'approved',
                approver_user_id = $2::uuid,
                approved_at = pg_catalog.now(),
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'draft'
          returning id, 'draft'::text as previous_status, status`,
        [parsed.data.id, userId],
      );
      const order = rows[0];
      if (!order) {
        const exists = await qc.query<{ id: string; status: string }>(
          `select id, status from public.technical_change_orders where org_id = app.current_org_id() and id = $1::uuid`,
          [parsed.data.id],
        );
        if (!exists.rows[0]) return { ok: false, error: 'not_found' };
        return { ok: false, error: 'invalid_state' };
      }

      await qc.query(
        `insert into public.technical_change_order_approvals
           (org_id, change_order_id, action, from_status, to_status, actor_user_id, comment)
         values (app.current_org_id(), $1::uuid, 'approve', 'draft', 'approved', $2::uuid, $3)`,
        [order.id, userId, parsed.data.comment ?? null],
      );
      await writeEcoAudit(qc, {
        orgId,
        changeOrderId: order.id,
        actorUserId: userId,
        action: 'eco.approved',
        fromStatus: 'draft',
        toStatus: 'approved',
        payload: { comment: parsed.data.comment ?? null },
      });

      return { ok: true, data: { id: order.id, status: 'approved' } };
    });
  } catch (error) {
    console.error('[technical/eco] approveChangeOrder failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
