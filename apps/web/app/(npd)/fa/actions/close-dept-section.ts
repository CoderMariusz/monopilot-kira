'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { AuthError, DepartmentNotReadyError, ValidationError } from './errors';

// Readiness gate: verifies all required fields (from npd_department_field.required)
// are filled before allowing a dept to close. Required fields are read from the
// dynamic catalog via the public.is_all_required_filled(product_code, dept) check.
const DEPT_CONFIG = {
  Core: { permission: 'npd.core.write', closedColumn: 'closed_core' },
  Planning: { permission: 'npd.planning.write', closedColumn: 'closed_planning' },
  Commercial: { permission: 'npd.commercial.write', closedColumn: 'closed_commercial' },
  Production: { permission: 'npd.production.write', closedColumn: 'closed_production' },
  Technical: { permission: 'npd.technical.write', closedColumn: 'closed_technical' },
  MRP: { permission: 'npd.mrp.write', closedColumn: 'closed_mrp' },
  Procurement: { permission: 'npd.procurement.write', closedColumn: 'closed_procurement' },
} as const;

const DEPT_VALUES = Object.keys(DEPT_CONFIG) as [Dept, ...Dept[]];
const FA_DEPT_CLOSED_EVENT = 'fa.dept_closed';
const APP_VERSION = 'close-dept-section-v1';
const LOCALES = ['pl', 'en', 'uk', 'ro'] as const;

type Dept = keyof typeof DEPT_CONFIG;

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type RequiredColumnRow = {
  physical_column: string;
  field_value: string | null;
};

export type CloseDeptSectionResult = {
  dept: Dept;
  closedAt: string;
};

const inputSchema = z.object({
  productCode: z.string().trim().min(1),
  dept: z.enum(DEPT_VALUES),
});

export async function closeDeptSection(
  productCode: string,
  dept: string,
): Promise<CloseDeptSectionResult> {
  const parsed = inputSchema.safeParse({ productCode, dept });
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid product code or department');
  }

  return withOrgContext<CloseDeptSectionResult>(async (ctx) => {
    const context = ctx as OrgContextLike;
    const config = DEPT_CONFIG[parsed.data.dept];

    if (!(await hasPermission(context, config.permission))) {
      throw new AuthError('FORBIDDEN', `${config.permission} is required to close ${parsed.data.dept}`);
    }

    const { rows: gateRows } = await context.client.query<{ ready: boolean }>(
      `select public.is_all_required_filled($1, $2) as ready`,
      [parsed.data.productCode, parsed.data.dept],
    );
    if (gateRows[0]?.ready !== true) {
      throw new DepartmentNotReadyError(
        parsed.data.dept,
        await listMissingRequiredColumns(context, parsed.data.productCode, parsed.data.dept),
      );
    }

    const closedAt = new Date().toISOString();
    const { rowCount } = await context.client.query(
      `update public.product
          set ${config.closedColumn} = 'Yes'
        where org_id = app.current_org_id()
          and product_code = $1`,
      [parsed.data.productCode],
    );
    if (rowCount !== 1) {
      throw new ValidationError('PRODUCT_NOT_FOUND', 'Product is not visible in the current organization');
    }

    await writeOutbox(context, parsed.data.productCode, parsed.data.dept);
    revalidateFaPaths(parsed.data.productCode);

    return { dept: parsed.data.dept, closedAt };
  });
}

async function hasPermission(ctx: OrgContextLike, permission: string): Promise<boolean> {
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

async function listMissingRequiredColumns(
  ctx: OrgContextLike,
  productCode: string,
  dept: Dept,
): Promise<string[]> {
  const { rows } = await ctx.client.query<RequiredColumnRow>(
    `with product_row as (
      select to_jsonb(p.*) as product_json
        from public.product p
       where p.org_id = app.current_org_id()
          and p.product_code = $1::text
        limit 1
     ),
     required_columns as (
       select lower(f.code) as physical_column,
              df.display_order,
              f.code as column_key
         from public.npd_departments d
         join public.npd_department_field df on df.department_id = d.id and df.org_id = d.org_id and df.visible = true
         join public.npd_field_catalog f on f.id = df.field_id and f.org_id = df.org_id and f.active = true
        where d.org_id = app.current_org_id()
          and lower(d.code) = lower($2::text)
          and d.active = true
          and df.required = true
     )
     select rc.physical_column,
            pr.product_json ->> rc.physical_column as field_value
       from required_columns rc
       cross join product_row pr
      where not (pr.product_json ? rc.physical_column)
         or nullif(btrim(pr.product_json ->> rc.physical_column), '') is null
      order by rc.display_order nulls last, rc.column_key`,
    [productCode, dept],
  );
  return rows.map((row) => row.physical_column);
}

async function writeOutbox(ctx: OrgContextLike, productCode: string, dept: Dept): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values
       (app.current_org_id(), $1, 'fa', $2, $3::jsonb, $4)`,
    [FA_DEPT_CLOSED_EVENT, productCode, JSON.stringify({ dept }), APP_VERSION],
  );
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}

function revalidateFaPaths(productCode: string): void {
  safeRevalidatePath('/npd/fg');
  safeRevalidatePath(`/npd/fg/${productCode}`);
  for (const locale of LOCALES) {
    safeRevalidatePath(`/${locale}/npd/fg`);
    safeRevalidatePath(`/${locale}/npd/fg/${productCode}`);
  }
}
