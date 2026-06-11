'use server';

/**
 * QA release for production-owned `wo_outputs`.
 *
 * Permission note: `wo_outputs` is owned by 08-production, but the existing RBAC
 * enum has no production-side batch QA release write permission. The closest
 * already-seeded write gate is `quality.batch.release` (migration 198), so this
 * action uses it while keeping the data mutation in the production module.
 */
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  type ProductionContext,
  type QueryClient,
} from '../../../../../../lib/production/shared';

export type ReleaseWoOutputQaDecision = 'PASSED' | 'FAILED';
export type ReleaseWoOutputQaInput = {
  outputId: string;
  decision: ReleaseWoOutputQaDecision;
  note?: string;
};
export type ReleaseWoOutputQaResult = {
  outputId: string;
  qaStatus: ReleaseWoOutputQaDecision;
  lpId: string | null;
  lpQaStatus: 'released' | 'rejected' | null;
};

export type OutputQaActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'forbidden' | 'not_found' | 'error'; message?: string };

const QUALITY_BATCH_RELEASE_PERMISSION = 'quality.batch.release';

function asTrimmed(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isDecision(value: string | null): value is ReleaseWoOutputQaDecision {
  return value === 'PASSED' || value === 'FAILED';
}

export async function releaseWoOutputQa(
  input: ReleaseWoOutputQaInput,
): Promise<OutputQaActionResult<ReleaseWoOutputQaResult>> {
  const outputId = asTrimmed(input?.outputId);
  const decision = asTrimmed(input?.decision);
  const note = asTrimmed(input?.note);
  if (!outputId || !isUuid(outputId) || !isDecision(decision)) {
    return { ok: false, reason: 'error', message: 'invalid_input' };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<OutputQaActionResult<ReleaseWoOutputQaResult>> => {
      const ctx: ProductionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, QUALITY_BATCH_RELEASE_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

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
        [outputId],
      );
      const output = before.rows[0];
      if (!output) return { ok: false, reason: 'not_found' };
      if (output.qa_status === 'ON_HOLD') {
        return { ok: false, reason: 'error', message: 'on_hold_requires_holds_flow' };
      }
      if (output.qa_status !== 'PENDING') {
        return { ok: false, reason: 'error', message: 'invalid_state' };
      }

      const updated = await ctx.client.query<{ id: string; qa_status: ReleaseWoOutputQaDecision; lp_id: string | null }>(
        `update public.wo_outputs
            set qa_status = $2
          where org_id = app.current_org_id()
            and id = $1::uuid
            and qa_status = 'PENDING'
        returning id::text, qa_status, lp_id::text`,
        [outputId, decision],
      );
      const row = updated.rows[0];
      if (!row) return { ok: false, reason: 'error', message: 'invalid_state' };

      const lpQaStatus = decision === 'PASSED' ? 'released' : 'rejected';
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
          await ctx.client.query(
            `update public.license_plates
                set qa_status = $2,
                    updated_by = $3::uuid
              where org_id = app.current_org_id()
                and id = $1::uuid`,
            [row.lp_id, lpQaStatus, userId],
          );
          await ctx.client.query(
            `insert into public.lp_state_history
               (org_id, lp_id, from_state, to_state, reason_code, reason_text, transaction_id, ext_jsonb, created_by)
             values
               (
                 app.current_org_id(),
                 $1::uuid,
                 $2,
                 $2,
                 'production_output_qa_changed',
                 $3,
                 gen_random_uuid(),
                 $4::jsonb,
                 $5::uuid
               )`,
            [
              row.lp_id,
              lp.status,
              note,
              JSON.stringify({
                outputId,
                outputQaStatusFrom: output.qa_status,
                outputQaStatusTo: decision,
                qaStatusFrom: lp.qa_status,
                qaStatusTo: lpQaStatus,
              }),
              userId,
            ],
          );
        }
      }

      return { ok: true, data: { outputId: row.id, qaStatus: row.qa_status, lpId: row.lp_id, lpQaStatus: row.lp_id ? lpQaStatus : null } };
    });
  } catch (error) {
    console.error('[production] releaseWoOutputQa failed', error);
    return { ok: false, reason: 'error' };
  }
}
