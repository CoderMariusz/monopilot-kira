/**
 * 03-technical Routings CRUD (T-022) + cost preview (T-023): shared zod schemas,
 * types, RBAC helper and the V-TEC-60..63 operation-set validator.
 *
 * Plain (non-`'use server'`) module. The `'use server'` action files import from
 * here. Mirrors technical/items/_actions/shared.ts + technical/cost shared.ts.
 *
 * Schema authority: packages/db/migrations/163-routings.sql.
 * Validation: PRD §12.5 V-TEC-ROUT.
 *   - V-TEC-60: op_no sequence contiguous starting at 1, no gaps.
 *   - V-TEC-61: each op has line_id (required).
 *   - V-TEC-62: run_time_per_unit_sec > 0 for production ops.
 *   - V-TEC-63: manufacturing_operation_name ∈ the manufacturing-operations
 *     reference (the canonical store is "Reference"."ManufacturingOperations",
 *     org-scoped, keyed by operation_name — checked in the service against the DB,
 *     never a hardcoded list).
 *   - V-TEC-64: every operation's production line belongs to the same site as the
 *     routing (and no two distinct line sites within one routing).
 *
 * NUMERIC-exact: run_time_per_unit_sec and cost_per_hour are numeric(18,6) —
 * bound as ::numeric; max 6 decimal places (migration 503).
 *
 * RBAC: there is NO dedicated `technical.routing.*` string in the PRD §3
 * `technical.*` family (Wave0 enum-lock — new strings are forbidden). Routings
 * are manufacturing-structure authoring owned by the same Quality Lead /
 * Technical Manager who owns BOM. So create/edit reuse `technical.bom.create`
 * and the approve/publish workflow reuses `technical.bom.approve`.
 */

import { z } from 'zod';
import { hasPermission } from '../../../../../../../lib/auth/has-permission';

export { hasPermission };

// ── RBAC permission strings (packages/rbac/src/permissions.enum.ts) ───────────
export const ROUTING_WRITE_PERMISSION = 'technical.bom.create';
export const ROUTING_APPROVE_PERMISSION = 'technical.bom.approve';

// ── Routing status enum (mirrors routings_status_check) ───────────────────────
export const ROUTING_STATUSES = ['draft', 'approved', 'active', 'superseded'] as const;
export type RoutingStatus = (typeof ROUTING_STATUSES)[number];

// "Production ops" are ops that consume run-time per unit. We treat every op as a
// production op for V-TEC-62 unless explicitly flagged non-production (e.g. a
// pure setup/changeover op). The flag defaults to true so the guard is strict.
export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

export type RoutingActionError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'already_exists'
  | 'invalid_state'
  // V-TEC-ROUT violations — mapped 1:1 so the API can surface the right 422 code.
  | 'v_tec_60_sequence_gap'
  | 'v_tec_61_no_resource'
  | 'v_tec_62_zero_run_time'
  | 'v_tec_63_unknown_operation'
  | 'v_tec_64_cross_site_lines'
  | 'persistence_failed';

// ── Operation input ───────────────────────────────────────────────────────────
// NUMERIC values are accepted as string | number and ALWAYS bound ::numeric.
const MAX_ROUTING_NUMERIC_DP = 6;

const NumericString = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
  .refine((v) => /^\d+(\.\d+)?$/.test(v), { message: 'must be a non-negative decimal' })
  .refine((v) => (v.split('.')[1] ?? '').length <= MAX_ROUTING_NUMERIC_DP, {
    message: `supports at most ${MAX_ROUTING_NUMERIC_DP} decimal places`,
  });

export const RoutingOperationInput = z.object({
  opNo: z.number().int().min(1),
  opCode: z.string().trim().min(1).max(64),
  opName: z.string().trim().min(1).max(256),
  lineId: z.string().uuid(),
  setupTimeMin: z.number().int().min(0).optional().default(0),
  // run_time_per_unit_sec numeric(18,6) — optional column, but V-TEC-62 requires
  // it > 0 for production ops (enforced in the service, not just zod).
  runTimePerUnitSec: NumericString.optional().nullable(),
  costPerHour: NumericString.optional().nullable(),
  manufacturingOperationName: z.string().trim().min(1).max(256),
  // When false, the op is a non-production op exempt from V-TEC-62 (> 0 run time).
  isProduction: z.boolean().optional().default(true),
});
export type RoutingOperationInputType = z.input<typeof RoutingOperationInput>;

