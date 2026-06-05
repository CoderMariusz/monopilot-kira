import { z } from 'zod';

import { closeWo } from '../../../../../../../../lib/production/close-wo';
import { runTransition } from '../_actions/route-helpers';

const CloseBody = z.object({
  transactionId: z.string().uuid(),
  signerUserId: z.string().uuid(),
  pin: z.string().min(1).max(64),
  reason: z.string().min(1).max(2000),
  nonce: z.string().min(1).max(128).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return runTransition(request, CloseBody, (ctx, input) => closeWo(ctx, { woId: id, ...input }));
}
