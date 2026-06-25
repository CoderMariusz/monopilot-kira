import { withOrgContext } from '../../../../../lib/auth/with-org-context';

export type CostingRollupRow = {
  projectCode: string;
  name: string;
  totalCost: number;
  targetPrice: number;
  margin: number;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = { client: QueryClient };

type CostingRollupDbRow = {
  project_code: string | null;
  project_name: string | null;
  raw_cost_eur: string | null;
  target_price_eur: string | null;
  margin_pct: string | null;
};

const TARGET_SCENARIO = 'target';

export async function getCostingRollup(): Promise<CostingRollupRow[]> {
  'use server';

  try {
    return await withOrgContext(async (rawCtx): Promise<CostingRollupRow[]> => {
      const ctx = rawCtx as OrgContextLike;
      const result = await ctx.client.query<CostingRollupDbRow>(
        `select p.code                    as project_code,
                p.name                    as project_name,
                cb.raw_cost_eur::text     as raw_cost_eur,
                cb.target_price_eur::text as target_price_eur,
                cb.margin_pct::text       as margin_pct
           from public.costing_breakdowns cb
           join public.npd_projects p
             on p.org_id = cb.org_id
            and p.product_code = cb.product_code
          where cb.org_id = app.current_org_id()
            and p.org_id = app.current_org_id()
            and cb.scenario = $1
          order by p.code asc`,
        [TARGET_SCENARIO],
      );

      return result.rows.map((row) => ({
        projectCode: row.project_code ?? '',
        name: row.project_name ?? row.project_code ?? '',
        totalCost: decimalToNumber(row.raw_cost_eur),
        targetPrice: decimalToNumber(row.target_price_eur),
        margin: decimalToNumber(row.margin_pct),
      }));
    });
  } catch (error) {
    console.error('[getCostingRollup] org-scoped read failed', error);
    return [];
  }
}

function decimalToNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
