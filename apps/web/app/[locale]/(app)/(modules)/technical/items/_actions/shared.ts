/**
 * Lane A — 03-technical Items Master CRUD: shared zod schemas, types and the
 * RBAC permission-check helper used by the create / update / deactivate /
 * list Server Actions.
 *
 * This is a plain (non-`'use server'`) module so it may export non-async values
 * (zod schemas, types, the permission helper). The `'use server'` action files
 * import from here. Mirrors the FA actions' `errors.ts` split and the settings
 * units `_actions/manage-units.ts` validation conventions.
 *
 * Schema authority: packages/db/migrations/153-items-master.sql +
 * packages/db/schema/items.ts. Every enum / NUMERIC precision / length below is
 * copied 1:1 from the table's CHECK constraints so a client never relies on the
 * DB to reject a clearly-invalid value.
 *
 * RBAC: the `technical.items.*` family is seeded to the org-admin role family by
 * migration 154 (`seed_technical_permissions_for_org`). The deployed admin is on
 * `org.access.admin`, which migration 154 grants — so the gate resolves for it.
 */

import { z } from 'zod';

// ── RBAC permission strings (packages/rbac/src/permissions.enum.ts) ───────────
export const ITEMS_CREATE_PERMISSION = 'technical.items.create';
export const ITEMS_EDIT_PERMISSION = 'technical.items.edit';
export const ITEMS_DEACTIVATE_PERMISSION = 'technical.items.deactivate';

export const APP_VERSION = 'technical-items-v1';

// ── Enums (mirror items_*_check CHECK constraints in migration 153) ───────────
export const ITEM_TYPES = ['rm', 'intermediate', 'fg', 'co_product', 'byproduct'] as const;
export const ITEM_STATUSES = ['draft', 'active', 'deprecated', 'blocked'] as const;
export const WEIGHT_MODES = ['fixed', 'catch'] as const;
export const SHELF_LIFE_MODES = ['use_by', 'best_before'] as const;

export type ItemType = (typeof ITEM_TYPES)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type WeightMode = (typeof WEIGHT_MODES)[number];

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

export type ItemsActionError =
  | 'invalid_input'
  | 'forbidden'
  | 'already_exists'
  | 'not_found'
  | 'persistence_failed';

// ── List row shape returned to the page ───────────────────────────────────────
export type ItemListItem = {
  id: string;
  itemCode: string;
  name: string;
  itemType: ItemType;
  status: ItemStatus;
  uomBase: string;
  weightMode: WeightMode;
  costPerKg: string | null;
  updatedAt: string;
};

// ── Create input ──────────────────────────────────────────────────────────────
// item_code unique per (org_id, item_code). The required L3 fields are the
// NOT-NULL columns without a default: item_code, item_type, name, uom_base.
export const CreateItemInput = z.object({
  itemCode: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, 'item_code must be alphanumeric with . _ - separators'),
  name: z.string().trim().min(1).max(256),
  itemType: z.enum(ITEM_TYPES),
  status: z.enum(ITEM_STATUSES).optional().default('active'),
  uomBase: z.string().trim().min(1).max(32),
  weightMode: z.enum(WEIGHT_MODES).optional().default('fixed'),
  description: z.string().trim().max(2000).optional(),
  productGroup: z.string().trim().max(128).optional(),
  uomSecondary: z.string().trim().max(32).optional(),
  // numeric(18,6) cost_per_kg >= 0
  costPerKg: z.coerce.number().nonnegative().finite().optional(),
  // numeric(5,2) in [0,100]
  varianceTolerancePct: z.coerce.number().min(0).max(100).optional(),
  shelfLifeDays: z.coerce.number().int().nonnegative().optional(),
  shelfLifeMode: z.enum(SHELF_LIFE_MODES).optional(),
});
export type CreateItemInputType = z.input<typeof CreateItemInput>;

export type CreateItemResult =
  | { ok: true; data: { id: string; itemCode: string } }
  | { ok: false; error: ItemsActionError; message?: string };

// ── Update input ──────────────────────────────────────────────────────────────
// item_code is immutable here (it is the org-scoped natural key); update mutates
// the descriptive + commercial attributes only.
export const UpdateItemInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(256),
  itemType: z.enum(ITEM_TYPES),
  status: z.enum(ITEM_STATUSES),
  uomBase: z.string().trim().min(1).max(32),
  weightMode: z.enum(WEIGHT_MODES),
  description: z.string().trim().max(2000).optional(),
  productGroup: z.string().trim().max(128).optional(),
  uomSecondary: z.string().trim().max(32).optional(),
  costPerKg: z.coerce.number().nonnegative().finite().optional(),
  varianceTolerancePct: z.coerce.number().min(0).max(100).optional(),
  shelfLifeDays: z.coerce.number().int().nonnegative().optional(),
  shelfLifeMode: z.enum(SHELF_LIFE_MODES).optional(),
});
export type UpdateItemInputType = z.input<typeof UpdateItemInput>;

export type UpdateItemResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: ItemsActionError; message?: string };

// ── Deactivate input ──────────────────────────────────────────────────────────
// "Deactivate" = move status to 'blocked' (the closest non-destructive lifecycle
// terminal in items_status_check; the table has no soft-delete column). Idempotent.
export const DeactivateItemInput = z.object({ id: z.string().uuid() });
export type DeactivateItemInputType = z.input<typeof DeactivateItemInput>;

export type DeactivateItemResult =
  | { ok: true; data: { id: string; status: ItemStatus } }
  | { ok: false; error: ItemsActionError; message?: string };

// ── RBAC helper — resolves a permission for the caller, org-scoped under RLS ───
// Checks BOTH the normalized role_permissions table AND the legacy
// roles.permissions jsonb cache, because migration 154 writes to both and some
// older orgs only carry the jsonb form. Mirrors create-fa.ts hasPermission().
export async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
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

export function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

// audit_log.action has no enum constraint (unlike outbox_events.event_type, whose
// CHECK has no item.* member). We therefore record items writes in audit_log only;
// adding outbox item.* events would require extending the outbox enum SoT
// (packages/outbox/src/events.enum.ts) + its drift gate — out of scope for Lane A.
export async function writeAudit(
  client: QueryClient,
  params: {
    orgId: string;
    actorUserId: string;
    action: string;
    resourceId: string;
    beforeState: unknown;
    afterState: unknown;
  },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'item', $4, $5::jsonb, $6::jsonb, 'standard')`,
    [
      params.orgId,
      params.actorUserId,
      params.action,
      params.resourceId,
      JSON.stringify(params.beforeState),
      JSON.stringify(params.afterState),
    ],
  );
}
