import { z } from 'zod';

import { pauseWo } from '../../../../../../../../lib/production/pause-resume-wo';
import { runTransition } from '../_actions/route-helpers';

const PauseBody = z.object({
  transactionId: z.string().uuid(),
  reasonCategoryId: z.string().uuid(),
  lineId: z.string().min(1).max(64),
  shiftId: z.string().min(1).max(64).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return runTransition(request, PauseBody, (ctx, input) => pauseWo(ctx, { woId: id, ...input }));
}
