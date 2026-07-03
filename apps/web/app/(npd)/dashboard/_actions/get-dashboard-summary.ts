'use server';

import { isNpdFieldValueFilled } from '../../../../lib/npd/field-value-filled';
import { stageOrderIndex, stageRoutePath } from '../../../../lib/npd/stage-routes';
import { withOrgContext } from '../../../../lib/auth/with-org-context';

const DASHBOARD_VIEW_PERMISSIONS = ['npd.dashboard.view', 'dashboard.view'] as const;
const FULL_DASHBOARD_ROLE_CODES = new Set(['npd_manager', 'admin']);

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
type BlockedFaRow = {
  productCode: string;
  productName: string | null;
  missingData: string | null;
  projectId?: string | null;
  stageRoute?: string | null;
};
type CallerAccess = {
  roleCodes: string[];
  canView: boolean;
  deptFilter: string | null;
};

type ActiveDeptRow = {
  code: string;
  name: string;
  stage_code: string;
  display_order: number;
};

type DeptFieldRow = {
  dept_code: string;
  field_code: string;
  required: boolean;
  is_auto: boolean;
  auto_source_field: string | null;
};

type ProductRow = {
  product_code: string;
  product_name: string | null;
  product_json: Record<string, unknown>;
  project_id: string | null;
};

export type DashboardSummaryResult = {
  summary: {
    totalActive: number;
    fullyComplete: number;
    pending: number;
    totalBuilt: number;
  };
  perDept: Array<{
    dept: string;
    deptName: string;
    stageCode: string;
    stageRoute: string;
    stageOrder: number;
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
  const deptFilter = shouldFilterToDept(roleCodes) ? inferDept(roleCodes, await readActiveDeptCodes(ctx.client)) : null;

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

async function readActiveDeptCodes(client: QueryClient): Promise<string[]> {
  const { rows } = await client.query<{ code: string }>(
    `select lower(d.code) as code
       from public.npd_departments d
      where d.org_id = app.current_org_id()
        and d.active = true
      order by d.display_order asc, d.code asc`,
  );
  return rows.map((row) => row.code);
}

function inferDept(roleCodes: readonly string[], activeDepts: readonly string[]): string | null {
  for (const dept of activeDepts) {
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

async function readActiveDepartments(client: QueryClient): Promise<ActiveDeptRow[]> {
  const { rows } = await client.query<ActiveDeptRow>(
    `select lower(d.code) as code,
            d.name,
            coalesce(d.stage_code, 'brief') as stage_code,
            coalesce(d.display_order, 0) as display_order
       from public.npd_departments d
      where d.org_id = app.current_org_id()
        and d.active = true
      order by d.display_order asc, d.code asc`,
  );
  return rows;
}

async function readDeptFieldRequirements(client: QueryClient): Promise<DeptFieldRow[]> {
  const { rows } = await client.query<DeptFieldRow>(
    `select lower(d.code) as dept_code,
            lower(f.code) as field_code,
            coalesce(df.required, false) as required,
            coalesce(f.is_auto, false) as is_auto,
            f.auto_source_field
       from public.npd_departments d
       join public.npd_department_field df
         on df.department_id = d.id
        and df.org_id = d.org_id
       join public.npd_field_catalog f
         on f.id = df.field_id
        and f.org_id = df.org_id
      where d.org_id = app.current_org_id()
        and d.active = true
        and df.visible = true
        and f.active = true
        and df.required = true`,
  );
  return rows;
}

async function readProducts(client: QueryClient): Promise<ProductRow[]> {
  const { rows } = await client.query<ProductRow>(
    `select p.product_code,
            p.product_name,
            to_jsonb(p.*) as product_json,
            np.id::text as project_id
       from public.product p
       left join public.npd_projects np
         on np.org_id = p.org_id
        and np.product_code = p.product_code
      where p.org_id = app.current_org_id()
        and p.product_code is not null`,
  );
  return rows;
}

function resolveFieldValue(
  productJson: Record<string, unknown>,
  field: DeptFieldRow,
): unknown {
  const fieldCode = field.field_code;
  const autoSource =
    field.is_auto && (field.auto_source_field ?? '').trim() !== ''
      ? (field.auto_source_field as string).trim().toLowerCase()
      : null;
  if (autoSource && autoSource in productJson) return productJson[autoSource];
  return productJson[fieldCode];
}

function formatMissingData(deptName: string, missingLabels: string[]): string {
  if (missingLabels.length === 0) return '';
  return `${deptName}: ${missingLabels.join(', ')}.`;
}

async function readPerDept(
  client: QueryClient,
  deptFilter: string | null,
): Promise<DashboardSummaryResult['perDept']> {
  const [departments, fieldRows, products] = await Promise.all([
    readActiveDepartments(client),
    readDeptFieldRequirements(client),
    readProducts(client),
  ]);

  const fieldsByDept = new Map<string, DeptFieldRow[]>();
  for (const row of fieldRows) {
    const list = fieldsByDept.get(row.dept_code) ?? [];
    list.push(row);
    fieldsByDept.set(row.dept_code, list);
  }

  const filteredDepts = deptFilter
    ? departments.filter((dept) => dept.code === deptFilter)
    : departments;

  return filteredDepts
    .map((dept) => {
      const requiredFields = fieldsByDept.get(dept.code) ?? [];
      let done = 0;
      let pending = 0;
      let blocked = 0;
      const blockedFas: BlockedFaRow[] = [];

      for (const product of products) {
        const missingLabels: string[] = [];
        for (const field of requiredFields) {
          const value = resolveFieldValue(product.product_json, field);
          if (!isNpdFieldValueFilled(value)) {
            missingLabels.push(field.field_code.replace(/_/g, ' '));
          }
        }

        const hasRequired = requiredFields.length > 0;
        const isComplete = !hasRequired || missingLabels.length === 0;

        if (isComplete) {
          done += 1;
        } else {
          pending += 1;
          blocked += 1;
          blockedFas.push({
            productCode: product.product_code,
            productName: product.product_name,
            missingData: formatMissingData(dept.name, missingLabels),
            projectId: product.project_id,
            stageRoute: stageRoutePath(dept.stage_code),
          });
        }
      }

      return {
        dept: dept.code,
        deptName: dept.name,
        stageCode: dept.stage_code,
        stageRoute: stageRoutePath(dept.stage_code),
        stageOrder: stageOrderIndex(dept.stage_code),
        done,
        pending,
        blocked,
        blockedFas: blockedFas.sort((a, b) => a.productCode.localeCompare(b.productCode)),
      };
    })
    .sort((a, b) => {
      if (a.stageOrder !== b.stageOrder) return a.stageOrder - b.stageOrder;
      if (a.dept !== b.dept) return a.dept.localeCompare(b.dept);
      return 0;
    });
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return Number(value);
}
