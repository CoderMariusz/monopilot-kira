'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { AuthError, ValidationError } from './errors';
import { revalidateLocalized } from '../../../../lib/i18n/revalidate-localized';

const DEPT_CONFIG = {
  Core: { closedColumn: 'closed_core' },
  Planning: { closedColumn: 'closed_planning' },
  Commercial: { closedColumn: 'closed_commercial' },
  Production: { closedColumn: 'closed_production' },
  Technical: { closedColumn: 'closed_technical' },
  MRP: { closedColumn: 'closed_mrp' },
  Procurement: { closedColumn: 'closed_procurement' },
} as const;

const DEPT_VALUES = Object.keys(DEPT_CONFIG) as [Dept, ...Dept[]];
const REOPEN_PERMISSION = 'npd.closed_flag.unset';
const FA_DEPT_REOPENED_EVENT = 'fa.dept_reopened';
const APP_VERSION = 'reopen-dept-section-v1';
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

export type ReopenDeptSectionResult = {
  dept: Dept;
  reopenedAt: string;
};

const inputSchema = z.object({
  productCode: z.string().trim().min(1),
  dept: z.enum(DEPT_VALUES),
});

export async function reopenDeptSection(
  productCode: string,
  dept: string,
): Promise<ReopenDeptSectionResult> {
  const parsed = inputSchema.safeParse({ productCode, dept });
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid product code or department');
  }

  return withOrgContext<ReopenDeptSectionResult>(async (ctx) => {
    const context = ctx as OrgContextLike;
    const config = DEPT_CONFIG[parsed.data.dept];

    if (!(await hasPermission(context))) {
      throw new AuthError('FORBIDDEN', `${REOPEN_PERMISSION} is required to reopen ${parsed.data.dept}`);
    }

    const reopenedAt = new Date().toISOString();
    const { rowCount } = await context.client.query(
      `update public.product
          set ${config.closedColumn} = ''
        where org_id = app.current_org_id()
          and product_code = $1`,
      [parsed.data.productCode],
    );
    if (rowCount !== 1) {
      throw new ValidationError('PRODUCT_NOT_FOUND', 'Product is not visible in the current organization');
    }

    await writeOutbox(context, parsed.data.productCode, parsed.data.dept);
    revalidateFaPaths(parsed.data.productCode);

    return { dept: parsed.data.dept, reopenedAt };
  });
}

async function hasPermission(ctx: OrgContextLike): Promise<boolean> {
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
    [ctx.userId, ctx.orgId, REOPEN_PERMISSION],
  );
  return rows.length > 0;
}

async function writeOutbox(ctx: OrgContextLike, productCode: string, dept: Dept): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values
       (app.current_org_id(), $1, 'fa', $2, $3::jsonb, $4)`,
    [FA_DEPT_REOPENED_EVENT, productCode, JSON.stringify({ dept }), APP_VERSION],
  );
}

function safeRevalidatePath(path: string, type?: 'page' | 'layout'): void {
  try {
    revalidateLocalized(path, type);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}

function revalidateFaPaths(productCode: string): void {
  safeRevalidatePath('/[locale]/fg', 'page');
  safeRevalidatePath('/[locale]/fg/[productCode]', 'page');
}
