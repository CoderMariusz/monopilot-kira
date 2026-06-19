/**
 * 03-technical Cost History (T-021): shared zod schemas, types, RBAC helper.
 *
 * Plain (non-`'use server'`) module — exports zod schemas, types and the
 * permission helper. The `'use server'` action files import from here. Mirrors
 * technical/items/_actions/shared.ts.
 *
 * Schema authority: packages/db/migrations/160-item-cost-history.sql.
 * Validation rules: PRD §11.6 V-TEC-50..53.
 *   - V-TEC-50: cost_per_kg >= 0 (block negative).
 *   - V-TEC-51: effective_from <= current date (no future-dating the active row).
 *   - V-TEC-52: currency ∈ ISO 4217 supported list.
 *   - V-TEC-53: cost change > 20% requires an approver — but ONLY when source ∈
 *     {manual, supplier_update}. d365_sync and variance_roll bypass V-TEC-53.
 *
 * NUMERIC-exact: NO float is used in any cost comparison or history-close math.
 * The >20% delta test and the effective_to close are computed in SQL against
 * NUMERIC / DATE columns so JS binary floating point never touches a cost value.
 *
 * DUAL-OWNED with 10-finance: this module writes ONLY items.cost_per_kg +
 * item_cost_history (Technical's master cost + history). It NEVER writes Finance
 * standard-cost / valuation / variance tables.
 */

import { z } from 'zod';

import { isIso4217Currency } from '../../../../../../../lib/shared/iso4217';

// ── RBAC permission string (packages/rbac/src/permissions.enum.ts) ────────────
export const COST_EDIT_PERMISSION = 'technical.cost.edit';

// ── Cost source enum (mirrors item_cost_history_source_check) ─────────────────
export const COST_SOURCES = ['manual', 'd365_sync', 'supplier_update', 'variance_roll'] as const;
export type CostSource = (typeof COST_SOURCES)[number];

// Sources that are subject to the >20% high-variance approver guard (V-TEC-53).
// d365_sync + variance_roll are system rolls and bypass the guard.
export const APPROVER_GUARDED_SOURCES: ReadonlySet<CostSource> = new Set(['manual', 'supplier_update']);

// High-variance threshold (V-TEC-53). Kept as a string so the comparison stays
// in SQL NUMERIC space — never parsed into a JS float for the actual test.
export const HIGH_VARIANCE_RATIO = '0.20';

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

export type CostActionError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'approver_required'
  | 'persistence_failed';

// ── Cost history row shape returned to the page (NUMERIC stays string) ────────
export type CostHistoryRow = {
  id: string;
  itemId: string;
  /** NUMERIC(10,4) — returned as a string to preserve exactness (no float). */
  costPerKg: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: CostSource | null;
  createdBy: string | null;
  createdAt: string;
};

// ── POST cost input ───────────────────────────────────────────────────────────
// NUMERIC(10,4): cost_per_kg is accepted as a string OR number from the client,
// but is ALWAYS bound to the DB as ::numeric — the string form is preferred so a
// caller can send an exact decimal that survives JSON without float rounding.
//
// V-TEC-50 (>= 0) is enforced both here (fast client-side reject) and by the
// item_cost_history_cost_per_kg_nonnegative_check CHECK constraint.
export const CostPerKgInput = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
  .refine((v) => /^\d+(\.\d+)?$/.test(v), {
    message: 'cost_per_kg must be a non-negative decimal (V-TEC-50)',
  });

export const PostCostInput = z.object({
  itemId: z.string().uuid(),
  costPerKg: CostPerKgInput,
  // V-TEC-52: ISO 4217. CHAR(3) in the DB; upper-cased + validated here.
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((v) => v.toUpperCase())
    .refine((v) => isIso4217Currency(v), { message: 'currency must be an ISO 4217 code (V-TEC-52)' })
    .optional()
    .default('PLN'),
  // V-TEC-51: effective_from <= current date. Defaults to today (the active row).
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'effective_from must be an ISO date (YYYY-MM-DD)')
    .optional(),
  source: z.enum(COST_SOURCES),
  // Free-text reason persisted in the audit trail; required for manual edits.
  notes: z.string().trim().max(2000).optional(),
  // Presence of an approver (e.g. an X-Approver header / approver user id) is what
  // satisfies V-TEC-53 for a high-variance manual/supplier_update change.
  approverUserId: z.string().uuid().optional(),
});
export type PostCostInputType = z.input<typeof PostCostInput>;

export type PostCostResult =
  | { ok: true; data: { id: string; itemId: string; itemCode: string; costPerKg: string; effectiveFrom: string } }
  | { ok: false; error: CostActionError; message?: string };

// ── GET history input ─────────────────────────────────────────────────────────
export const ListCostHistoryInput = z.object({ itemId: z.string().uuid() });
export type ListCostHistoryInputType = z.input<typeof ListCostHistoryInput>;

export type ListCostHistoryResult =
  | { ok: true; data: { rows: CostHistoryRow[] } }
  | { ok: false; error: CostActionError; message?: string };

// ── RBAC helper — resolves a permission for the caller, org-scoped under RLS ───
// Mirrors technical/items/_actions/shared.ts hasPermission(): checks both the
// normalized role_permissions table AND the legacy roles.permissions jsonb cache.
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

// audit_log.action has no enum constraint, and the outbox event-type SoT
// (packages/db/migrations/151-outbox-event-type-enum-sot.sql) has no
// technical.cost.* member — so cost writes are recorded in audit_log only, the
// same decision technical/items/_actions/shared.ts documents. Adding a
// technical.cost.* outbox event would require extending the enum SoT + its drift
// gate, which is out of scope for the cost endpoints task.
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
     values ($1::uuid, $2::uuid, 'user', $3, 'item_cost', $4, $5::jsonb, $6::jsonb, 'standard')`,
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
