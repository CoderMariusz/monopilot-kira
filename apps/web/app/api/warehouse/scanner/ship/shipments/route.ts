import type { NextRequest } from 'next/server';

import { hasPermission, type ProductionContext } from '../../../../../../lib/production/shared';
import { requireScannerSession } from '../../../../../../lib/scanner/guard';
import { jsonError, jsonOk } from '../../../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../../lib/scanner/with-scanner-org';

type ShipmentListRow = {
  id: string;
  shipment_number: string | null;
  sales_order_number: string | null;
  customer_name: string | null;
  box_count: number | string | bigint | null;
  packed_lp_count: number | string | bigint | null;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return Number(value ?? 0);
}

// FEAT-2 / map dead-end #13 — list the OPEN ('packing') shipments so a scanner
// operator can pick one to pack FG license plates into. Read-only; gated on the
// same ship.pack.close permission as the pack write.
export async function GET(request: NextRequest) {
  const result = await requireScannerSession(request, null, 'warehouse.scanner.ship.shipments', async ({ client, session }) =>
    withScannerOrg(client, session, async ({ client: scopedClient }) => {
      const permCtx = {
        client: scopedClient,
        userId: session.user_id,
        orgId: session.org_id,
      } as unknown as ProductionContext;
      if (!(await hasPermission(permCtx, 'ship.pack.close'))) {
        return jsonError('forbidden', 403, {
          message: 'You need the "ship.pack.close" permission to pack shipments. Ask an admin to grant it.',
        });
      }

      const shipments = await withTxnOrgContext(scopedClient, session.org_id, session.user_id, async () => {
        const { rows } = await scopedClient.query<ShipmentListRow>(
          `select sh.id::text,
                  sh.shipment_number,
                  so.order_number as sales_order_number,
                  c.name as customer_name,
                  (
                    select count(*)::int
                      from public.shipment_boxes sb
                     where sb.org_id = app.current_org_id()
                       and sb.shipment_id = sh.id
                       and sb.deleted_at is null
                  ) as box_count,
                  (
                    select count(*)::int
                      from public.shipment_boxes sb
                      join public.shipment_box_contents sbc
                        on sbc.shipment_box_id = sb.id
                       and sbc.org_id = app.current_org_id()
                       and sbc.deleted_at is null
                     where sb.org_id = app.current_org_id()
                       and sb.shipment_id = sh.id
                       and sb.deleted_at is null
                  ) as packed_lp_count
             from public.shipments sh
             left join public.sales_orders so on so.id = sh.sales_order_id and so.org_id = app.current_org_id()
             left join public.customers c on c.id = coalesce(sh.customer_id, so.customer_id) and c.org_id = app.current_org_id()
            where sh.org_id = app.current_org_id()
              and sh.deleted_at is null
              and sh.status = 'packing'
            order by sh.created_at desc
            limit 50`,
        );
        return rows.map((row) => ({
          id: row.id,
          shipmentNumber: row.shipment_number ?? '',
          salesOrderNumber: row.sales_order_number,
          customerName: row.customer_name,
          boxCount: toNumber(row.box_count),
          packedLpCount: toNumber(row.packed_lp_count),
        }));
      });

      return jsonOk({ shipments });
    }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
