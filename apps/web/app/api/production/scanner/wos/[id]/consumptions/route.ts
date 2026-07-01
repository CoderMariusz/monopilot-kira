import { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../../../lib/scanner/guard';
import { withTxnOrgContext } from '../../../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../../../lib/scanner/with-scanner-org';
import { auditAttempt, getWoId, scannerError, scannerOk, type RouteContext } from '../../../_support';

// ============================================================
// Scanner — reversible material-consumption reads for one WO.
//
// Lists the WO's ORIGINAL consumption entries that can still be reversed:
//   - qty_consumed > 0          (originals, never the negative counter-entries)
//   - correction_of_id is null  (never a correction row itself)
//   - no existing counter-entry already references the row (idempotency guard
//     mirrors hasConsumptionCorrection in the reverse-consume POST route).
//
// The reverse-consume screen renders this list, the operator picks a row, and
// the POST /reverse-consume route re-locks + re-validates server-side. This read
// is intentionally permission-free at the bearer-session tier (same as the LP
// list read) — the destructive correct gate lives on the POST.
// ============================================================

const OPERATION = 'production.scanner.wos.consumptions';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

type ConsumptionRow = {
  id: string;
  component_id: string;
  material_name: string | null;
  lp_id: string;
  lp_number: string | null;
  qty_consumed: string;
  uom: string;
  consumed_at: Date | string | null;
};

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function GET(request: NextRequest, context: RouteContext) {
  const woId = await getWoId(context);

  const result = await requireScannerSession(request, null, OPERATION, async ({ client, session }) => {
    const rows = await withScannerOrg(client, session, async ({ client: scopedClient }) =>
      // app.current_org_id() only resolves inside a registered txn context.
      withTxnOrgContext(scopedClient, session.org_id, session.user_id, async () => {
        const res = await scopedClient.query<ConsumptionRow>(
          `select c.id::text as id,
                  c.component_id::text as component_id,
                  coalesce(wm.material_name, item.name) as material_name,
                  c.lp_id::text as lp_id,
                  lp.lp_number,
                  c.qty_consumed::text as qty_consumed,
                  c.uom,
                  c.consumed_at
             from public.wo_material_consumption c
             left join public.wo_materials wm
               on wm.org_id = c.org_id
              and wm.wo_id = c.wo_id
              and wm.product_id = c.component_id
             left join public.items item
               on item.org_id = c.org_id
              and item.id = c.component_id
             left join public.license_plates lp
               on lp.org_id = c.org_id
              and lp.id = c.lp_id
            where c.org_id = app.current_org_id()
              and c.wo_id = $1::uuid
              and c.correction_of_id is null
              and c.qty_consumed > 0
              and not exists (
                select 1
                  from public.wo_material_consumption rev
                 where rev.org_id = c.org_id
                   and rev.correction_of_id = c.id
              )
            order by c.consumed_at desc nulls last, c.id desc
            limit 50`,
          [woId],
        );
        return res.rows;
      }),
    );

    await auditAttempt(client, session, OPERATION, 'ok', { woId, count: rows.length });
    return scannerOk({
      consumptions: rows.map((row) => ({
        consumptionId: row.id,
        materialName: row.material_name ?? row.component_id,
        lpId: row.lp_id === NIL_UUID ? null : row.lp_id,
        lpNumber: row.lp_id === NIL_UUID ? null : row.lp_number,
        qty: row.qty_consumed,
        uom: row.uom,
        consumedAt: iso(row.consumed_at),
      })),
    });
  });

  if ('guardError' in result) return scannerError(result.error, result.status);
  return result;
}
