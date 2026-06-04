'use server';

/**
 * 03-technical · TEC-087 Tooling / Equipment Setup List (T-053): page-load action.
 *
 * "Tooling / equipment setups" are the real per-operation resource bindings that
 * already live in the routings data (migration 163: routings + routing_operations).
 * Each routing operation that binds a production line or machine and carries a
 * setup time IS an equipment setup — there is no separate `tooling_setups` table
 * in the schema, so this surface reads the canonical routing data rather than
 * inventing storage (red-line: do not invent fields beyond the prototype).
 *
 * Org-scoped read under withOrgContext + RLS (`app.current_org_id()`). No
 * service-role bypass, no hardcoded data. Read-only — the prototype index marks
 * `tooling_screen` as a read-only list-with-actions. NUMERIC `cost_per_hour` is
 * returned verbatim as a string (never via JS float on a cost).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  type OrgActionContext,
  type QueryClient,
  type ToolingSetupRow,
  TOOLING_WRITE_PERMISSION,
} from './shared';

export type ListToolingSetupsState = 'ready' | 'empty' | 'error';

export type ListToolingSetupsResult = {
  setups: ToolingSetupRow[];
  canWrite: boolean;
  state: ListToolingSetupsState;
};

type OpRow = {
  id: string;
  op_no: number;
  op_code: string;
  op_name: string;
  manufacturing_operation_name: string | null;
  setup_time_min: number;
  cost_per_hour: string | null;
  resource_kind: 'machine' | 'line' | null;
  resource_code: string | null;
  resource_name: string | null;
  item_code: string;
  item_name: string;
  routing_version: number;
  routing_status: string;
  updated_at: string | Date;
};

export async function listToolingSetups(): Promise<ListToolingSetupsResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListToolingSetupsResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };

      const [opResult, canWrite] = await Promise.all([
        // Every routing operation that binds a line OR a machine is an equipment
        // setup. We surface the resource (line/machine code+name), the setup time,
        // the operation name and the owning item so the list mirrors the prototype
        // tooling table (Code / Name / Type / ... / Updated / Status).
        qc.query<OpRow>(
          `select
             ro.id,
             ro.op_no,
             ro.op_code,
             ro.op_name,
             ro.manufacturing_operation_name,
             ro.setup_time_min,
             ro.cost_per_hour::text as cost_per_hour,
             case
               when ro.machine_id is not null then 'machine'
               when ro.line_id is not null then 'line'
               else null
             end as resource_kind,
             coalesce(m.code, pl.code) as resource_code,
             coalesce(m.name, pl.name) as resource_name,
             i.item_code,
             i.name as item_name,
             r.version as routing_version,
             r.status as routing_status,
             ro.updated_at
           from public.routing_operations ro
           join public.routings r
             on r.id = ro.routing_id and r.org_id = app.current_org_id()
           join public.items i
             on i.id = r.item_id and i.org_id = app.current_org_id()
           left join public.machines m
             on m.id = ro.machine_id and m.org_id = app.current_org_id()
           left join public.production_lines pl
             on pl.id = ro.line_id and pl.org_id = app.current_org_id()
           where ro.org_id = app.current_org_id()
             and (ro.machine_id is not null or ro.line_id is not null)
           order by i.item_code asc, r.version desc, ro.op_no asc`,
        ),
        hasPermission(ctx, TOOLING_WRITE_PERMISSION),
      ]);

      const setups: ToolingSetupRow[] = opResult.rows.map((row) => ({
        id: String(row.id),
        opCode: row.op_code,
        opName: row.op_name,
        manufacturingOperationName: row.manufacturing_operation_name,
        setupTimeMin: Number(row.setup_time_min),
        costPerHour: row.cost_per_hour,
        resourceKind: row.resource_kind,
        resourceCode: row.resource_code,
        resourceName: row.resource_name,
        itemCode: row.item_code,
        itemName: row.item_name,
        routingVersion: Number(row.routing_version),
        routingStatus: row.routing_status,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      }));

      return {
        setups,
        canWrite,
        state: setups.length ? 'ready' : 'empty',
      };
    });
  } catch (error) {
    console.error('[technical/tooling] listToolingSetups load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { setups: [], canWrite: false, state: 'error' };
  }
}
