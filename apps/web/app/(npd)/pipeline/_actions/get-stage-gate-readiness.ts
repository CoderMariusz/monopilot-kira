'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { fetchStageGateReadinessByProjectId } from './_lib/fetch-stage-gate-readiness';
import { hasPermission, PROJECT_VIEW_PERMISSION, type OrgContextLike } from './shared';
import type { GetStageGateReadinessResult } from './get-stage-gate-readiness.types';

const inputSchema = z.object({
  projectId: z.string().uuid(),
  gateLabels: z.record(z.string()).optional(),
  stageLabels: z.record(z.string()).optional(),
  purpose: z.enum(['advance', 'formal_approve']).optional(),
});

export async function getStageGateReadiness(raw: unknown): Promise<GetStageGateReadinessResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      if (!(await hasPermission(ctx, PROJECT_VIEW_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const bundle = await fetchStageGateReadinessByProjectId(parsed.data.projectId, {
        gateLabels: parsed.data.gateLabels,
        stageLabels: parsed.data.stageLabels,
        purpose: parsed.data.purpose,
      });
      if (!bundle) {
        return { ok: false, error: 'terminal' };
      }
      return { ok: true, data: bundle };
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'NOT_FOUND') {
      return { ok: false, error: 'not_found' };
    }
    console.error('[getStageGateReadiness] failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
