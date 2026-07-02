'use server';

/**
 * Wave-shipping — Customer master CRUD Server Actions.
 *
 * The SO create flow (so-form-data.ts → listSoCustomers) and the SO/shipment reads
 * (so-actions.ts) all resolve public.customers, but no action ever WROTE a customer
 * row — so a clean org could never raise a sales order (L2). This adds the missing
 * createCustomer (+ a listCustomers read for the admin screen).
 *
 * Contract:
 *   - org-scoped: every statement filters org_id = app.current_org_id() (RLS, mig
 *     211/288 customers_org_context policy); no service-role bypass, no mocks.
 *   - RBAC: ship.so.create (the same gate as createSalesOrder — creating a customer
 *     is a strict prerequisite of raising a sales order, and the same operators do
 *     both; reuses the seeded ship.* family, so NO new migration/permission). The
 *     action is the source of truth and re-checks server-side; never client-trusted.
 *   - validation: zod (CustomerCreateInput) — name required, category enum
 *     (retail/wholesale/distributor matching customers_category_check), optional
 *     email / phone / tax_id / credit_limit_gbp, is_active.
 *   - numbering: customer_code is the org-document-number convention — when the
 *     caller leaves it blank we generate the next CUST-YYYY-NNNNN for the org/year
 *     (matches the SO/PO/TO document-number pattern + the prototype's
 *     "auto-generated if blank · CUST-YYYY-NNNNN" help text).
 *   - audit: writes a public.audit_events row (ship.customer.created) — same helper
 *     shape planning's writeProcurementAudit uses.
 */

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

export type CustomerError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'already_exists'
  | 'persistence_failed';

type Customer = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  category: 'retail' | 'wholesale' | 'distributor';
  creditLimitGbp: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerResult<T> = ({ ok: true; data: T } & (T extends Customer ? { id: string } : object)) | { ok: false; error: CustomerError; message?: string };

const SHIP_CUSTOMER_WRITE = 'ship.so.create';

const CustomerCreateInput = z.object({
  // Optional: auto-generated CUST-YYYY-NNNNN when blank.
  code: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().min(1).max(80).optional(),
  ),
  name: z.string().trim().min(2).max(255),
  category: z.enum(['retail', 'wholesale', 'distributor']).default('retail'),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(64).optional(),
  taxId: z.string().trim().max(64).optional(),
  // Money as a decimal string (≤2 dp); the column is numeric(14,2).
  creditLimitGbp: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,2})?$/)
    .optional(),
  isActive: z.boolean().default(true),
});

