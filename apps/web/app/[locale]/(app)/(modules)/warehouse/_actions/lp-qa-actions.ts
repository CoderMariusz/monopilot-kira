'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  asTrimmed,
  hasWarehousePermission,
  uuidFromSeed,
  type QueryClient,
  type WarehouseContext,
  type WarehouseResult,
} from './shared';

export type ReleaseLpQaDecision = 'released' | 'rejected';
export type ReleaseLpQaInput = { lpId: string; decision: ReleaseLpQaDecision; note?: string };
export type ReleaseLpQaResult = {
  lpId: string;
  lpNumber: string;
  status: string;
  qaStatus: ReleaseLpQaDecision;
};

const WAREHOUSE_GRN_RECEIVE_PERMISSION = 'warehouse.grn.receive';
const TERMINAL_LP_STATUSES = ['consumed', 'destroyed', 'shipped', 'merged', 'returned'] as const;

function isDecision(value: string | null): value is ReleaseLpQaDecision {
  return value === 'released' || value === 'rejected';
}

export async function releaseLpQa(input: ReleaseLpQaInput): Promise<WarehouseResult<ReleaseLpQaResult>> {
  const lpId = asTrimmed(input?.lpId);
  const decision = asTrimmed(input?.decision);
  const note = asTrimmed(input?.note);
  if (!lpId || !isDecision(decision)) return { ok: false, reason: 'error', message: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<ReleaseLpQaResult>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_GRN_RECEIVE_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const before = await ctx.client.query<{
        id: string;
        lp_number: string;
        status: string;
        qa_status: string;
      }>(
        `select id::text, lp_number, status, qa_status
           from public.license_plates
          where org_id = app.current_org_id()
            and id = $1::uuid
          for update`,
        [lpId],
      );
      const lp = before.rows[0];
      if (!lp) return { ok: false, reason: 'not_found' };
      if ((TERMINAL_LP_STATUSES as readonly string[]).includes(lp.status)) {
        return { ok: false, reason: 'error', message: 'terminal_lp_status' };
      }
      if (lp.qa_status !== 'pending') {
        return { ok: false, reason: 'error', message: 'invalid_state' };
      }

      const updated = await ctx.client.query<{
        id: string;
        lp_number: string;
        status: string;
        qa_status: ReleaseLpQaDecision;
      }>(
        `update public.license_plates
            set qa_status = $2,
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and qa_status = 'pending'
        returning id::text, lp_number, status, qa_status`,
        [lpId, decision, userId],
      );
      const row = updated.rows[0];
      if (!row) return { ok: false, reason: 'error', message: 'invalid_state' };

      const txId = uuidFromSeed(`warehouse.lp.qa.release:${orgId}:${lpId}:${lp.qa_status}:${decision}`);
      await ctx.client.query(
        `insert into public.lp_state_history
           (org_id, lp_id, from_state, to_state, reason_code, reason_text, transaction_id, ext_jsonb, created_by)
         values
           (
             app.current_org_id(),
             $1::uuid,
             $2,
             $2,
             'qa_status_changed',
             $3,
             $4::uuid,
             $5::jsonb,
             $6::uuid
           )
         on conflict (org_id, transaction_id) do nothing`,
        [
          lpId,
          lp.status,
          note,
          txId,
          JSON.stringify({ qaStatusFrom: lp.qa_status, qaStatusTo: decision }),
          userId,
        ],
      );

      await ctx.client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values
           (app.current_org_id(), 'warehouse.lp.transitioned', 'license_plate', $1::uuid, $2::jsonb, 'warehouse-qa-release-v1')`,
        [
          lpId,
          JSON.stringify({
            org_id: orgId,
            actor_user_id: userId,
            lp_id: lpId,
            lp_number: lp.lp_number,
            status_from: lp.status,
            status_to: lp.status,
            qa_status_from: lp.qa_status,
            qa_status_to: decision,
            note,
          }),
        ],
      );

      return {
        ok: true,
        data: { lpId: row.id, lpNumber: row.lp_number, status: row.status, qaStatus: row.qa_status },
      };
    });
  } catch (error) {
    console.error('[warehouse] releaseLpQa failed', error);
    return { ok: false, reason: 'error' };
  }
}
