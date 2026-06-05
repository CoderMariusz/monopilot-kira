/**
 * POST /:locale/.../production/work-orders/:id/waste
 *
 * Records a categorized waste row into wo_waste_log and emits
 * production.waste.recorded (feeds the yield gate, finance loss, reporting).
 *
 * withOrgContext (RLS + org scope) → recordWaste service → wo_waste_log INSERT +
 * outbox event in one transaction. The quality consume gate (holdsGuard) runs
 * FIRST; an active hold ⇒ 409 + production.consume.blocked.
 */
import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  ProductionActionError,
  QualityHoldError,
  emitConsumeBlocked,
  type OrgContextLike,
  type QueryClient,
} from '../../../../../../../../lib/production/shared';
import { recordWaste } from '../../../../../../../../lib/production/waste/record-waste';

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
      const orgCtx: OrgContextLike = { userId, orgId, client: client as unknown as QueryClient };
      const result = await recordWaste(orgCtx, woId, body);
      return json({ data: result }, 200);
    });
  } catch (err) {
    if (err instanceof QualityHoldError) {
      try {
        await withOrgContext(async ({ userId, orgId, client }) => {
          await emitConsumeBlocked(
            { userId, orgId, client: client as unknown as QueryClient },
            err,
          );
        });
      } catch (emitErr) {
        console.error('[production/waste] consume_blocked_emit_failed', {
          woId,
          err: emitErr instanceof Error ? emitErr.message : String(emitErr),
        });
      }
      return json({ error: err.code, ...(err.details ?? {}) }, err.status);
    }
    if (err instanceof ProductionActionError) {
      return json({ error: err.code, ...(err.details ?? {}) }, err.status);
    }
    console.error('[production/waste] POST persistence_failed', {
      woId,
      err: err instanceof Error ? err.message : String(err),
    });
    return json({ error: 'persistence_failed' }, 500);
  }
}
