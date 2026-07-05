'use server';

/**
 * 03-technical Routings CRUD (T-022): create a routing (draft) with its
 * operations, validating V-TEC-60..63.
 *
 * Gated on `technical.bom.create` (routings are manufacturing-structure
 * authoring — see shared.ts RBAC note). Runs inside withOrgContext so RLS scopes
 * every statement to the caller's org. The routing header + all operation rows
 * are written in the SAME transaction (atomic), so a V-TEC failure mid-insert
 * leaves no partial routing.
 *
 * Supersede pattern (same as BOMs): a new routing starts at `status='draft'`. We
 * NEVER delete routing rows — versions are superseded, never hard-deleted.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { z } from 'zod';
import { safeRevalidatePath } from '../../items/_actions/revalidate';
import {
  CreateRoutingInput,
  type CreateRoutingResult,
  findUnknownOperationName,
  hasPermission,
  isPgError,
  type OrgActionContext,
  type QueryClient,
  RoutingOperationInput,
  ROUTING_WRITE_PERMISSION,
  validateOperationSet,
  writeAudit,
} from './shared';

const RoutingCrewMemberInput = z.object({
  roleGroup: z.string().trim().min(1).max(128),
  headcount: z.number().int().positive(),
});

const CreateRoutingActionInput = CreateRoutingInput.extend({
  operations: z.array(
    RoutingOperationInput.omit({ costPerHour: true }).extend({
      crew: z.array(RoutingCrewMemberInput).optional().default([]),
      yieldPct: z
        .union([z.string(), z.number()])
        .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
        .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0 && Number(v) <= 100, {
          message: 'yieldPct must be > 0 and <= 100',
        })
        .optional()
        .default('100'),
    }),
  ).min(1, 'a routing needs at least one operation'),
});

export async function createRouting(rawInput: unknown): Promise<CreateRoutingResult> {
  const parsed = CreateRoutingActionInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  // V-TEC-60/61/62 — pure validation before opening a DB transaction.
  const setCheck = validateOperationSet(input.operations);
  if (!setCheck.ok) return { ok: false, error: setCheck.error, message: setCheck.message };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<CreateRoutingResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, ROUTING_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      // Item must exist in the caller's org (RLS-scoped).
      const { rows: itemRows } = await qc.query<{ id: string }>(
        `select id from public.items where org_id = app.current_org_id() and id = $1::uuid`,
        [input.itemId],
      );
      if (!itemRows[0]) return { ok: false, error: 'not_found' };

      // V-TEC-63 — every manufacturing_operation_name must exist in the org's
      // manufacturing-operations reference. DB lookup, never a hardcoded list.
      const unknown = await findUnknownOperationName(
        qc,
        input.operations.map((o) => o.manufacturingOperationName),
      );
      if (unknown !== null) {
        return {
          ok: false,
          error: 'v_tec_63_unknown_operation',
          message: `manufacturing_operation_name '${unknown}' is not in the manufacturing-operations reference (V-TEC-63)`,
        };
      }

      // Determine the next version when not supplied: max(version)+1 for the item.
      let version = input.version ?? null;
      if (version === null) {
        const { rows: vrows } = await qc.query<{ next_version: number }>(
          `select coalesce(max(version), 0) + 1 as next_version
             from public.routings
            where org_id = app.current_org_id() and item_id = $1::uuid`,
          [input.itemId],
        );
        version = Number(vrows[0]?.next_version ?? 1);
      }

      // Insert the routing header (draft).
      const effFromExpr = input.effectiveFrom ? '$3::date' : 'current_date';
      const headerParams: unknown[] = input.effectiveFrom
        ? [input.itemId, version, input.effectiveFrom, userId]
        : [input.itemId, version, userId];
      const { rows: hdr } = await qc.query<{ id: string; status: string }>(
        `insert into public.routings
           (org_id, item_id, version, status, effective_from, created_by)
         values
           (app.current_org_id(), $1::uuid, $2::integer, 'draft', ${effFromExpr}, ${input.effectiveFrom ? '$4' : '$3'}::uuid)
         returning id, status`,
        headerParams,
      );
      const routing = hdr[0];
      if (!routing) return { ok: false, error: 'persistence_failed' };

      // Insert every operation row in the same transaction.
      for (const op of input.operations) {
        await qc.query(
          `insert into public.routing_operations
             (org_id, routing_id, op_no, op_code, op_name, line_id, machine_id,
              setup_time_min, run_time_per_unit_sec, manufacturing_operation_name, crew, yield_pct, created_by)
           values
             (app.current_org_id(), $1::uuid, $2::integer, $3, $4, $5::uuid, $6::uuid,
              $7::integer, $8::numeric, $9, $10::jsonb, $11::numeric, $12::uuid)`,
          [
            routing.id,
            op.opNo,
            op.opCode,
            op.opName,
            op.lineId ?? null,
            op.machineId ?? null,
            op.setupTimeMin,
            op.runTimePerUnitSec ?? null,
            op.manufacturingOperationName,
            JSON.stringify(op.crew.map((member) => ({ role_group: member.roleGroup, headcount: member.headcount }))),
            op.yieldPct,
            userId,
          ],
        );
      }

      await writeAudit(qc, {
        orgId,
        actorUserId: userId,
        action: 'routing.created',
        resourceId: routing.id,
        beforeState: null,
        afterState: { itemId: input.itemId, version, operationCount: input.operations.length },
      });

      safeRevalidatePath('/technical/routings');
      return { ok: true, data: { id: routing.id, itemId: input.itemId, version: version!, status: 'draft' } };
    });
  } catch (err) {
    // 23505 = routings_org_item_version_unique or routing_operations_routing_op_no_unique.
    if (isPgError(err) && err.code === '23505') return { ok: false, error: 'already_exists' };
    // 23514 = a CHECK (setup/run/cost nonnegative); 23503 = bad line/machine FK.
    if (isPgError(err) && (err.code === '23514' || err.code === '23503')) {
      return { ok: false, error: 'invalid_input' };
    }
    console.error('[technical/routings] createRouting persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
