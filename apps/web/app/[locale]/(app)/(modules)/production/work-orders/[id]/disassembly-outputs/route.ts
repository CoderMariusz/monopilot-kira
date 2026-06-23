/**
 * E7 — POST /:locale/.../production/work-orders/:id/disassembly-outputs
 *
 * Executes a DISASSEMBLY work order: one input license plate (a carcass/primal)
 * is broken down into N co-product OUTPUTS, each written as its own wo_outputs row
 * + derived output LP with input genealogy, and the input cost is allocated across
 * the outputs per the BOM's allocation_pct (registerDisassemblyOutput owns all of
 * this in one txn).
 *
 * Mirrors the forward Register-output route (../outputs/route.ts):
 *   withOrgContext (RLS + org scope) → registerDisassemblyOutput service → many
 *   wo_outputs / license_plates / lp_genealogy / cost-ledger rows +
 *   production.output.recorded outbox events, all in the single transaction.
 *
 * RBAC: the service re-checks production.output.write server-side (the client is
 * never trusted). bom_type='disassembly' is re-validated against the WO's active
 * BOM inside the service — a forward WO ⇒ { ok:false, error:'not-disassembly' }.
 *
 * Response: the service returns a result union (no thrown typed errors), so this
 * handler maps it to an HTTP status: ok → 200 { data }, the permission error →
 * 403, validation/shape errors → 422, everything else → 409.
 */
import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  type OrgContextLike,
  type QueryClient,
} from '../../../../../../../../lib/production/shared';
import { registerDisassemblyOutput } from '../../../../../../../../lib/production/output/register-disassembly-output';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Map the service result error → HTTP status (the body always carries `error`). */
function statusForError(error: string): number {
  if (error === 'forbidden') return 403;
  if (error === 'invalid-input') return 422;
  if (error === 'not-found') return 404;
  // not-disassembly / co-product-mismatch / input-cost-* / cost-allocation-invalid
  // are state/precondition failures on an otherwise well-formed request.
  if (
    error === 'persistence-failed' ||
    error === 'warehouse-not-configured' ||
    error.startsWith('cost-ledger-')
  ) {
    return 500;
  }
  return 409;
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
    return json({ error: 'invalid-input' }, 422);
  }

  // The service owns the full zod validation; the route only forces the woId from
  // the path (never trusting a body-supplied woId for the org-scoped write).
  const payload =
    body && typeof body === 'object' ? { ...(body as Record<string, unknown>), woId } : { woId };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<Response> => {
      const orgCtx: OrgContextLike = { userId, orgId, client: client as unknown as QueryClient };
      const result = await registerDisassemblyOutput(orgCtx, payload as never);
      if (result.ok) {
        return json({ data: result }, 200);
      }
      return json({ error: result.error }, statusForError(result.error));
    });
  } catch (err) {
    console.error('[production/disassembly-outputs] POST persistence_failed', {
      woId,
      err: err instanceof Error ? err.message : String(err),
    });
    return json({ error: 'persistence-failed' }, 500);
  }
}
