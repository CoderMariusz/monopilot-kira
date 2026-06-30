/**
 * NPD PACKAGING stage — shared (non-'use server') module.
 *
 * Holds zod schemas, discriminated-union types, and the audit helper used by the
 * packaging Server Actions. Per the `'use server'` export rule (MON-t2-api), a
 * `'use server'` file may only export async functions — so every non-async
 * export (schemas, types, the writeAudit helper) lives here and is imported by
 * the action files.
 *
 * Schema authority: packages/db/migrations/232-npd-packaging-components.sql
 *   public.packaging_components(tier 'primary'|'secondary', component_name,
 *   material, supplier_code, spec, cost_per_unit numeric(12,4),
 *   status 'approved'|'pending_artwork'|'draft', artwork_file_id, artwork_status,
 *   display_order, + audit cols). RLS via app.current_org_id().
 *
 * RBAC strings (BYTE-IDENTICAL to migration 236's grant array):
 *   read  → npd.packaging.read
 *   write → npd.packaging.write
 */

import { z } from 'zod';

// ─── Permission strings (exact — Gate-5 403 guard) ────────────────────────────
export const PACKAGING_READ_PERMISSION = 'npd.packaging.read';
export const PACKAGING_WRITE_PERMISSION = 'npd.packaging.write';

// ─── Domain enums (mirror the DB CHECK constraints) ───────────────────────────
export const PACKAGING_TIERS = ['primary', 'secondary'] as const;
export type PackagingTier = (typeof PACKAGING_TIERS)[number];

export const PACKAGING_STATUSES = ['approved', 'pending_artwork', 'draft'] as const;
export type PackagingStatus = (typeof PACKAGING_STATUSES)[number];

// NUMERIC-exact: cost_per_unit is accepted as a decimal STRING, bound ::numeric.
// Never a JS number (IEEE-754 drift corrupts money before Postgres). Optional.
const COST_DECIMAL = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'cost_per_unit must be a non-negative decimal string');

// ─── zod input schemas ────────────────────────────────────────────────────────
export const UpsertPackagingComponentSchema = z.object({
  // When omitted → INSERT; when present → UPDATE (must already belong to the org).
  id: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  itemId: z.string().uuid().optional().nullable(),
  tier: z.enum(PACKAGING_TIERS),
  componentName: z.string().trim().min(1).max(160),
  material: z.string().trim().max(240).optional().nullable(),
  supplierCode: z.string().trim().max(120).optional().nullable(),
  spec: z.string().trim().max(240).optional().nullable(),
  costPerUnit: COST_DECIMAL.optional().nullable(),
  // % of this packaging component lost to damage/setup during packing. Bounded
  // 0..100 (mirrors the DB CHECK on packaging_components.scrap_pct); coerced to a
  // number — unlike cost it carries no money-precision concern. The WO later
  // inflates required_qty by 1 / (1 - scrap_pct/100).
  scrapPct: z.coerce.number().min(0).max(100).default(0),
  qtyPerPack: z.coerce.number().positive().nullable().optional(),
  status: z.enum(PACKAGING_STATUSES).default('draft'),
  displayOrder: z.number().int().min(0).max(100000).optional(),
});
export type UpsertPackagingComponentInput = z.infer<typeof UpsertPackagingComponentSchema>;

export const DeletePackagingComponentSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
});
export type DeletePackagingComponentInput = z.infer<typeof DeletePackagingComponentSchema>;

export const ListPackagingComponentsSchema = z.object({
  projectId: z.string().uuid(),
});
export type ListPackagingComponentsInput = z.infer<typeof ListPackagingComponentsSchema>;

// ─── Read-model row (whitelisted columns only — never echo internal state) ─────
export type PackagingComponentRow = {
  id: string;
  tier: PackagingTier;
  componentName: string;
  material: string | null;
  supplierCode: string | null;
  spec: string | null;
  /** Decimal STRING (bound from NUMERIC) or null — never a JS float. */
  costPerUnit: string | null;
  /** % lost to damage/setup during packing (0..100). */
  scrapPct: number;
  qtyPerPack: number | null;
  status: PackagingStatus;
  artworkFileId: string | null;
  artworkStatus: string | null;
  displayOrder: number;
};

// ─── Discriminated-union results ──────────────────────────────────────────────
export type PackagingError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'persistence_failed';

export type ListPackagingResult =
  | { ok: true; data: PackagingComponentRow[] }
  | { ok: false; error: PackagingError; message?: string };

export type UpsertPackagingResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: PackagingError; message?: string };

export type DeletePackagingResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: PackagingError; message?: string };

// ─── Minimal client contract (lets the action body stay query-driver agnostic) ─
export type QueryResult<T> = { rows: T[]; rowCount?: number | null };
export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
};

/**
 * RBAC gate — checks BOTH the normalized role_permissions table AND the legacy
 * roles.permissions jsonb cache (migration 236 writes both). Returns true iff
 * any of the caller's roles in this org carries `permission`.
 */
export async function hasPermission(
  client: QueryClient,
  userId: string,
  orgId: string,
  permission: string,
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [userId, orgId, permission],
  );
  return rows.length > 0;
}

/**
 * Security/standard audit row in the SAME txn as the write (MON-t2-api rule:
 * a privileged mutation must leave an audit_log row). No outbox event is emitted
 * because there is no `npd.packaging.*` member in the outbox event-type enum SoT
 * (151) — same decision technical/cost + technical/items document.
 */
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
     values ($1::uuid, $2::uuid, 'user', $3, 'packaging_component', $4, $5::jsonb, $6::jsonb, 'standard')`,
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
