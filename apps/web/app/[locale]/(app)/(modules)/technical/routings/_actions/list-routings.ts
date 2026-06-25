'use server';

/**
 * 03-technical Routings CRUD (T-022): list the routing versions for an item.
 *
 * Org-scoped read under withOrgContext + RLS. Returns each version with its
 * status, effective range and operation count, ordered by version DESC. Gated on
 * `technical.bom.create` (the routing-authoring surface).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  ListRoutingsInput,
  type ListRoutingsResult,
  type OrgActionContext,
  type QueryClient,
  ROUTING_WRITE_PERMISSION,
  type RoutingStatus,
  type RoutingSummary,
} from './shared';

type RoutingRow = {
  id: string;
  item_id: string;
  version: number;
  status: string;
  effective_from: string;
  effective_to: string | null;
  operation_count: string | number;
  operations: Array<{
    op_no: number;
    op_code: string;
    op_name: string;
    line_id: string | null;
    machine_id: string | null;
    setup_time_min: number;
    run_time_per_unit_sec: string | null;
    cost_per_hour: string | null;
    manufacturing_operation_name: string;
  }> | null;
};

const STATUS_SET = new Set<RoutingStatus>(['draft', 'approved', 'active', 'superseded']);

function mapRow(row: RoutingRow): RoutingSummary {
  return {
    id: String(row.id),
    itemId: String(row.item_id),
    version: Number(row.version),
    status: STATUS_SET.has(row.status as RoutingStatus) ? (row.status as RoutingStatus) : 'draft',
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    operationCount: Number(row.operation_count),
    operations: (row.operations ?? []).map((op) => ({
      opNo: Number(op.op_no),
      opCode: op.op_code,
      opName: op.op_name,
      lineId: op.line_id,
      machineId: op.machine_id,
      setupTimeMin: Number(op.setup_time_min),
      runTimePerUnitSec: op.run_time_per_unit_sec,
      costPerHour: op.cost_per_hour,
      manufacturingOperationName: op.manufacturing_operation_name,
    })),
  };
}

export async function listRoutings(rawInput: unknown): Promise<ListRoutingsResult> {
  const parsed = ListRoutingsInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListRoutingsResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, ROUTING_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows } = await qc.query<RoutingRow>(
        `select r.id,
                r.item_id,
                r.version,
                r.status,
                r.effective_from::text as effective_from,
                r.effective_to::text as effective_to,
                (select count(*) from public.routing_operations o
                  where o.org_id = app.current_org_id() and o.routing_id = r.id) as operation_count,
                coalesce(
                  (select jsonb_agg(
                            jsonb_build_object(
                              'op_no', o.op_no,
                              'op_code', o.op_code,
                              'op_name', o.op_name,
                              'line_id', o.line_id,
                              'machine_id', o.machine_id,
                              'setup_time_min', o.setup_time_min,
                              'run_time_per_unit_sec', o.run_time_per_unit_sec::text,
                              'cost_per_hour', o.cost_per_hour::text,
                              'manufacturing_operation_name', o.manufacturing_operation_name
                            )
                            order by o.op_no
                          )
                     from public.routing_operations o
                    where o.org_id = app.current_org_id()
                      and o.routing_id = r.id),
                  '[]'::jsonb
                ) as operations
           from public.routings r
          where r.org_id = app.current_org_id()
            and r.item_id = $1::uuid
          order by r.version desc`,
        [input.itemId],
      );

      return { ok: true, data: { routings: rows.map(mapRow) } };
    });
  } catch (error) {
    console.error('[technical/routings] listRoutings load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
