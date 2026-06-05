import { z } from 'zod';

import { startWo } from '../../../../../../../../lib/production/start-wo';
import { runTransition } from '../_actions/route-helpers';

const StartBody = z.object({
  transactionId: z.string().uuid(),
  lineId: z.string().min(1).max(64).optional().nullable(),
  shiftId: z.string().min(1).max(64).optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return runTransition(request, StartBody, (ctx, input) => startWo(ctx, { woId: id, ...input }));
}
