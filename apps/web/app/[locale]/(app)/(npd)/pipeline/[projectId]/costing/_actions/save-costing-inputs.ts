'use server';


import { hasPermission } from '../../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';

const WRITE_PERMISSION = 'npd.formulation.create_draft';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

import {
  saveCostingInputsSchema,
  type SaveCostingInputsInput,
  type SaveCostingInputsResult,
} from './save-costing-inputs-schema';

export async function saveCostingInputs(input: SaveCostingInputsInput): Promise<SaveCostingInputsResult> {
  const parsed = saveCostingInputsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid costing inputs: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      code: 'invalid_input',
    };
  }

  try {
    return await withOrgContext<SaveCostingInputsResult>(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      if (!(await hasPermission(ctx, WRITE_PERMISSION))) {
        return {
          ok: false,
          error: `${WRITE_PERMISSION} is required to save costing inputs`,
          code: 'forbidden',
        };
      }

      const updated = await ctx.client.query<{ id: string }>(
        `update public.npd_projects
            set avg_batch_qty = $2::numeric,
                overhead_per_kg_override = $3::numeric,
                logistics_per_box_override = $4::numeric,
                updated_at = now()
          where id = $1::uuid
            and org_id = app.current_org_id()
        returning id`,
        [
          parsed.data.projectId,
          parsed.data.avgBatchQty,
          parsed.data.overheadPerKgOverride,
          parsed.data.logisticsPerBoxOverride,
        ],
      );

      if (updated.rowCount !== 1) {
        return {
          ok: false,
          error: 'Project not found in this organisation',
          code: 'not_found',
        };
      }

      return { ok: true };
    });
  } catch (err) {
    const dbCode = typeof (err as { code?: unknown }).code === 'string' ? (err as { code: string }).code : undefined;
    const message = err instanceof Error ? err.message : 'Could not save costing inputs';
    return {
      ok: false,
      error: dbCode ? `Database error ${dbCode}: ${message}` : message,
      code: 'db_error',
      dbCode,
    };
  }
}