// ── Create routing input ──────────────────────────────────────────────────────
export const CreateRoutingInput = z.object({
  itemId: z.string().uuid(),
  version: z.number().int().min(1).optional(),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'effective_from must be an ISO date (YYYY-MM-DD)')
    .optional(),
  operations: z.array(RoutingOperationInput).min(1, 'a routing needs at least one operation'),
});
export type CreateRoutingInputType = z.input<typeof CreateRoutingInput>;

export type CreateRoutingResult =
  | { ok: true; data: { id: string; itemId: string; version: number; status: RoutingStatus } }
  | { ok: false; error: RoutingActionError; message?: string };

// ── Update routing input (replace the operation set of a draft routing) ───────
export const UpdateRoutingInput = z.object({
  routingId: z.string().uuid(),
  operations: z.array(RoutingOperationInput).min(1),
});
export type UpdateRoutingInputType = z.input<typeof UpdateRoutingInput>;

export type UpdateRoutingResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: RoutingActionError; message?: string };

// ── Approve/publish routing input ─────────────────────────────────────────────
export const ApproveRoutingInput = z.object({ routingId: z.string().uuid() });
export type ApproveRoutingInputType = z.input<typeof ApproveRoutingInput>;

export type ApproveRoutingResult =
  | { ok: true; data: { id: string; status: RoutingStatus } }
  | { ok: false; error: RoutingActionError; message?: string };

// ── List routings input ───────────────────────────────────────────────────────
export const ListRoutingsInput = z.object({ itemId: z.string().uuid() });
export type ListRoutingsInputType = z.input<typeof ListRoutingsInput>;

export type RoutingSummary = {
  id: string;
  itemId: string;
  version: number;
  status: RoutingStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  operationCount: number;
  operations: Array<{
    opNo: number;
    opCode: string;
    opName: string;
    lineId: string;
    setupTimeMin: number;
    runTimePerUnitSec: string | null;
    costPerHour: string | null;
    manufacturingOperationName: string;
  }>;
};

export type ListRoutingsResult =
  | { ok: true; data: { routings: RoutingSummary[] } }
  | { ok: false; error: RoutingActionError; message?: string };

// ── V-TEC-60/61/62 — pure validation of an operation SET (no DB) ──────────────
// V-TEC-63 needs a DB lookup and is checked in the service.
export type ParsedOperation = z.infer<typeof RoutingOperationInput>;

export function validateOperationSet(
  ops: readonly ParsedOperation[],
): { ok: true } | { ok: false; error: RoutingActionError; message: string } {
  // V-TEC-60: op_no contiguous starting at 1, no gaps, no duplicates.
  const sorted = [...ops].sort((a, b) => a.opNo - b.opNo);
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i]!.opNo !== i + 1) {
      return {
        ok: false,
        error: 'v_tec_60_sequence_gap',
        message: `op_no must be contiguous from 1 (V-TEC-60); got [${sorted.map((o) => o.opNo).join(',')}]`,
      };
    }
  }

  for (const op of sorted) {
    // V-TEC-61: line_id required.
    if (!op.lineId) {
      return {
        ok: false,
        error: 'v_tec_61_no_resource',
        message: `op ${op.opNo} must bind a line_id (V-TEC-61)`,
      };
    }
    // V-TEC-62: run_time_per_unit_sec > 0 for production ops.
    if (op.isProduction) {
      const rt = op.runTimePerUnitSec;
      if (rt === null || rt === undefined || Number(rt) <= 0) {
        return {
          ok: false,
          error: 'v_tec_62_zero_run_time',
          message: `op ${op.opNo} run_time_per_unit_sec must be > 0 for a production op (V-TEC-62)`,
        };
      }
    }
  }

  return { ok: true };
}

export function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

// V-TEC-63 — the manufacturing_operation_name of every op must exist in the
// org's manufacturing-operations reference. The canonical store is
// "Reference"."ManufacturingOperations" (migration 012), org-scoped under RLS and
// keyed by operation_name. Returns the first unknown name, or null when all valid.
export async function findUnknownOperationName(
  client: QueryClient,
  names: readonly string[],
): Promise<string | null> {
  const distinct = [...new Set(names)];
  if (distinct.length === 0) return null;
  const { rows } = await client.query<{ operation_name: string }>(
    `select operation_name
       from "Reference"."ManufacturingOperations"
      where org_id = app.current_org_id()
        and is_active = true
        and operation_name = any($1::text[])`,
    [distinct],
  );
  const known = new Set(rows.map((r) => r.operation_name));
  for (const name of distinct) {
    if (!known.has(name)) return name;
  }
  return null;
}

