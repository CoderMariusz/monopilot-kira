import { z } from 'zod';

import { completeWo } from '../../../../../../../../lib/production/complete-cancel-wo';
import { runTransition } from '../_actions/route-helpers';

const CompleteBody = z.object({
  transactionId: z.string().uuid(),
  // Loose at the route — taxonomy + permission are enforced in completeWo only when
  // the yield gate is not green (stray free-text on a green completion is ignored).
  overrideReasonCode: z.string().max(64).optional().nullable(),
  overrideSignerUserId: z.string().uuid().optional(),
  overridePin: z.string().min(1).max(64).optional(),
  overrideEsignReason: z.string().min(1).max(2000).optional(),
  overrideNonce: z.string().min(1).max(128).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return runTransition(request, CompleteBody, (ctx, input) => completeWo(ctx, { woId: id, ...input }));
}
