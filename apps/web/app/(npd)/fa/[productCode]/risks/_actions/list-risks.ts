'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

type RiskBucket = 'Low' | 'Med' | 'High';
type RiskState = 'Open' | 'Mitigated' | 'Closed';
type RiskListRow = {
  id: string;
  product_code: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  score: number;
  bucket: RiskBucket;
  state: RiskState;
  mitigation: string | null;
  owner_user_id: string | null;
  closed_at: string | null;
  closed_by_user: string | null;
  created_at: string;
};
type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

export type ListRisksInput = {
  productCode: string;
};

export type ListRisksResult =
  | { ok: true; risks: RiskListRow[]; counts: Record<RiskBucket, number> }
  | { ok: false; code: 'INVALID_INPUT' | 'PERSISTENCE_FAILED' };

export async function listRisks(input: ListRisksInput): Promise<ListRisksResult> {
  const productCode = normalizeText(input?.productCode);
  if (!productCode) return { ok: false, code: 'INVALID_INPUT' };

  return withOrgContext<ListRisksResult>(async ({ client }) => {
    const queryClient = client as QueryClient;
    try {
      const result = await queryClient.query<RiskListRow>(
        `select id, product_code, title, description, likelihood, impact, score, bucket, state,
                mitigation, owner_user_id, closed_at, closed_by_user, created_at
           from public.risks
          where org_id = app.current_org_id()
            and product_code = $1
          order by
            case bucket when 'High' then 1 when 'Med' then 2 else 3 end,
            created_at desc,
            id desc`,
        [productCode],
      );

      return {
        ok: true,
        risks: result.rows,
        counts: countBuckets(result.rows),
      };
    } catch {
      return { ok: false, code: 'PERSISTENCE_FAILED' };
    }
  });
}

function countBuckets(rows: readonly Pick<RiskListRow, 'bucket'>[]): Record<RiskBucket, number> {
  const counts: Record<RiskBucket, number> = { Low: 0, Med: 0, High: 0 };
  for (const row of rows) {
    counts[row.bucket] += 1;
  }
  return counts;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
