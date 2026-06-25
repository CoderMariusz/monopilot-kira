'use server';

import { withOrgContext } from '../../../../lib/auth/with-org-context';

const DASHBOARD_VIEW_PERMISSIONS = ['npd.dashboard.view', 'dashboard.view'] as const;
const FULL_DASHBOARD_ROLE_CODES = new Set(['npd_manager', 'admin']);
const DEPTS = ['core', 'planning', 'commercial', 'production', 'technical', 'mrp', 'procurement'] as const;

type Dept = (typeof DEPTS)[number];
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};
type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type SummaryRow = {
  total_active: string | number;
  fully_complete: string | number;
  pending: string | number;
  total_built: string | number;
};
type DeptRow = {
  dept: Dept;
  done: string | number;
  pending: string | number;
  blocked: string | number;
  blocked_fas: string | BlockedFaRow[];
};
type BlockedFaRow = {
  productCode: string;
  productName: string | null;
  missingData: string | null;
};
type CallerAccess = {
  roleCodes: string[];
  canView: boolean;
  deptFilter: Dept | null;
};

export type DashboardSummaryResult = {
  summary: {
    totalActive: number;
    fullyComplete: number;
    pending: number;
    totalBuilt: number;
  };
  perDept: Array<{
    dept: Dept;
    done: number;
    pending: number;
    blocked: number;
    blockedFas: BlockedFaRow[];
  }>;
};

export async function getDashboardSummary(): Promise<DashboardSummaryResult> {
  return await withOrgContext<DashboardSummaryResult>(async ({ userId, orgId, client }: OrgActionContext) => {
    const access = await getCallerAccess({ userId, orgId, client });
    if (!access.canView) throw new Error('FORBIDDEN');

    const [summary, perDept] = await Promise.all([
      readSummary(client),
      readPerDept(client, access.deptFilter),
    ]);

    return { summary, perDept };
  });
}

async function getCallerAccess(ctx: OrgActionContext): Promise<CallerAccess> {
  const { rows } = await ctx.client.query<{ code: string; permission: string | null }>(
    `select r.code, rp.permission
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp
         on rp.role_id = r.id
        and rp.permission = any($3::text[])
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid`,
    [ctx.userId, ctx.orgId, DASHBOARD_VIEW_PERMISSIONS],
  );

  const roleCodes = [...new Set(rows.map((row) => row.code).filter(Boolean))];
  const canView = rows.some((row) => row.permission !== null) || await hasLegacyJsonPermission(ctx, DASHBOARD_VIEW_PERMISSIONS);
  const deptFilter = shouldFilterToDept(roleCodes) ? inferDept(roleCodes) : null;

  return { roleCodes, canView, deptFilter };
}

async function hasLegacyJsonPermission(ctx: OrgActionContext, permissions: readonly string[]): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and exists (
          select 1
          from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) p(permission)
          where p.permission = any($3::text[])
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permissions],
  );
  return rows.length > 0;
}

function shouldFilterToDept(roleCodes: readonly string[]): boolean {
  if (roleCodes.some((code) => FULL_DASHBOARD_ROLE_CODES.has(code))) return false;
  return roleCodes.some((code) => code.includes('dept_manager') || code.includes('dept_user'));
}

function inferDept(roleCodes: readonly string[]): Dept | null {
  for (const dept of DEPTS) {
    if (roleCodes.some((code) => code.toLowerCase().includes(dept))) return dept;
  }
  return null;
}

async function readSummary(client: QueryClient): Promise<DashboardSummaryResult['summary']> {
  const { rows } = await client.query<SummaryRow>(
    `select total_active, fully_complete, pending, total_built
       from public.dashboard_summary
      where org_id = app.current_org_id()`,
  );
  const row = rows[0];
  return {
    totalActive: toNumber(row?.total_active),
    fullyComplete: toNumber(row?.fully_complete),
    pending: toNumber(row?.pending),
    totalBuilt: toNumber(row?.total_built),
  };
}

async function readPerDept(client: QueryClient, deptFilter: Dept | null): Promise<DashboardSummaryResult['perDept']> {
  const { rows } = await client.query<DeptRow>(
    `with dept_rows(dept, done_column) as (
       values
         ('core', 'done_core'),
         ('planning', 'done_planning'),
         ('commercial', 'done_commercial'),
         ('production', 'done_production'),
         ('technical', 'done_technical'),
         ('mrp', 'done_mrp'),
         ('procurement', 'done_procurement')
     ),
     product_dept as (
       select d.dept::text as dept,
              p.product_code,
              p.product_name,
              case d.done_column
                when 'done_core' then coalesce(p.done_core, false)
                when 'done_planning' then coalesce(p.done_planning, false)
                when 'done_commercial' then coalesce(p.done_commercial, false)
                when 'done_production' then coalesce(p.done_production, false)
                when 'done_technical' then coalesce(p.done_technical, false)
                when 'done_mrp' then coalesce(p.done_mrp, false)
                when 'done_procurement' then coalesce(p.done_procurement, false)
                else false
              end as is_done,
              m.missing_data,
              m.missing_data is not null as is_blocked
         from public.product p
         cross join dept_rows d
         left join public.missing_required_cols m
           on m.org_id = p.org_id
          and m.product_code = p.product_code
          and m.missing_data ilike '%' || d.dept || ':%'
        where p.org_id = app.current_org_id()
          and p.product_code is not null
          and ($1::text is null or d.dept = $1)
     )
     select dept,
            count(*) filter (where is_done)::text as done,
            count(*) filter (where not is_done)::text as pending,
            count(*) filter (where is_blocked)::text as blocked,
            coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'productCode', product_code,
                  'productName', product_name,
                  'missingData', missing_data
                )
                order by product_code
              ) filter (where is_blocked),
              '[]'::jsonb
            )::text as blocked_fas
       from product_dept
      group by dept
      order by array_position(array['core','planning','commercial','production','technical','mrp','procurement'], dept)`,
    [deptFilter],
  );

  return rows.map((row) => ({
    dept: row.dept,
    done: toNumber(row.done),
    pending: toNumber(row.pending),
    blocked: toNumber(row.blocked),
    blockedFas: parseBlockedFas(row.blocked_fas),
  }));
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return Number(value);
}

function parseBlockedFas(value: string | BlockedFaRow[] | null | undefined): BlockedFaRow[] {
  if (Array.isArray(value)) return value.map(normalizeBlockedFa).filter(Boolean) as BlockedFaRow[];
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map(normalizeBlockedFa).filter(Boolean) as BlockedFaRow[]
      : [];
  } catch (error) {
    console.error('[npd-dashboard] failed to parse blocked FA rows:', error);
    return [];
  }
}

function normalizeBlockedFa(value: unknown): BlockedFaRow | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const productCode = typeof row.productCode === 'string' ? row.productCode : '';
  if (!productCode) return null;
  return {
    productCode,
    productName: typeof row.productName === 'string' ? row.productName : null,
    missingData: typeof row.missingData === 'string' ? row.missingData : null,
  };
}
