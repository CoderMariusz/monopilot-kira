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

function isQaHoldActiveError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'QA_HOLD_ACTIVE'
  );
}

/**
 * Snapshot current wo_outputs QA states for a WO and transition them to ON_HOLD.
 * Quality hold create flows call this instead of writing wo_outputs directly.
 */
export async function applyWoOutputHoldForContext(
  ctx: ProductionContext,
  woId: string,
): Promise<Record<string, string>> {
  const outputs = await ctx.client.query<{ id: string; qa_status: string }>(
    `select id::text, qa_status
       from public.wo_outputs
      where org_id = app.current_org_id()
        and wo_id = $1::uuid
      for update`,
    [woId],
  );
  const qaSnapshots = Object.fromEntries(outputs.rows.map((row) => [row.id, row.qa_status]));
  await ctx.client.query(
    `update public.wo_outputs
        set qa_status = 'ON_HOLD',
            updated_by = $2::uuid
      where org_id = app.current_org_id()
        and wo_id = $1::uuid`,
    [woId, ctx.userId],
  );
  return qaSnapshots;
}

/**
 * Restore wo_outputs QA states after the last active WO hold is released.
 * W3 snapshot/restore semantics are identical to the prior Quality-owned SQL.
 */
export async function restoreWoOutputsAfterWoHoldReleaseForContext(
  ctx: ProductionContext,
  params: { woId: string; snapshots: Record<string, string> },
): Promise<void> {
  for (const [outputId, priorQaStatus] of Object.entries(params.snapshots)) {
    await ctx.client.query(
      `update public.wo_outputs
          set qa_status = $3,
              updated_by = $2::uuid
        where org_id = app.current_org_id()
          and id = $1::uuid
          and wo_id = $4::uuid
          and qa_status = 'ON_HOLD'`,
      [outputId, ctx.userId, priorQaStatus, params.woId],
    );
  }
  await ctx.client.query(
    `update public.wo_outputs
        set qa_status = 'PENDING',
            updated_by = $2::uuid
      where org_id = app.current_org_id()
        and wo_id = $1::uuid
        and qa_status = 'ON_HOLD'`,
    [params.woId, ctx.userId],
  );
}

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

  if (output.lp_id && input.decision === 'PASSED') {
    try {
      await assertNoActiveHoldForLp(output.lp_id, ctx.client);
    } catch (error) {
      if (isQaHoldActiveError(error)) {
        return { ok: false, reason: 'quality_hold_active' };
      }
      throw error;
    }
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
