import { z } from 'zod';

import { cancelWo } from '../../../../../../../../lib/production/complete-cancel-wo';
import { runTransition } from '../_actions/route-helpers';

const CancelBody = z.object({
  transactionId: z.string().uuid(),
  reasonCode: z.string().min(1).max(64),
  notes: z.string().max(2000).optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return runTransition(request, CancelBody, (ctx, input) => cancelWo(ctx, { woId: id, ...input }));
}
