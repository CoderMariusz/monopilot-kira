import { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../../lib/scanner/guard';
import { auditAttempt, getWoId, scannerError, scannerOk, type RouteContext } from '../../_support';

type HeaderRow = {
  id: string;
  wo_number: string;
  status: string;
  item_code: string | null;
  product_name: string | null;
  planned_qty: string;
  qty_entered: string | null;
  qty_entered_uom: string | null;
  uom_snapshot: Record<string, unknown> | null;
  scheduled_start: Date | string | null;
  produced_base_kg: string;
  allergen_flag: boolean;
};

type MaterialRow = {
  id: string;
  material_name: string;
  required_qty: string;
  consumed_qty: string;
  uom: string;
  sequence: number;
};

type OutputRow = {
  output_type: string;
  qty_kg: string;
  qty_units: string | null;
  actual_weight_kg: string | null;
  count: string;
};

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function GET(request: NextRequest, context: RouteContext) {
  const woId = await getWoId(context);

  const result = await requireScannerSession(request, null, 'production.scanner.wos.detail', async ({ client, session }) => {
    try {
      const headerRes = await client.query<HeaderRow>(
        `select wo.id,
                wo.wo_number,
                case
                  when exec.status in ('in_progress', 'paused') then exec.status
                  when wo.status = 'RELEASED' then 'released'
                  else lower(wo.status)
                end as status,
                item.item_code,
                item.name as product_name,
                wo.planned_quantity::text as planned_qty,
                wo.qty_entered::text as qty_entered,
                wo.qty_entered_uom,
                wo.uom_snapshot,
                wo.scheduled_start_time as scheduled_start,
                coalesce((
                  select sum(out.qty_kg)::text
                    from public.wo_outputs out
                   where out.org_id = wo.org_id
                     and out.wo_id = wo.id
                     and out.qty_kg > 0
                ), '0') as produced_base_kg,
                (wo.allergen_profile_snapshot is not null and wo.allergen_profile_snapshot <> '{}'::jsonb) as allergen_flag
           from public.work_orders wo
           left join public.wo_executions exec
             on exec.wo_id = wo.id
            and exec.org_id = wo.org_id
           left join public.items item
             on item.id = wo.product_id
            and item.org_id = wo.org_id
          where wo.org_id = $1::uuid
            and wo.id = $2::uuid
            and (
              wo.status = 'RELEASED'
              or exec.status in ('in_progress', 'paused')
            )
            and ($3::uuid is null or wo.production_line_id = $3::uuid)
          limit 1`,
        [session.org_id, woId, session.line_id],
      );

      const header = headerRes.rows[0];
      if (!header) {
        await auditAttempt(client, session, 'production.scanner.wos.detail', 'not_found', { woId });
        return scannerError('not_found', 404);
      }

      const [materialsRes, outputsRes] = await Promise.all([
        client.query<MaterialRow>(
          `select id,
                  material_name,
                  required_qty::text as required_qty,
                  consumed_qty::text as consumed_qty,
                  uom,
                  sequence
             from public.wo_materials
            where org_id = $1::uuid
              and wo_id = $2::uuid
            order by sequence asc, material_name asc`,
          [session.org_id, woId],
        ),
        client.query<OutputRow>(
          `select output_type,
                  coalesce(sum(qty_kg), 0)::text as qty_kg,
                  sum(qty_units)::text as qty_units,
                  sum(actual_weight_kg)::text as actual_weight_kg,
                  count(*)::text as count
             from public.wo_outputs
            where org_id = $1::uuid
              and wo_id = $2::uuid
            group by output_type
            order by output_type asc`,
          [session.org_id, woId],
        ),
      ]);

      await auditAttempt(client, session, 'production.scanner.wos.detail', 'ok', { woId });
      return scannerOk({
        header: {
          id: header.id,
          woNumber: header.wo_number,
          status: header.status,
          itemCode: header.item_code,
          productName: header.product_name,
          plannedQty: header.planned_qty,
          qtyEntered: header.qty_entered,
          qtyEnteredUom: header.qty_entered_uom,
          uomSnapshot: header.uom_snapshot,
          scheduledStart: iso(header.scheduled_start),
          producedBaseKg: header.produced_base_kg,
          allergenFlag: header.allergen_flag,
        },
        materials: materialsRes.rows.map((row) => ({
          id: row.id,
          materialName: row.material_name,
          requiredQty: row.required_qty,
          consumedQty: row.consumed_qty,
          uom: row.uom,
          sequence: row.sequence,
        })),
        outputs: outputsRes.rows.map((row) => ({
          outputType: row.output_type,
          qtyKg: row.qty_kg,
          qtyUnits: row.qty_units,
          actualWeightKg: row.actual_weight_kg,
          count: row.count,
        })),
      });
    } catch (error) {
      await auditAttempt(client, session, 'production.scanner.wos.detail', 'error', {
        woId,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  if ('guardError' in result) return scannerError(result.error, result.status);
  return result;
}
