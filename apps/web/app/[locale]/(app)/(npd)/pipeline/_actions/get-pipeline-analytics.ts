'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  PROJECT_VIEW_PERMISSION,
  hasPermission,
  type OrgContextLike,
  type ProjectGate,
} from '../../../../../(npd)/pipeline/_actions/shared';

export async function getPipelineAnalytics(): Promise<{
  ok: boolean;
  data?: { funnel: { stage: string; gate: string | null; count: number; conversionPct: number | null }[] };
  error?: 'FORBIDDEN' | 'PERSISTENCE_FAILED';
}> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      if (!(await hasPermission(ctx, PROJECT_VIEW_PERMISSION))) {
        return { ok: false, error: 'FORBIDDEN' };
      }

      const { rows } = await ctx.client.query<{
        current_stage: string | null;
        current_gate: ProjectGate | null;
        count: string | number;
      }>(
        `select p.current_stage,
                p.current_gate,
                count(*)::text as count
           from public.npd_projects p
          where p.org_id = app.current_org_id()
          group by p.current_stage, p.current_gate`,
      );

      const stageOrder = new Map(
        ['brief', 'recipe', 'packaging', 'trial', 'sensory', 'pilot', 'approval', 'handoff', 'launched'].map(
          (stage, index) => [stage, index],
        ),
      );

      const funnel = rows
        .map((row) => ({
          stage: row.current_stage ?? 'unknown',
          gate: row.current_gate,
          count: Number(row.count),
          conversionPct: null as number | null,
        }))
        .sort((a, b) => {
          const aOrder = stageOrder.get(a.stage);
          const bOrder = stageOrder.get(b.stage);
          if (aOrder != null && bOrder != null) return aOrder - bOrder || (a.gate ?? '').localeCompare(b.gate ?? '');
          if (aOrder != null) return -1;
          if (bOrder != null) return 1;
          return b.count - a.count || a.stage.localeCompare(b.stage);
        })
        .map((row, index, ordered) => {
          if (index === 0) return row;
          const previous = ordered[index - 1]?.count ?? 0;
          return {
            ...row,
            conversionPct: previous > 0 ? Math.round((row.count / previous) * 1000) / 10 : null,
          };
        });

      return { ok: true, data: { funnel } };
    });
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }
}
