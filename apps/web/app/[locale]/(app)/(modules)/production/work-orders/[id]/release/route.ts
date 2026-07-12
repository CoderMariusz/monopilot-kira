import { NextResponse } from 'next/server';

import { releaseWorkOrder } from '../../../../planning/work-orders/_actions/releaseWorkOrder';
import { ERROR_STATUS as PRODUCTION_ERROR_STATUS } from '../../../../../../../../lib/production/shared';

const ERROR_STATUS: Record<string, number> = PRODUCTION_ERROR_STATUS;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const result = await releaseWorkOrder({ id });

  if (result.ok) {
    return NextResponse.json({ ok: true, data: result.workOrder }, { status: 200 });
  }

  const status = ERROR_STATUS[result.error] ?? 500;
  const details =
    'missing' in result ? { missing: result.missing } :
    'details' in result ? { details: result.details } :
    undefined;
  const message = 'message' in result ? result.message : undefined;
  return NextResponse.json(
    { ok: false, error: result.error, message, details },
    { status },
  );
}
