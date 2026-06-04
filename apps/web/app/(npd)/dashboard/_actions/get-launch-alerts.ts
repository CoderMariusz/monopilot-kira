'use server';

import { withOrgContext } from '../../../../lib/auth/with-org-context';

const DASHBOARD_VIEW_PERMISSIONS = ['npd.dashboard.view', 'dashboard.view'] as const;

type AlertLevel = 'RED' | 'YELLOW' | 'GREEN';
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};
type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};
type LaunchAlertRow = {
  product_code: string;
  product_name: string | null;
  launch_date: string | null;
  days_left: number | null;
  alert_level: AlertLevel;
  missing_data: string | null;
  built: boolean;
};

export type LaunchAlertsInput = {
  dept?: string | null;
  showBuilt?: boolean | null;
  search?: string | null;
};

export type LaunchAlertsResult = {
  alerts: Array<{
    productCode: string;
    productName: string | null;
    launchDate: string | null;
    daysLeft: number | null;
    alertLevel: AlertLevel;
    missingData: string | null;
    built: boolean;
  }>;
};

export async function getLaunchAlerts(input: LaunchAlertsInput = {}): Promise<LaunchAlertsResult> {
  const filters = normalizeInput(input);
  return await withOrgContext<LaunchAlertsResult>(async ({ userId, orgId, client }: OrgActionContext) => {
    if (!(await hasAnyPermission({ userId, orgId, client }, DASHBOARD_VIEW_PERMISSIONS))) {
      throw new Error('FORBIDDEN');
    }

    const { rows } = await client.query<LaunchAlertRow>(
      `with threshold_values as (
         select
           max(value_int) filter (where threshold_key = 'launch_alert_red_days') as red_days,
           max(value_int) filter (where threshold_key = 'launch_alert_yellow_days') as yellow_days
         from "Reference"."AlertThresholds"
         where org_id = app.current_org_id()
           and threshold_key in ('launch_alert_red_days', 'launch_alert_yellow_days')
       ),
       candidates as (
         select p.product_code,
                p.product_name,
                p.launch_date,
                (p.launch_date - current_date)::integer as days_left,
                coalesce(t.red_days, 10) as red_days,
                coalesce(t.yellow_days, 21) as yellow_days,
                m.missing_data,
                p.built
           from public.product p
           cross join threshold_values t
           left join public.missing_required_cols m
             on m.org_id = p.org_id
            and m.product_code = p.product_code
          where p.org_id = app.current_org_id()
            and coalesce(p.status_overall, '') <> 'Complete'
            and ($1::boolean = true or p.built = false)
            and ($2::text is null or m.missing_data ilike '%' || $2 || ':%')
            and (
              $3::text is null
              or p.product_code ilike '%' || $3 || '%'
              or p.product_name ilike '%' || $3 || '%'
            )
       )
       select product_code,
              product_name,
              launch_date::text as launch_date,
              days_left,
              case
                when launch_date is null or days_left <= red_days then 'RED'
                when days_left <= yellow_days and nullif(missing_data, '') is not null then 'YELLOW'
                else 'GREEN'
              end as alert_level,
              missing_data,
              built
         from candidates
        order by days_left asc nulls first, product_code`,
      [filters.showBuilt, filters.dept, filters.search],
    );

    return {
      alerts: rows.map((row) => ({
        productCode: row.product_code,
        productName: row.product_name,
        launchDate: row.launch_date,
        daysLeft: row.days_left,
        alertLevel: row.alert_level,
        missingData: row.missing_data,
        built: row.built,
      })),
    };
  });
}

function normalizeInput(input: LaunchAlertsInput): Required<LaunchAlertsInput> {
  return {
    dept: normalizeText(input.dept),
    showBuilt: input.showBuilt === true,
    search: normalizeText(input.search),
  };
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

async function hasAnyPermission(ctx: OrgActionContext, permissions: readonly string[]): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp
         on rp.role_id = r.id
        and rp.permission = any($3::text[])
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or exists (
            select 1
            from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) p(permission)
            where p.permission = any($3::text[])
          )
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permissions],
  );
  return rows.length > 0;
}
