/**
 * T-046 — 03-technical Shelf Life Config (TEC-030): shared zod schemas, types
 * and the RBAC permission helper used by the list + override Server Actions.
 *
 * Plain (non-`'use server'`) module so it may export non-async values.
 *
 * Backing store: shelf-life is Technical-owned and stored directly on the item
 * master (`public.items.shelf_life_days` / `shelf_life_mode` / `date_code_format`
 * from migration 153). There is NO separate shelf-life table — the per-FG config
 * is item-level columns, so this feature needs NO new migration. The override
 * write reuses the `technical.items.edit` RBAC permission (the same gate that the
 * Items master CRUD uses) and audit-logs the change.
 *
 * Red lines honoured:
 *   - FG is canonical; no `FA*` identifiers introduced.
 *   - shelf_life_mode is constrained to the migration-153 enum (use_by | best_before).
 *   - d365 is never a hard FK (no d365 reference here).
 */

import { z } from 'zod';

// ── RBAC permission string (packages/rbac/src/permissions.enum.ts) ────────────
// Shelf-life is item-level config; editing it is gated by the item-edit family
// that migration 154 seeds to the org-admin role family.
export const ITEMS_EDIT_PERMISSION = 'technical.items.edit';

// ── Enums (mirror items_shelf_life_mode_check in migration 153) ───────────────
export const SHELF_LIFE_MODES = ['use_by', 'best_before'] as const;
export type ShelfLifeMode = (typeof SHELF_LIFE_MODES)[number];

// ── Date-code presets (TEC-030 §9.2 — validation patterns for code preview) ───
// YYWW | YYYY-MM-DD | JJWW (Julian week) | YYJJJ (Julian day) | custom regex.
export const DATE_CODE_FORMATS = ['YYWW', 'YYYY-MM-DD', 'JJWW', 'YYJJJ', 'custom'] as const;
export type DateCodeFormat = (typeof DATE_CODE_FORMATS)[number];

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

export type ShelfLifeActionError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'persistence_failed';

// ── List row shape returned to the page ───────────────────────────────────────
export type ShelfLifeConfigRow = {
  id: string;
  itemCode: string;
  name: string;
  /** null when no shelf-life rule has been configured for this FG yet. */
  shelfLifeDays: number | null;
  shelfLifeMode: ShelfLifeMode | null;
  dateCodeFormat: string | null;
  productGroup: string | null;
  updatedAt: string;
};

// ── Override input ────────────────────────────────────────────────────────────
// An override leaves the regulatory preset — it requires a reason (audit-logged,
// min 10 chars, mirroring the prototype ShelfLifeOverrideModal). newDays > 0 and
// shelf_life_mode must stay inside the migration-153 enum.
export const ShelfLifeOverrideInput = z.object({
  id: z.string().uuid(),
  shelfLifeDays: z.coerce.number().int().positive(),
  shelfLifeMode: z.enum(SHELF_LIFE_MODES),
  dateCodeFormat: z.string().trim().max(64).optional(),
  reason: z.string().trim().min(10, 'A reason of at least 10 characters is required').max(2000),
});
export type ShelfLifeOverrideInputType = z.input<typeof ShelfLifeOverrideInput>;

export type ShelfLifeOverrideResult =
  | { ok: true; data: { id: string; shelfLifeDays: number; shelfLifeMode: ShelfLifeMode } }
  | { ok: false; error: ShelfLifeActionError; message?: string };

// ── RBAC helper — resolves a permission for the caller, org-scoped under RLS ───
// Mirrors items/_actions/shared.ts hasPermission(): checks BOTH the normalized
// role_permissions table AND the legacy roles.permissions jsonb cache.
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

// ── Date-code preview (TEC-030 — renders a sample code for "today") ───────────
// Pure, deterministic, no I/O. The page/modal calls this to show what a date code
// will look like for the chosen format. Used by tests for the YYWW assertion.
function isoWeek(date: Date): number {
  // ISO-8601 week number. Copy the date to avoid mutating the caller's value.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

export function previewDateCode(format: string, now: Date = new Date()): string {
  const yy = String(now.getFullYear()).slice(-2);
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const ww = String(isoWeek(now)).padStart(2, '0');
  const jjj = String(dayOfYear(now)).padStart(3, '0');

  switch (format) {
    case 'YYWW':
      return `${yy}${ww}`;
    case 'YYYY-MM-DD':
      return `${yyyy}-${mm}-${dd}`;
    case 'JJWW':
      // Julian-year (2-digit) + ISO week.
      return `${yy}${ww}`;
    case 'YYJJJ':
      return `${yy}${jjj}`;
    default:
      // custom / unknown: echo the literal pattern so the user sees their input.
      return format;
  }
}

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
