'use server';

import { z } from 'zod';

import { hasPermission } from '../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../lib/auth/with-org-context';

const PRODUCTION_WRITE_PERMISSION = 'npd.production.write';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const assignIngredientProcessSchema = z.object({
  ingredientId: z.string().uuid(),
  npdWipProcessId: z.string().uuid().nullable(),
});

export type AssignIngredientProcessInput = z.input<typeof assignIngredientProcessSchema>;

export async function assignIngredientProcess(
  input: AssignIngredientProcessInput,
): Promise<ActionResult<{ ingredientId: string; npdWipProcessId: string | null }>> {
  const parsed = assignIngredientProcessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid ingredient process assignment input' };

  return withOrgContext<ActionResult<{ ingredientId: string; npdWipProcessId: string | null }>>(
    async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      if (!(await hasPermission(ctx, PRODUCTION_WRITE_PERMISSION))) {
        return {
          ok: false,
          error: `${PRODUCTION_WRITE_PERMISSION} is required to assign ingredient consumption`,
        };
      }

      const { ingredientId, npdWipProcessId } = parsed.data;

      if (npdWipProcessId) {
        const scoped = await ctx.client.query<{ ok: boolean }>(
          `select true as ok
             from public.formulation_ingredients fi
             join public.formulation_versions fv on fv.id = fi.version_id
             join public.formulations f on f.id = fv.formulation_id
             join public.npd_projects np on np.id = f.project_id and np.org_id = f.org_id
             join public.npd_wip_processes wp on wp.id = $2::uuid and wp.org_id = f.org_id
             join public.prod_detail pd on pd.id = wp.prod_detail_id and pd.org_id = wp.org_id
            where fi.id = $1::uuid
              and f.org_id = app.current_org_id()
              and pd.product_code = np.product_code
            limit 1`,
          [ingredientId, npdWipProcessId],
        );
        if (scoped.rows.length === 0) {
          return {
            ok: false,
            error: 'Ingredient and process must belong to the same project formulation',
          };
        }
      } else {
        const ingredientVisible = await ctx.client.query<{ ok: boolean }>(
          `select true as ok
             from public.formulation_ingredients fi
             join public.formulation_versions fv on fv.id = fi.version_id
             join public.formulations f on f.id = fv.formulation_id
            where fi.id = $1::uuid
              and f.org_id = app.current_org_id()
            limit 1`,
          [ingredientId],
        );
        if (ingredientVisible.rows.length === 0) {
          return { ok: false, error: 'Ingredient is not visible in this organisation' };
        }
      }

      const updated = await ctx.client.query<{ id: string }>(
        `update public.formulation_ingredients fi
            set npd_wip_process_id = $2::uuid
           from public.formulation_versions fv,
                public.formulations f
          where fi.id = $1::uuid
            and fi.version_id = fv.id
            and fv.formulation_id = f.id
            and f.org_id = app.current_org_id()
        returning fi.id::text as id`,
        [ingredientId, npdWipProcessId],
      );

      if (updated.rowCount !== 1 || !updated.rows[0]) {
        return { ok: false, error: 'Ingredient is not visible in this organisation' };
      }

      return { ok: true, ingredientId, npdWipProcessId };
    },
  );
}
