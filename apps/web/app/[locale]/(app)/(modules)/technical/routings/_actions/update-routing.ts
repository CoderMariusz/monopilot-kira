'use server';

/**
 * 03-technical Routings CRUD (T-022): replace the operation set of a DRAFT
 * routing. Only `draft` routings are editable — an approved/active/superseded
 * routing is immutable (clone-on-write a new version instead, per the
 * never-mutate-an-approved-row red line). The full operation set is re-validated
 * (V-TEC-60..63) and atomically replaced.
 *
 * Gated on `technical.bom.create`.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from '../../items/_actions/revalidate';
import {
  findUnknownOperationName,
  hasPermission,
  isPgError,
  type OrgActionContext,
  type QueryClient,
  ROUTING_WRITE_PERMISSION,
  UpdateRoutingInput,
  type UpdateRoutingResult,
  validateOperationSet,
  writeAudit,
} from './shared';

export async function updateRouting(rawInput: unknown): Promise<UpdateRoutingResult> {
  const parsed = UpdateRoutingInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  const setCheck = validateOperationSet(input.operations);
  if (!setCheck.ok) return { ok: false, error: setCheck.error, message: setCheck.message };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<UpdateRoutingResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, ROUTING_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows: cur } = await qc.query<{ id: string; status: string }>(
        `select id, status from public.routings
          where org_id = app.current_org_id() and id = $1::uuid`,
        [input.routingId],
      );
      const routing = cur[0];
      if (!routing) return { ok: false, error: 'not_found' };
      if (routing.status !== 'draft') {
        return { ok: false, error: 'invalid_state', message: 'only a draft routing may be edited; clone a new version instead' };
      }

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

      // Replace the operation set atomically: delete the draft's ops, re-insert.
      // (Deleting OPERATION rows of a draft is allowed — the no-delete red line is
      // about superseding routing VERSIONS, not editing an unapproved draft.)
      await qc.query(
        `delete from public.routing_operations
          where org_id = app.current_org_id() and routing_id = $1::uuid`,
        [input.routingId],
      );
      for (const op of input.operations) {
        await qc.query(
          `insert into public.routing_operations
             (org_id, routing_id, op_no, op_code, op_name, line_id, machine_id,
              setup_time_min, run_time_per_unit_sec, cost_per_hour, manufacturing_operation_name, created_by)
           values
             (app.current_org_id(), $1::uuid, $2::integer, $3, $4, $5::uuid, $6::uuid,
              $7::integer, $8::numeric, $9::numeric, $10, $11::uuid)`,
          [
            input.routingId,
            op.opNo,
            op.opCode,
            op.opName,
            op.lineId ?? null,
            op.machineId ?? null,
            op.setupTimeMin,
            op.runTimePerUnitSec ?? null,
            op.costPerHour ?? null,
            op.manufacturingOperationName,
            userId,
          ],
        );
      }

      await writeAudit(qc, {
        orgId,
        actorUserId: userId,
        action: 'routing.operations_replaced',
        resourceId: input.routingId,
        beforeState: null,
        afterState: { operationCount: input.operations.length },
      });

      safeRevalidatePath('/technical/items');
      return { ok: true, data: { id: input.routingId } };
    });
  } catch (err) {
    if (isPgError(err) && (err.code === '23514' || err.code === '23503')) {
      return { ok: false, error: 'invalid_input' };
    }
    if (isPgError(err) && err.code === '23505') return { ok: false, error: 'already_exists' };
    console.error('[technical/routings] updateRouting persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
