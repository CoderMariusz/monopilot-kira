'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  CreateEcoInput,
  ECO_WRITE_PERMISSION,
  hasPermission,
  isPgError,
  type MutateEcoResult,
  type OrgActionContext,
  type QueryClient,
  replaceEcoLines,
  writeEcoAudit,
} from './shared';

export async function createChangeOrder(rawInput: unknown): Promise<MutateEcoResult> {
  const parsed = CreateEcoInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<MutateEcoResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, ECO_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows } = await qc.query<{ id: string; status: string }>(
        `insert into public.technical_change_orders
           (org_id, code, title, description, status, priority, change_type, requester_user_id,
            target_item_id, target_bom_header_id, target_factory_spec_id, impact_summary,
            requested_effective_at, ext_jsonb, created_by, updated_by)
         values
           (app.current_org_id(), $1, $2, $3, 'draft', $4, $5, coalesce($6::uuid, $15::uuid),
            $7::uuid, $8::uuid, $9::uuid, $10, $11::timestamptz, $12::jsonb, $13::uuid, $14::uuid)
         returning id, status`,
        [
          input.code,
          input.title,
          input.description ?? null,
          input.priority,
          input.changeType,
          input.requesterUserId ?? null,
          input.targetItemId ?? null,
          input.targetBomHeaderId ?? null,
          input.targetFactorySpecId ?? null,
          input.impactSummary ?? null,
          input.requestedEffectiveAt ?? null,
          JSON.stringify(input.extJsonb),
          userId,
          userId,
          userId,
        ],
      );
      const order = rows[0];
      if (!order) return { ok: false, error: 'persistence_failed' };

      await replaceEcoLines(qc, order.id, userId, input.lines);
      await writeEcoAudit(qc, {
        orgId,
        changeOrderId: order.id,
        actorUserId: userId,
        action: 'eco.created',
        toStatus: 'draft',
        payload: { code: input.code, lineCount: input.lines.length },
      });

      return { ok: true, data: { id: order.id, status: 'draft' } };
    });
  } catch (error) {
    if (isPgError(error) && error.code === '23505') return { ok: false, error: 'already_exists' };
    if (isPgError(error) && (error.code === '23503' || error.code === '23514')) {
      return { ok: false, error: 'invalid_input' };
    }
    console.error('[technical/eco] createChangeOrder failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
