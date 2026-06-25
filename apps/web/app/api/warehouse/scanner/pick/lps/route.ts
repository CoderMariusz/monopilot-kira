import type { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../../lib/scanner/guard';
import { jsonError, jsonOk, stringField } from '../../../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../../lib/scanner/with-scanner-org';
import { isUuid } from '../../../../../../lib/warehouse/scanner/movement';

type PickableLpRow = {
  lp_id: string;
  lp_number: string;
  available_qty: string;
  uom: string;
  expiry_date: string | Date | null;
  location_code: string | null;
};

export async function GET(request: NextRequest) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const productId = stringField(query, 'productId');
  const uom = stringField(query, 'uom');
  if (!productId || !isUuid(productId) || !uom) return jsonError('invalid_input', 422);

  const result = await requireScannerSession(request, null, 'warehouse.scanner.pick.lps', async ({ client, session }) =>
    withScannerOrg(client, session, async ({ client: scopedClient }) => {
      // app.current_org_id() only resolves inside a txn with a registered
      // context (see lib/scanner/txn-org-context.ts).
      const lps = await withTxnOrgContext(scopedClient, session.org_id, async () => {
        const { rows } = await scopedClient.query<PickableLpRow>(
          `select inv.lp_id::text,
                  inv.lp_number,
                  inv.available_qty::text,
                  inv.uom,
                  inv.expiry_date,
                  loc.code as location_code
             from public.v_inventory_available inv
             join public.license_plates lp
               on lp.org_id = app.current_org_id()
              and lp.id = inv.lp_id
             left join public.locations loc
               on loc.org_id = app.current_org_id()
              and loc.id = inv.location_id
            where inv.org_id = app.current_org_id()
              and inv.product_id = $1::uuid
              and inv.uom = $2
              and lp.qa_status = 'released'
              and (lp.expiry_date is null or lp.expiry_date::date >= current_date)
              and not exists (
                select 1
                  from public.v_active_holds h
                 where h.org_id = app.current_org_id()
                   and h.reference_type = 'lp'
                   and h.reference_id = inv.lp_id
              )
            order by inv.expiry_date asc nulls last, inv.lp_number asc
            limit 10`,
          [productId, uom],
        );

        return rows.map((row) => ({
          id: row.lp_id,
          lpNumber: row.lp_number,
          availableQty: row.available_qty,
          uom: row.uom,
          expiryDate: isoDate(row.expiry_date),
          locationCode: row.location_code,
        }));
      });
      return jsonOk({ lps });
    }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}

function isoDate(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
