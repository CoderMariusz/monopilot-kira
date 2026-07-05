'use server';

import { z } from 'zod';

import { hasPermission } from '../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../lib/i18n/revalidate-localized';

const PRODUCTION_WRITE_PERMISSION = 'npd.production.write';

const inputSchema = z.object({
  projectId: z.string().uuid(),
  productionLineId: z.string().uuid().nullable(),
});

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

export type SetProductionLineInput = z.input<typeof inputSchema>;
export type { SetProductionLineResult } from './set-production-line-types';
import type { SetProductionLineResult } from './set-production-line-types';

export async function setProductionLine(input: SetProductionLineInput): Promise<SetProductionLineResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid production line input' };
  }

  return withOrgContext<SetProductionLineResult>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;

    if (!(await hasPermission(ctx, PRODUCTION_WRITE_PERMISSION))) {
      return {
        ok: false,
        error: `${PRODUCTION_WRITE_PERMISSION} is required to set the production line`,
      };
    }

    const { projectId, productionLineId } = parsed.data;

    if (productionLineId) {
      const lineCheck = await ctx.client.query<{ id: string }>(
        `select id::text as id
           from public.production_lines
          where id = $1::uuid
            and org_id = app.current_org_id()
            and coalesce(status, 'active') <> 'archived'
          limit 1`,
        [productionLineId],
      );
      if (lineCheck.rowCount !== 1 || !lineCheck.rows[0]) {
        return { ok: false, error: 'Production line is not visible in this organisation' };
      }
    }

    const updated = await ctx.client.query<{ id: string }>(
      `update public.npd_projects
          set production_line_id = $2::uuid,
              updated_at = now()
        where id = $1::uuid
          and org_id = app.current_org_id()
      returning id::text as id`,
      [projectId, productionLineId],
    );

    if (updated.rowCount !== 1 || !updated.rows[0]) {
      return { ok: false, error: 'Project is not visible in this organisation' };
    }

    revalidateLocalized(`/pipeline/${projectId}/formulation`, 'page');
    revalidateLocalized(`/pipeline/${projectId}/trial`, 'page');
    revalidateLocalized(`/pipeline/${projectId}/pilot`, 'page');

    return { ok: true, productionLineId };
  });
}
