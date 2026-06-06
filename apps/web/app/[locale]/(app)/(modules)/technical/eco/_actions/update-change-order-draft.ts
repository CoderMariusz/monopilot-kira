'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  ECO_WRITE_PERMISSION,
  hasPermission,
  isPgError,
  type MutateEcoResult,
  type OrgActionContext,
  type QueryClient,
  replaceEcoLines,
  UpdateEcoDraftInput,
  writeEcoAudit,
} from './shared';

export async function updateChangeOrderDraft(rawInput: unknown): Promise<MutateEcoResult> {
  const parsed = UpdateEcoDraftInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<MutateEcoResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, ECO_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows: existingRows } = await qc.query<{ status: string }>(
        `select status
           from public.technical_change_orders
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [input.id],
      );
      const existing = existingRows[0];
      if (!existing) return { ok: false, error: 'not_found' };
      if (existing.status !== 'draft') return { ok: false, error: 'invalid_state' };

      const { rows } = await qc.query<{ id: string; status: string }>(
        `update public.technical_change_orders
            set code = $2,
                title = $3,
                description = $4,
                priority = $5,
                change_type = $6,
                requester_user_id = coalesce($7::uuid, requester_user_id),
                target_item_id = $8::uuid,
                target_bom_header_id = $9::uuid,
                target_factory_spec_id = $10::uuid,
                impact_summary = $11,
                requested_effective_at = $12::timestamptz,
                ext_jsonb = $13::jsonb,
                updated_by = $14::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
          returning id, status`,
        [
          input.id,
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
        ],
      );
      const order = rows[0];
      if (!order) return { ok: false, error: 'not_found' };

      await replaceEcoLines(qc, order.id, userId, input.lines);
      await writeEcoAudit(qc, {
        orgId,
        changeOrderId: order.id,
        actorUserId: userId,
        action: 'eco.updated',
        fromStatus: 'draft',
        toStatus: 'draft',
        payload: { lineCount: input.lines.length },
      });

      return { ok: true, data: { id: order.id, status: 'draft' } };
    });
  } catch (error) {
    if (isPgError(error) && error.code === '23505') return { ok: false, error: 'already_exists' };
    if (isPgError(error) && (error.code === '23503' || error.code === '23514')) {
      return { ok: false, error: 'invalid_input' };
    }
    console.error('[technical/eco] updateChangeOrderDraft failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
