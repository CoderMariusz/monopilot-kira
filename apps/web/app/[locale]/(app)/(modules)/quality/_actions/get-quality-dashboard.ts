'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type QualityContext = { userId: string; orgId: string; client: QueryClient };

type QualityDashboard = {
  openHolds: number;
  openNcrs: number;
  overdueNcrs: number;
  passRate30d: number | null;
  openCcpDeviations: number;
};

const EMPTY_DASHBOARD: QualityDashboard = {
  openHolds: 0,
  openNcrs: 0,
  overdueNcrs: 0,
  passRate30d: null,
  openCcpDeviations: 0,
};

async function hasPermission(ctx: QualityContext, permission: string): Promise<boolean> {
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
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

function toCount(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

export async function getQualityDashboard(): Promise<QualityDashboard> {
  try {
    return await withOrgContext(async (ctx): Promise<QualityDashboard> => {
      if (!(await hasPermission(ctx, 'quality.dashboard.view'))) return EMPTY_DASHBOARD;

      const holds = await ctx.client.query<{ count: number | string }>(
        `select count(*)::int as count
           from public.v_active_holds h
          where h.org_id = app.current_org_id()
            and h.hold_status = any($1::text[])`,
        [['open', 'investigating', 'escalated', 'quarantined']],
      );

      const ncrs = await ctx.client.query<{ open_count: number | string; overdue_count: number | string }>(
        `select
           count(*) filter (where n.status = any($1::text[]))::int as open_count,
           count(*) filter (
             where n.status = any($1::text[])
               and n.response_due_at is not null
               and n.response_due_at < pg_catalog.now()
           )::int as overdue_count
         from public.ncr_reports n
        where n.org_id = app.current_org_id()`,
        [['open', 'investigating', 'awaiting_capa', 'reopened']],
      );

      const inspections = await ctx.client.query<{ passed_count: number | string; total_count: number | string }>(
        `select
           count(*) filter (where qi.status = 'passed')::int as passed_count,
           count(*)::int as total_count
         from public.quality_inspections qi
        where qi.org_id = app.current_org_id()
          and qi.created_at >= pg_catalog.now() - interval '30 days'`,
      );

      const deviations = await ctx.client.query<{ count: number | string }>(
        `select count(*)::int as count
           from public.ccp_deviations d
          where d.org_id = app.current_org_id()
            and d.status = 'open'`,
      );

      const inspectionRow = inspections.rows[0];
      const totalInspections = toCount(inspectionRow?.total_count);
      const passedInspections = toCount(inspectionRow?.passed_count);

      return {
        openHolds: toCount(holds.rows[0]?.count),
        openNcrs: toCount(ncrs.rows[0]?.open_count),
        overdueNcrs: toCount(ncrs.rows[0]?.overdue_count),
        passRate30d: totalInspections === 0 ? null : Math.round((passedInspections / totalInspections) * 100),
        openCcpDeviations: toCount(deviations.rows[0]?.count),
      };
    });
  } catch {
    return EMPTY_DASHBOARD;
  }
}
