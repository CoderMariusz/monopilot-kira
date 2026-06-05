import { NextResponse } from 'next/server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { getWoRuntimeState } from '../../../../../../../lib/production/get-wo-runtime-state';
import { toResponse } from './_actions/route-helpers';

/** GET WO detail / runtime state (T-016 + T-021). Read-only, RLS-scoped. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const result = await withOrgContext((ctx) => getWoRuntimeState(ctx, id));
    return toResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isAuth = /JWT|org_id|users row|verification/i.test(message);
    return NextResponse.json(
      { ok: false, error: isAuth ? 'forbidden' : 'persistence_failed', message },
      { status: isAuth ? 403 : 500 },
    );
  }
}
