'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { holdsGuard } from '../../../../../../lib/production/holds-guard';
import { applyLpQaLifecycleTransition } from '../../../../../../lib/warehouse/lp-qa-transition-core';
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

const QUALITY_BATCH_RELEASE_PERMISSION = 'quality.batch.release';
const TERMINAL_LP_STATUSES = ['consumed', 'destroyed', 'shipped', 'merged', 'returned'] as const;

function isDecision(value: string | null): value is ReleaseLpQaDecision {
  return value === 'released' || value === 'rejected';
}

export async function releaseLpQaForContext(
  ctx: WarehouseContext,
  input: ReleaseLpQaInput,
  options: { requirePermission?: boolean } = {},
): Promise<WarehouseResult<ReleaseLpQaResult>> {
  const lpId = asTrimmed(input?.lpId);
  const decision = asTrimmed(input?.decision);
  const note = asTrimmed(input?.note);
  if (!lpId || !isDecision(decision)) return { ok: false, reason: 'error', message: 'invalid_input' };

  if (options.requirePermission !== false && !(await hasWarehousePermission(ctx, QUALITY_BATCH_RELEASE_PERMISSION))) {
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

  if (decision === 'released') {
    const hold = await holdsGuard(ctx, { lpId });
    if (hold) return { ok: false, reason: 'error', message: 'quality_hold_active' };
  }

  const txId = uuidFromSeed(`warehouse.lp.qa.release:${ctx.orgId}:${lpId}:${lp.qa_status}:${decision}`);
  const row = await applyLpQaLifecycleTransition(
    { client: ctx.client, userId: ctx.userId, orgId: ctx.orgId },
    {
      lpId,
      lpBefore: { id: lp.id, lp_number: lp.lp_number, status: lp.status, qa_status: lp.qa_status },
      decision,
      note,
      mode: 'pending_only',
      transactionId: txId,
    },
  );
  if (!row) return { ok: false, reason: 'error', message: 'invalid_state' };

  return {
    ok: true,
    data: { lpId: row.id, lpNumber: row.lp_number, status: row.status, qaStatus: row.qa_status as ReleaseLpQaDecision },
  };
}

export async function releaseLpQa(input: ReleaseLpQaInput): Promise<WarehouseResult<ReleaseLpQaResult>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<ReleaseLpQaResult>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      return releaseLpQaForContext(ctx, input);
    });
  } catch (error) {
    console.error('[warehouse] releaseLpQa failed', error);
    return { ok: false, reason: 'error' };
  }
}
