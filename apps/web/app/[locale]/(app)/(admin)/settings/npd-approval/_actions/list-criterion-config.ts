'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { NPD_APPROVAL_CRITERIA_PERMISSION } from './criterion-config-schema';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type CriterionConfigRow = {
  criterion_key: string;
  required: boolean;
  display_name: string | null;
};

const DEFAULT_CRITERIA = [
  { key: 'C1', label: 'Recipe locked' },
  { key: 'C2', label: 'Nutrition target met' },
  { key: 'C3', label: 'Target margin met' },
  { key: 'C4', label: 'Sensory panel passed' },
  { key: 'C5', label: 'Allergen audit passed' },
  { key: 'C6', label: 'High risks closed' },
  { key: 'C7', label: 'Compliance docs valid' },
] as const;

async function hasNpdSchemaEdit({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, NPD_APPROVAL_CRITERIA_PERMISSION],
  );
  return rows.length > 0;
}

export async function listCriterionConfig() {
  try {
    return await withOrgContext(async (ctx) => {
      const context = ctx as OrgContextLike;
      if (!(await hasNpdSchemaEdit(context))) {
        return { ok: false as const, code: 'forbidden' as const };
      }

      const { rows } = await context.client.query<CriterionConfigRow>(
        `select criterion_key, required, display_name
           from public.npd_approval_criterion_config
          where org_id = app.current_org_id()`,
      );
      const rowsByKey = new Map(rows.map((row) => [row.criterion_key, row] as const));

      return {
        ok: true as const,
        data: DEFAULT_CRITERIA.map((criterion) => {
          const row = rowsByKey.get(criterion.key);
          return {
            key: criterion.key,
            label: row?.display_name ?? criterion.label,
            required: row?.required ?? true,
          };
        }),
      };
    });
  } catch (error) {
    console.error('[listCriterionConfig] persistence_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false as const, code: 'persistence_failed' as const };
  }
}
