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
 *   - V-TEC-61: each op has line_id OR machine_id (at least one).
 *   - V-TEC-62: run_time_per_unit_sec > 0 for production ops.
 *   - V-TEC-63: manufacturing_operation_name ∈ the manufacturing-operations
 *     reference (the canonical store is "Reference"."ManufacturingOperations",
 *     org-scoped, keyed by operation_name — checked in the service against the DB,
 *     never a hardcoded list).
 *
 * NUMERIC-exact: run_time_per_unit_sec NUMERIC(10,2) and cost_per_hour
 * NUMERIC(10,4) are bound as ::numeric — the cost preview (T-023) sums in SQL.
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
  | 'persistence_failed';

// ── Operation input ───────────────────────────────────────────────────────────
// NUMERIC values are accepted as string | number and ALWAYS bound ::numeric.
const NumericString = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
  .refine((v) => /^\d+(\.\d+)?$/.test(v), { message: 'must be a non-negative decimal' });

export const RoutingOperationInput = z.object({
  opNo: z.number().int().min(1),
  opCode: z.string().trim().min(1).max(64),
  opName: z.string().trim().min(1).max(256),
  lineId: z.string().uuid().optional().nullable(),
  machineId: z.string().uuid().optional().nullable(),
  setupTimeMin: z.number().int().min(0).optional().default(0),
  // run_time_per_unit_sec NUMERIC(10,2) — optional column, but V-TEC-62 requires
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
    lineId: string | null;
    machineId: string | null;
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
    // V-TEC-61: at least one of line_id / machine_id.
    if (!op.lineId && !op.machineId) {
      return {
        ok: false,
        error: 'v_tec_61_no_resource',
        message: `op ${op.opNo} must bind a line_id or machine_id (V-TEC-61)`,
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