// V-TEC-64 — every bound production line must share one site scope with the
// routing header. Wave0 rule: org-wide lines (site_id NULL) are allowed only
// when ALL operations use org-wide lines; mixing site-assigned and org-wide
// lines is rejected. When the routing header pins site_id, every line must
// match exactly (no NULL-site lines).
export async function validateOperationLineSiteScope(
  client: QueryClient,
  lineIds: readonly string[],
  routingSiteId?: string | null,
): Promise<
  | { ok: true; canonicalSiteId: string | null }
  | { ok: false; error: 'v_tec_64_cross_site_lines'; message: string }
> {
  const distinctLineIds = [...new Set(lineIds.filter(Boolean))];
  if (distinctLineIds.length === 0) {
    return {
      ok: false,
      error: 'v_tec_64_cross_site_lines',
      message: 'routing operations must bind at least one production line (V-TEC-61)',
    };
  }

  const { rows } = await client.query<{ id: string; site_id: string | null }>(
    `select pl.id::text as id, pl.site_id::text as site_id
       from public.production_lines pl
      where pl.org_id = app.current_org_id()
        and pl.id = any($1::uuid[])`,
    [distinctLineIds],
  );
  if (rows.length !== distinctLineIds.length) {
    return {
      ok: false,
      error: 'v_tec_64_cross_site_lines',
      message: 'one or more production lines were not found in this org (V-TEC-64)',
    };
  }

  const nullSiteLineCount = rows.filter((row) => row.site_id == null).length;
  const nonNullSites = new Set(rows.map((row) => row.site_id).filter((siteId): siteId is string => siteId != null));

  if (nonNullSites.size > 1) {
    return {
      ok: false,
      error: 'v_tec_64_cross_site_lines',
      message: 'all routing operations must use production lines from a single site (V-TEC-64)',
    };
  }

  if (nullSiteLineCount > 0 && nonNullSites.size > 0) {
    return {
      ok: false,
      error: 'v_tec_64_cross_site_lines',
      message:
        'routing operations cannot mix site-assigned and org-wide production lines (V-TEC-64)',
    };
  }

  const canonicalSiteId = nonNullSites.size === 1 ? [...nonNullSites][0]! : null;

  if (routingSiteId) {
    for (const row of rows) {
      if (row.site_id !== routingSiteId) {
        return {
          ok: false,
          error: 'v_tec_64_cross_site_lines',
          message: `production line ${row.id} must belong to site ${routingSiteId} (V-TEC-64)`,
        };
      }
    }
  }

  return { ok: true, canonicalSiteId: routingSiteId ?? canonicalSiteId };
}

export async function assertRoutingSiteScopeForApproval(
  client: QueryClient,
  routingId: string,
): Promise<
  | { ok: true; canonicalSiteId: string | null }
  | { ok: false; error: RoutingActionError; message: string }
> {
  const { rows: headerRows } = await client.query<{ site_id: string | null }>(
    `select r.site_id::text as site_id
       from public.routings r
      where r.org_id = app.current_org_id()
        and r.id = $1::uuid`,
    [routingId],
  );
  const header = headerRows[0];
  if (!header) return { ok: false, error: 'not_found', message: 'routing not found' };

  const { rows: opRows } = await client.query<{ line_id: string }>(
    `select ro.line_id::text as line_id
       from public.routing_operations ro
      where ro.org_id = app.current_org_id()
        and ro.routing_id = $1::uuid
        and ro.line_id is not null
      order by ro.op_no`,
    [routingId],
  );

  const siteCheck = await validateOperationLineSiteScope(
    client,
    opRows.map((row) => row.line_id),
    header.site_id,
  );
  if (!siteCheck.ok) return siteCheck;
  return { ok: true, canonicalSiteId: siteCheck.canonicalSiteId };
}

// audit_log only (no technical.routing.* outbox event in the enum SoT — same
// decision as items/cost). resource_type = 'routing'.
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
     values ($1::uuid, $2::uuid, 'user', $3, 'routing', $4, $5::jsonb, $6::jsonb, 'standard')`,
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
