import { z } from 'zod';

import { resumeWo } from '../../../../../../../../lib/production/pause-resume-wo';
import { runTransition } from '../_actions/route-helpers';

const ResumeBody = z.object({
  transactionId: z.string().uuid(),
  actualDurationMin: z.number().int().positive().optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return runTransition(request, ResumeBody, (ctx, input) => resumeWo(ctx, { woId: id, ...input }));
}
