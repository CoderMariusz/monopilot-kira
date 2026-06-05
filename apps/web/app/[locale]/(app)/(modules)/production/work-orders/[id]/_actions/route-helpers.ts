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
import type { ProductionContext, ProductionResult } from '../../../../../../../../lib/production/shared';

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
