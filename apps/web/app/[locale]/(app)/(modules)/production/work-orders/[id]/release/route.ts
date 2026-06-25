import { NextResponse } from 'next/server';

import { releaseWorkOrder } from '../../../../planning/work-orders/_actions/releaseWorkOrder';

const ERROR_STATUS: Record<string, number> = {
  invalid_input: 422,
  forbidden: 403,
  not_found: 404,
  invalid_state: 409,
  factory_release_incomplete: 409,
  persistence_failed: 500,
};

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
  const details = 'missing' in result ? { missing: result.missing } : undefined;
  return NextResponse.json(
    { ok: false, error: result.error, details },
    { status },
  );
}
