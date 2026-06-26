import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

import type { ComplaintAnalyticsSummary } from '../_components/complaints-contracts';

type CountRow = {
  key: string | null;
  count: string | number;
};

type CapaClosureRow = {
  total: string | number;
  closed: string | number;
};

const READ_PERMISSION = 'quality.dashboard.view';

async function hasReadPermission(ctx: {
  userId: string;
  orgId: string;
  client: { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> };
}): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
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
    [ctx.userId, ctx.orgId, READ_PERMISSION],
  );
  return rows.length > 0;
}

function toCount(value: string | number): number {
  return typeof value === 'number' ? value : Number.parseInt(value, 10);
}

export async function getComplaintAnalytics(): Promise<ComplaintAnalyticsSummary> {
  'use server';

  try {
    return await withOrgContext(async (ctx): Promise<ComplaintAnalyticsSummary> => {
      if (!(await hasReadPermission(ctx))) throw new Error('forbidden');

      const severityResult = await ctx.client.query<CountRow>(
        `select severity as key, count(*) as count
           from public.complaints
          where org_id = app.current_org_id()
          group by severity
          order by severity`,
      );
      const capaResult = await ctx.client.query<CapaClosureRow>(
        `select
           count(*) as total,
           count(*) filter (where status = 'closed') as closed
           from public.capa_actions
          where org_id = app.current_org_id()
            and source_type = 'complaint'`,
      );
      const capa = capaResult.rows[0] ?? { total: 0, closed: 0 };
      const total = toCount(capa.total);
      const closed = toCount(capa.closed);

      return {
        bySeverity: Object.fromEntries(
          severityResult.rows
            .filter((row): row is CountRow & { key: string } => typeof row.key === 'string')
            .map((row) => [row.key, toCount(row.count)]),
        ),
        byRootCause: {},
        capaClosureRate: total === 0 ? 0 : Math.round((closed / total) * 100),
      };
    });
  } catch (err) {
    console.error(err);
    throw err;
  }
}
