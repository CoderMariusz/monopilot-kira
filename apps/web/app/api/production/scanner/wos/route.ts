import { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../lib/scanner/guard';
import { auditAttempt, scannerError, scannerOk } from '../_support';

type WoListRow = {
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
  line_id: string | null;
  line_code: string | null;
};

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function GET(request: NextRequest) {
  const result = await requireScannerSession(request, null, 'production.scanner.wos.list', async ({ client, session }) => {
    try {
      const { rows } = await client.query<WoListRow>(
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
                wo.production_line_id as line_id,
                line.code as line_code
           from public.work_orders wo
           left join public.wo_executions exec
             on exec.wo_id = wo.id
            and exec.org_id = wo.org_id
           left join public.items item
             on item.id = wo.product_id
            and item.org_id = wo.org_id
           left join public.production_lines line
             on line.id = wo.production_line_id
            and line.org_id = wo.org_id
          where wo.org_id = $1::uuid
            and (
              wo.status = 'RELEASED'
              or exec.status in ('in_progress', 'paused')
            )
            and ($2::uuid is null or wo.production_line_id = $2::uuid)
          order by (wo.scheduled_start_time is null) asc,
                   wo.scheduled_start_time asc,
                   wo.wo_number asc`,
        [session.org_id, session.line_id],
      );

      await auditAttempt(client, session, 'production.scanner.wos.list', 'ok', { count: rows.length });
      return scannerOk({
        wos: rows.map((row) => ({
          id: row.id,
          woNumber: row.wo_number,
          status: row.status,
          itemCode: row.item_code,
          productName: row.product_name,
          plannedQty: row.planned_qty,
          qtyEntered: row.qty_entered,
          qtyEnteredUom: row.qty_entered_uom,
          uomSnapshot: row.uom_snapshot,
          scheduledStart: iso(row.scheduled_start),
          lineId: row.line_id,
          lineCode: row.line_code,
        })),
      });
    } catch (error) {
      await auditAttempt(client, session, 'production.scanner.wos.list', 'error', {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  if ('guardError' in result) return scannerError(result.error, result.status);
  return result;
}
