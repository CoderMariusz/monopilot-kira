import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { toMicro } from '../../../../../../lib/shared/decimal';

export const PLANNING_WRITE_PERMISSION = 'npd.planning.write';
export const PLANNING_READ_PERMISSION = 'scheduler.run.read';
export const PLANNING_PO_MANAGE_PERMISSION = 'planning.po.manage';
export const PLANNING_TO_MANAGE_PERMISSION = 'planning.to.manage';
export const PLANNING_SUPPLIER_MANAGE_PERMISSION = 'planning.supplier.manage';

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

export type ProcurementError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'already_exists'
  | 'invalid_state'
  | 'insufficient_stock'
  /** E7: shortfall caused (at least in part) by held LPs that were skipped; see skippedHeldLps in the ship response. */
  | 'insufficient_stock_holds'
  /** W9 RF5 F3: cancel of an in_transit TO with already-received destination LPs is refused. */
  | 'partially_received'
  /** N-PLN-4: source and destination warehouse must differ when both are set. */
  | 'same_warehouse'
  | 'persistence_failed';

export const uuidSchema = z.string().uuid();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const numeric3Schema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,3})?$/)
  .refine((value) => Number(value) > 0, 'quantity must be positive');
/** Positive quantity up to 6 dp — transfer-order line editor (mig 505 NUMERIC(18,6)). */
export const numeric6PositiveSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,6})?$/)
  .refine((value) => toMicro(value) > 0n, 'quantity must be positive');
export const numeric4Schema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,4})?$/)
  .refine((value) => Number(value) >= 0, 'unit price must be non-negative');
/** Percentage 0–100 up to 4 dp — PO/SO line tax_pct (numeric(7,4)). */
export const pctSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,4})?$/)
  .refine((value) => Number(value) >= 0 && Number(value) <= 100, 'percentage must be 0–100');

export const SupplierStatusSchema = z.enum(['active', 'inactive', 'blocked']);
export const PurchaseOrderStatusSchema = z.enum([
  'draft',
  'sent',
  'confirmed',
  'partially_received',
  'received',
  'cancelled',
]);
export const TransferOrderStatusSchema = z.enum(['draft', 'in_transit', 'partially_received', 'received', 'cancelled']);

export const SupplierCreateInput = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(255),
  contact: z.record(z.string(), z.unknown()).optional(),
  currency: z.string().trim().length(3).default('GBP'),
  leadTimeDays: z.number().int().min(0).max(3650).default(0),
  status: SupplierStatusSchema.default('active'),
  notes: z.string().trim().max(2000).optional(),
});

export const PurchaseOrderLineInput = z.object({
  itemId: uuidSchema,
  qty: numeric6PositiveSchema,
  uom: z.string().trim().min(1).max(32),
  unitPrice: numeric4Schema.default('0'),
  taxPct: pctSchema.default('0'),
  lineNo: z.number().int().positive(),
});

export const PurchaseOrderCreateInput = z.object({
  poNumber: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(80).optional(),
  ),
  supplierId: uuidSchema,
  status: PurchaseOrderStatusSchema.default('draft'),
  expectedDelivery: dateSchema.optional(),
  currency: z.string().trim().length(3).default('GBP'),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(PurchaseOrderLineInput).min(1).max(200),
});

export const TransferOrderLineInput = z.object({
  itemId: uuidSchema,
  qty: numeric3Schema,
  uom: z.string().trim().min(1).max(32),
  lineNo: z.number().int().positive(),
});

export const TransferOrderCreateInput = z.object({
  toNumber: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(80).optional(),
  ),
  fromWarehouseId: uuidSchema.optional(),
  toWarehouseId: uuidSchema.optional(),
  status: TransferOrderStatusSchema.default('draft'),
  scheduledDate: dateSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(TransferOrderLineInput).min(1).max(200),
});

/** A unit-of-measure row offered in the PO/TO line UoM pickers (code + name). */
export type OrgUnitOption = {
  /** Stable code stored on the line (e.g. 'kg', 'L', or an admin-added code). */
  code: string;
  /** Human-readable name (e.g. 'Kilogram'); never a raw UUID. */
  name: string;
  /** mass | volume | count — used only for grouping/ordering. */
  category: string;
};

/**
 * Active units of measure for the current org, read from the REAL
 * public.unit_of_measure master (the same table Settings → Units writes to via
 * createUnit). This is what makes admin-added units appear in the PO/TO line UoM
 * pickers — the screens must NOT hardcode a static {kg,g,l,…} list.
 *
 * Runs inside the caller's withOrgContext (org_id = app.current_org_id() via RLS),
 * active rows only (deleted_at is null), ordered base-first then by code so the
 * dropdown ordering is stable and sensible. Never surfaces UUIDs.
 */
export async function listOrgUnits(client: QueryClient): Promise<OrgUnitOption[]> {
  const { rows } = await client.query<{ code: string | null; name: string | null; category: string | null }>(
    `select code, name, category
       from public.unit_of_measure
      where org_id = app.current_org_id()
        and deleted_at is null
      order by category asc, is_base desc, code asc`,
  );
  return rows
    .map((r) => ({
      code: typeof r.code === 'string' ? r.code.trim() : '',
      name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : typeof r.code === 'string' ? r.code.trim() : '',
      category: typeof r.category === 'string' ? r.category : '',
    }))
    .filter((u) => u.code.length > 0);
}

async function hasPlanningPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
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

export async function hasPlanningWritePermission(ctx: OrgActionContext): Promise<boolean> {
  return hasPlanningPermission(ctx, PLANNING_WRITE_PERMISSION);
}

export async function hasPoManagePermission(ctx: OrgActionContext): Promise<boolean> {
  return hasPlanningPermission(ctx, PLANNING_PO_MANAGE_PERMISSION);
}

export async function hasToManagePermission(ctx: OrgActionContext): Promise<boolean> {
  return hasPlanningPermission(ctx, PLANNING_TO_MANAGE_PERMISSION);
}

export async function hasPlanningReadPermission(ctx: OrgActionContext): Promise<boolean> {
  return hasPlanningPermission(ctx, PLANNING_READ_PERMISSION);
}

/** Typed denial wrapper — mirrors NPD/technical action permission gates. */
export async function requireActionPermission(
  ctx: OrgActionContext,
  permission: string,
): Promise<{ ok: true } | { ok: false; error: 'forbidden' }> {
  if (!(await hasPlanningPermission(ctx, permission))) {
    return { ok: false, error: 'forbidden' };
  }
  return { ok: true };
}

export async function writeProcurementAudit(
  ctx: OrgActionContext,
  input: {
    action: string;
    resourceType: string;
    resourceId: string;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values
       ($1::uuid, $2::uuid, 'user', $3, $4, $5,
        $6::jsonb, $7::jsonb, $8::uuid, 'operational')`,
    [
      ctx.orgId,
      ctx.userId,
      input.action,
      input.resourceType,
      input.resourceId,
      input.beforeState ? JSON.stringify(input.beforeState) : null,
      input.afterState ? JSON.stringify(input.afterState) : null,
      randomUUID(),
    ],
  );
}

export function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

export function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toNullableIso(value: string | Date | null): string | null {
  return value === null ? null : toIso(value);
}

export function pgErrorToResult(err: unknown): ProcurementError {
  if (isPgError(err) && err.code === '23505') return 'already_exists';
  if (isPgError(err) && err.code === '23503') return 'not_found';
  if (isPgError(err) && err.code === '23514') return 'invalid_input';
  return 'persistence_failed';
}
