/**
 * T-028 / T-032 — POST /:locale/.../production/work-orders/:id/outputs
 *
 * Registers a primary / co_product / by_product output into the canonical
 * wo_outputs table (08-production owns this — NOT 04-planning). Catch-weight
 * details (T-032) are captured when the item's weight_mode='catch'.
 *
 * withOrgContext (RLS + org scope) → registerOutput service → wo_outputs INSERT
 * + production.output.recorded outbox event, all in one transaction. The quality
 * consume gate (holdsGuard) runs FIRST; an active hold ⇒ 409 +
 * production.consume.blocked.
 *
 * Red lines (MON-domain-production): no duplicate wo_outputs table, no direct
 * wo_executions.status write (read-only seam), no inline D365 calls, outbox INSERT
 * inside the state-change txn.
 */
import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { getActiveSiteId } from '../../../../../../../../lib/site/site-context';
import {
  ProductionActionError,
  QualityHoldError,
  emitConsumeBlocked,
  type OrgContextLike,
  type QueryClient,
} from '../../../../../../../../lib/production/shared';
import { registerOutput } from '../../../../../../../../lib/production/output/register-output';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: woId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_input' }, 422);
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<Response> => {
      const siteId = await getActiveSiteId();
      const orgCtx: OrgContextLike = { userId, orgId, siteId, client: client as unknown as QueryClient };
      const result = await registerOutput(orgCtx, woId, body);
      return json({ data: result }, 200);
    });
  } catch (err) {
    // Active quality hold: the mutating txn rolled back; emit the blocked audit
    // event on a fresh committed txn, then surface 409.
    if (err instanceof QualityHoldError) {
      try {
        await withOrgContext(async ({ userId, orgId, client }) => {
          await emitConsumeBlocked(
            { userId, orgId, client: client as unknown as QueryClient },
            err,
          );
        });
      } catch (emitErr) {
        console.error('[production/outputs] consume_blocked_emit_failed', {
          woId,
          err: emitErr instanceof Error ? emitErr.message : String(emitErr),
        });
      }
      return json({ error: err.code, ...(err.details ?? {}) }, err.status);
    }
    if (err instanceof ProductionActionError) {
      return json({ error: err.code, ...(err.details ?? {}) }, err.status);
    }
    console.error('[production/outputs] POST persistence_failed', {
      woId,
      err: err instanceof Error ? err.message : String(err),
    });
    return json({ error: 'persistence_failed' }, 500);
  }
}
