import { randomUUID } from 'node:crypto';

import type { QueryClient } from '../scanner/db';

export type LpQaLifecycleDecision = 'released' | 'rejected' | 'on_hold';

export type LpBeforeQaTransition = {
  id: string;
  lp_number: string;
  status: string;
  qa_status: string;
};

const SCANNER_TERMINAL_LP_STATUSES = ['consumed', 'merged', 'shipped', 'returned'] as const;

/**
 * Atomically flips LP qa_status and, for released/rejected on received stock,
 * promotes lifecycle status (received→available / received→blocked) with ledger
 * + outbox — same rules as warehouse releaseLpQaForContext (audit F-A01).
 */
export async function applyLpQaLifecycleTransition(
  ctx: { client: QueryClient; userId: string; orgId: string },
  input: {
    lpId: string;
    lpBefore: LpBeforeQaTransition;
    decision: LpQaLifecycleDecision;
    note?: string | null;
    /** Desktop QA release requires pending qa_status; scanner allows any non-terminal LP. */
    mode: 'pending_only' | 'scanner';
    emitOutbox?: boolean;
    transactionId?: string;
  },
): Promise<{ id: string; lp_number: string; status: string; qa_status: string } | null> {
  const params: unknown[] =
    input.mode === 'pending_only'
      ? [input.lpId, input.decision, ctx.userId]
      : [input.lpId, input.decision, ctx.userId, [...SCANNER_TERMINAL_LP_STATUSES]];

  const { rows } = await ctx.client.query<{
    id: string;
    lp_number: string;
    status: string;
    qa_status: string;
  }>(
    input.mode === 'pending_only'
      ? `update public.license_plates
            set qa_status = $2,
                status = case
                  when $2 = 'released' and status = 'received' then 'available'
                  when $2 = 'rejected' and status = 'received' then 'blocked'
                  else status
                end,
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and qa_status = 'pending'
        returning id::text, lp_number, status, qa_status`
      : `update public.license_plates
            set qa_status = $2,
                status = case
                  when $2 = 'released' and status = 'received' then 'available'
                  when $2 = 'rejected' and status = 'received' then 'blocked'
                  else status
                end,
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and app.user_can_see_site(site_id)
            and status <> all($4::text[])
        returning id::text, lp_number, status, qa_status`,
    params,
  );
  const row = rows[0];
  if (!row) return null;

  const statusChanged = row.status !== input.lpBefore.status;
  const shouldWriteHistory = input.mode === 'pending_only' || statusChanged;
  if (shouldWriteHistory) {
    const txId = input.transactionId ?? randomUUID();
    await ctx.client.query(
      `insert into public.lp_state_history
         (org_id, lp_id, from_state, to_state, reason_code, reason_text, transaction_id, ext_jsonb, created_by)
       values
         (app.current_org_id(), $1::uuid, $2, $3, 'qa_status_changed', $4, $5::uuid, $6::jsonb, $7::uuid)
       on conflict (org_id, transaction_id) do nothing`,
      [
        input.lpId,
        input.lpBefore.status,
        row.status,
        input.note ?? null,
        txId,
        JSON.stringify({ qaStatusFrom: input.lpBefore.qa_status, qaStatusTo: input.decision }),
        ctx.userId,
      ],
    );
  }

  if (input.emitOutbox !== false && (input.decision === 'released' || input.decision === 'rejected')) {
    await ctx.client.query(
      `insert into public.outbox_events
         (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
       values
         (app.current_org_id(), 'warehouse.lp.transitioned', 'license_plate', $1::uuid, $2::jsonb, 'warehouse-qa-release-v1')`,
      [
        input.lpId,
        JSON.stringify({
          org_id: ctx.orgId,
          actor_user_id: ctx.userId,
          lp_id: input.lpId,
          lp_number: input.lpBefore.lp_number,
          status_from: input.lpBefore.status,
          status_to: row.status,
          qa_status_from: input.lpBefore.qa_status,
          qa_status_to: input.decision,
          note: input.note ?? null,
        }),
      ],
    );
  }

  return row;
}
