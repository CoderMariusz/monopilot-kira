/**
 * Production-owned atomic transition for wo_outputs QA decisions + linked LP side-effects.
 * Quality inspection flows MUST call this — never write wo_outputs.qa_status directly.
 */
import { assertNoActiveHoldForLp } from '@monopilot/server/quality/holdsGuard.js';

import type { ProductionContext } from '../shared';

export type TransitionWoOutputQaDecision = 'PASSED' | 'FAILED';
export type TransitionWoOutputQaInput = {
  outputId: string;
  decision: TransitionWoOutputQaDecision;
  note?: string;
};
export type TransitionWoOutputQaResult = {
  outputId: string;
  qaStatus: TransitionWoOutputQaDecision;
  lpId: string | null;
  lpQaStatus: 'released' | 'rejected' | null;
};

export type TransitionWoOutputQaError =
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid_state'; message: string }
  | { ok: false; reason: 'quality_hold_active' };

export async function transitionWoOutputQaForContext(
  ctx: ProductionContext,
  input: TransitionWoOutputQaInput,
): Promise<{ ok: true; data: TransitionWoOutputQaResult } | TransitionWoOutputQaError> {
  const before = await ctx.client.query<{
    id: string;
    qa_status: string;
    lp_id: string | null;
  }>(
    `select id::text, qa_status, lp_id::text
       from public.wo_outputs
      where org_id = app.current_org_id()
        and id = $1::uuid
      for update`,
    [input.outputId],
  );
  const output = before.rows[0];
  if (!output) return { ok: false, reason: 'not_found' };
  if (output.qa_status === 'ON_HOLD') {
    return { ok: false, reason: 'invalid_state', message: 'on_hold_requires_holds_flow' };
  }
  if (output.qa_status !== 'PENDING') {
    return { ok: false, reason: 'invalid_state', message: 'invalid_state' };
  }

  const updated = await ctx.client.query<{
    id: string;
    qa_status: TransitionWoOutputQaDecision;
    lp_id: string | null;
  }>(
    `update public.wo_outputs
        set qa_status = $2
      where org_id = app.current_org_id()
        and id = $1::uuid
        and qa_status = 'PENDING'
    returning id::text, qa_status, lp_id::text`,
    [input.outputId, input.decision],
  );
  const row = updated.rows[0];
  if (!row) return { ok: false, reason: 'invalid_state', message: 'invalid_state' };

  let lpQaStatus: 'released' | 'rejected' | null = input.decision === 'PASSED' ? 'released' : 'rejected';
  if (row.lp_id) {
    const lpBefore = await ctx.client.query<{ id: string; status: string; qa_status: string }>(
      `select id::text, status, qa_status
         from public.license_plates
        where org_id = app.current_org_id()
          and id = $1::uuid
        for update`,
      [row.lp_id],
    );
    const lp = lpBefore.rows[0];
    if (lp) {
      let shouldUpdateLpQa = true;
      if (lpQaStatus === 'released') {
        try {
          await assertNoActiveHoldForLp(row.lp_id, ctx.client);
        } catch (error) {
          if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'QA_HOLD_ACTIVE') {
            shouldUpdateLpQa = false;
            lpQaStatus = lp.qa_status === 'rejected' ? 'rejected' : null;
          } else {
            throw error;
          }
        }
      }

      if (shouldUpdateLpQa) {
        const lpUpdated = await ctx.client.query<{ status: string }>(
          `update public.license_plates
              set qa_status = $2,
                  status = case
                    when $2 = 'released' and status = 'received' then 'available'
                    when $2 = 'rejected' and status = 'received' then 'blocked'
                    else status
                  end,
                  updated_by = $3::uuid
            where org_id = app.current_org_id()
              and id = $1::uuid
          returning status`,
          [row.lp_id, lpQaStatus, ctx.userId],
        );
        const lpStatusTo = lpUpdated.rows[0]?.status ?? lp.status;
        await ctx.client.query(
          `insert into public.lp_state_history
             (org_id, lp_id, from_state, to_state, reason_code, reason_text, transaction_id, ext_jsonb, created_by)
           values
             (
               app.current_org_id(),
               $1::uuid,
               $2,
               $3,
               'production_output_qa_changed',
               $5,
               gen_random_uuid(),
               $4::jsonb,
               $6::uuid
             )`,
          [
            row.lp_id,
            lp.status,
            lpStatusTo,
            JSON.stringify({
              outputId: input.outputId,
              outputQaStatusFrom: output.qa_status,
              outputQaStatusTo: input.decision,
              qaStatusFrom: lp.qa_status,
              qaStatusTo: lpQaStatus,
            }),
            input.note ?? null,
            ctx.userId,
          ],
        );
      }
    }
  }

  return {
    ok: true,
    data: {
      outputId: row.id,
      qaStatus: row.qa_status,
      lpId: row.lp_id,
      lpQaStatus: row.lp_id ? lpQaStatus : null,
    },
  };
}
