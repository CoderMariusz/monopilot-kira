import { z } from 'zod';

import { completeWo } from '../../../../../../../../lib/production/complete-cancel-wo';
import { runTransition } from '../_actions/route-helpers';

const CompleteBody = z.object({
  transactionId: z.string().uuid(),
  overrideReasonCode: z.string().min(1).max(64).optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return runTransition(request, CompleteBody, (ctx, input) => completeWo(ctx, { woId: id, ...input }));
}
