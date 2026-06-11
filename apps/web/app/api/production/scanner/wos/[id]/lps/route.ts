import { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../../../lib/scanner/guard';
import { stringField } from '../../../../../../../lib/scanner/route-utils';
import { withScannerOrg } from '../../../../../../../lib/scanner/with-scanner-org';
import { auditAttempt, getWoId, scannerError, scannerOk, type RouteContext } from '../../../_support';

type LpRow = {
  lp_id: string;
  lp_number: string;
  available_qty: string;
  uom: string;
  expiry_date: Date | string | null;
};

function isoDate(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : new Date(value).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const woId = await getWoId(context);
  const operation = 'production.scanner.wos.lps';
  const materialId = stringField(Object.fromEntries(new URL(request.url).searchParams), 'materialId');
  if (!materialId) return scannerError('missing_fields', 400, { woId });

  const result = await requireScannerSession(request, null, operation, async ({ client, session }) => {
    const rows = await withScannerOrg(client, session, async ({ client: scopedClient }) => {
      const materialRes = await scopedClient.query<{ product_id: string; uom: string }>(
        `select product_id, uom
           from public.wo_materials
          where org_id = app.current_org_id()
            and wo_id = $1::uuid
            and id = $2::uuid
          limit 1`,
        [woId, materialId],
      );
      const material = materialRes.rows[0];
      if (!material) return null;

      const lpRes = await scopedClient.query<LpRow>(
        `select lp_id,
                lp_number,
                available_qty::text as available_qty,
                uom,
                expiry_date
           from public.v_inventory_available
          where org_id = app.current_org_id()
            and product_id = $1::uuid
            and uom = $2
          order by expiry_date asc nulls last, lp_number asc
          limit 25`,
        [material.product_id, material.uom],
      );
      return lpRes.rows;
    });

    if (!rows) {
      await auditAttempt(client, session, operation, 'invalid_material', { woId, materialId });
      return scannerError('invalid_material', 422);
    }

    await auditAttempt(client, session, operation, 'ok', { woId, materialId, count: rows.length });
    return scannerOk({
      lps: rows.map((row) => ({
        lpId: row.lp_id,
        lpNumber: row.lp_number,
        qty: row.available_qty,
        uom: row.uom,
        expiry: isoDate(row.expiry_date),
      })),
    });
  });

  if ('guardError' in result) return scannerError(result.error, result.status);
  return result;
}
