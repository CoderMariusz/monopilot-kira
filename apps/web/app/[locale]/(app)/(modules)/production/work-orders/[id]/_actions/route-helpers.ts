/**
 * 08-Production E1 — route-handler glue for the WO-lifecycle services.
 *
 * NOT a `'use server'` module (it exports helpers + types). Each transition
 * route handler:
 *   1. validates the request body with zod (→ 422 invalid_input),
 *   2. opens `withOrgContext(...)` (the only place a DB txn opens),
 *   3. calls the matching service with the txn-bound ctx,
 *   4. maps the ProductionResult discriminated union to a NextResponse with the
 *      service's canonical HTTP status.
 *
 * The service owns RBAC, the state machine, outbox-in-txn, and e-sign. The route
 * is a thin transport adapter — no business logic leaks here.
 */

import { NextResponse } from 'next/server';
import type { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  QualityHoldError,
  WoConcurrentModificationError,
  emitConsumeBlocked,
  type OrgContextLike,
  type ProductionContext,
  type ProductionResult,
  type QueryClient,
} from '../../../../../../../../lib/production/shared';

/** Map a ProductionResult to a NextResponse using the service's status. */
export function toResponse<T>(result: ProductionResult<T>): NextResponse {
  if (result.ok) {
    return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
  }
  return NextResponse.json(
    { ok: false, error: result.error, message: result.message, details: result.details },
    { status: result.status },
  );
}

/**
 * Parse + validate the JSON body, run the service inside withOrgContext, and
 * return the mapped NextResponse. On a malformed body → 422 invalid_input.
 */
export async function runTransition<TSchema extends z.ZodTypeAny, TData>(
  request: Request,
  schema: TSchema,
  service: (ctx: ProductionContext, input: z.infer<TSchema>) => Promise<ProductionResult<TData>>,
): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input', message: 'malformed JSON body' }, { status: 422 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_input', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const result = await withOrgContext((ctx) => service(ctx, parsed.data));
    return toResponse(result);
  } catch (err) {
    // Active quality hold on completion (T-064): the mutating txn rolled back;
    // emit production.consume.blocked on a FRESH committed txn, then surface 409
    // (same blocked-audit semantics as the output/waste routes).
    if (err instanceof QualityHoldError) {
      try {
        await withOrgContext(async ({ userId, orgId, client }) => {
          const blockedCtx: OrgContextLike = {
            userId,
            orgId,
            client: client as unknown as QueryClient,
          };
          await emitConsumeBlocked(blockedCtx, err);
        });
      } catch (emitErr) {
        console.error('[production/transition] consume_blocked_emit_failed', {
          err: emitErr instanceof Error ? emitErr.message : String(emitErr),
        });
      }
      return NextResponse.json(
        { ok: false, error: err.code, details: { holdId: err.hold.holdId, lpId: err.lpId } },
        { status: err.status },
      );
    }
    // Optimistic-lock CAS miss: the state machine THREW so the txn (incl. the
    // appended wo_events row) rolled back. Surface 409 concurrent_modification.
    if (err instanceof WoConcurrentModificationError) {
      return NextResponse.json(
        { ok: false, error: err.error, details: { expectedVersion: err.expectedVersion } },
        { status: err.status },
      );
    }
    // withOrgContext throws on auth/lookup failure (treat as 401/403 surface) or
    // an unexpected DB error (the txn already rolled back).
    const message = err instanceof Error ? err.message : String(err);
    const isAuth = /JWT|org_id|users row|verification/i.test(message);
    return NextResponse.json(
      { ok: false, error: isAuth ? 'forbidden' : 'persistence_failed', message },
      { status: isAuth ? 403 : 500 },
    );
  }
}