type CustomerRow = {
  id: string;
  customer_code: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  category: string | null;
  credit_limit_gbp: string | number | null;
  is_active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapCustomer(row: CustomerRow): Customer {
  const category = (row.category ?? 'retail') as Customer['category'];
  return {
    id: row.id,
    code: row.customer_code ?? '',
    name: row.name ?? '',
    email: row.email,
    phone: row.phone,
    taxId: row.tax_id,
    category,
    creditLimitGbp: row.credit_limit_gbp == null ? null : String(row.credit_limit_gbp),
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

function pgErrorToResult(err: unknown): CustomerError {
  if (isPgError(err) && err.code === '23505') return 'already_exists';
  if (isPgError(err) && err.code === '23514') return 'invalid_input';
  if (isPgError(err) && err.code === '23503') return 'not_found';
  return 'persistence_failed';
}

async function hasCustomerWritePermission(ctx: OrgActionContext): Promise<boolean> {
  // Same shape as so-actions.ts hasPermission(): role_permissions rows OR the legacy
  // roles.permissions jsonb cache, with explicit userId/orgId params.
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
    [ctx.userId, ctx.orgId, SHIP_CUSTOMER_WRITE],
  );
  return rows.length > 0;
}

async function writeCustomerAudit(
  ctx: OrgActionContext,
  input: { action: string; resourceId: string; afterState: Record<string, unknown> },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values
       ($1::uuid, $2::uuid, 'user', $3, 'customer', $4,
        null, $5::jsonb, $6::uuid, 'operational')`,
    [ctx.orgId, ctx.userId, input.action, input.resourceId, JSON.stringify(input.afterState), randomUUID()],
  );
}

/**
 * Next org-scoped customer document number for the current year (CUST-YYYY-NNNNN).
 * Derives the high-water mark from existing CUST-YYYY-* codes in this org and
 * increments — the unique (org_id, customer_code) index is the hard guard, so a
 * 23505 on insert is mapped to already_exists (the caller may also pass an explicit
 * code). Runs inside the same org context.
 */
async function nextCustomerCode(ctx: OrgActionContext): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `CUST-${year}-`;
  const { rows } = await ctx.client.query<{ max_seq: number | null }>(
    `select max((substring(customer_code from '^CUST-[0-9]{4}-([0-9]+)$'))::int) as max_seq
       from public.customers
      where org_id = app.current_org_id()
        and customer_code like $1`,
    [`${prefix}%`],
  );
  const next = (rows[0]?.max_seq ?? 0) + 1;
  return `${prefix}${String(next).padStart(5, '0')}`;
}

export async function listCustomers(params: unknown = {}): Promise<CustomerResult<Customer[]>> {
  const input = (params ?? {}) as { q?: unknown; activeOnly?: unknown; limit?: unknown };
  const q = typeof input.q === 'string' && input.q.trim() ? input.q.trim() : null;
  const activeOnly = input.activeOnly === true;
  const limit =
    typeof input.limit === 'number' && Number.isInteger(input.limit) ? Math.min(Math.max(input.limit, 1), 500) : 200;

  try {
    return await withOrgContext(async ({ client }): Promise<CustomerResult<Customer[]>> => {
      const { rows } = await (client as QueryClient).query<CustomerRow>(
        `select id::text, customer_code, name, email, phone, tax_id, category,
                credit_limit_gbp::text as credit_limit_gbp, is_active, created_at, updated_at
           from public.customers
          where org_id = app.current_org_id()
            and deleted_at is null
            and ($1::boolean is not true or is_active = true)
            and ($2::text is null or customer_code ilike '%' || $2 || '%' or name ilike '%' || $2 || '%' or email ilike '%' || $2 || '%')
          order by customer_code asc, name asc
          limit $3::integer`,
        [activeOnly, q, limit],
      );
      return { ok: true, data: rows.map(mapCustomer) };
    });
  } catch (err) {
    console.error('[shipping/customers] listCustomers failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function createCustomer(rawInput: unknown): Promise<CustomerResult<Customer>> {
  const parsed = CustomerCreateInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<CustomerResult<Customer>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const code = input.code ?? (await nextCustomerCode(ctx));

      const { rows } = await ctx.client.query<CustomerRow>(
        `insert into public.customers
           (org_id, customer_code, name, email, phone, tax_id, category, credit_limit_gbp, is_active, created_by, updated_by)
         values
           (app.current_org_id(), $1, $2, $3, $4, $5, $6, $7::numeric, $8, $9::uuid, $9::uuid)
         returning id::text, customer_code, name, email, phone, tax_id, category,
                   credit_limit_gbp::text as credit_limit_gbp, is_active, created_at, updated_at`,
        [
          code,
          input.name,
          input.email ?? null,
          input.phone ?? null,
          input.taxId ?? null,
          input.category,
          input.creditLimitGbp ?? null,
          input.isActive,
          userId,
        ],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };

      await writeCustomerAudit(ctx, {
        action: 'ship.customer.created',
        resourceId: row.id,
        afterState: { code: row.customer_code, name: row.name, category: row.category, is_active: row.is_active },
      });

      revalidateLocalized('/shipping');
      revalidateLocalized('/shipping/customers');

      return { ok: true, id: row.id, data: mapCustomer(row) };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error === 'persistence_failed') console.error('[shipping/customers] createCustomer failed', err);
    return { ok: false, error };
  }
}
