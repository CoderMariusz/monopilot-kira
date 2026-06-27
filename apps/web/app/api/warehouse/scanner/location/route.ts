import type { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../lib/scanner/guard';
import { jsonError, jsonOk, stringField } from '../../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../lib/scanner/with-scanner-org';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LocationRow = {
  id: string;
  code: string;
  name: string;
  warehouse_id: string;
  warehouse_code: string;
  location_type: string;
};

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function GET(request: NextRequest) {
  const code = stringField(Object.fromEntries(new URL(request.url).searchParams), 'code');

  const result = await requireScannerSession(request, null, 'warehouse.scanner.location.lookup', async ({ client, session }) =>
    withScannerOrg(client, session, async ({ client: scopedClient }) => {
      // app.current_org_id() only resolves inside a txn with a registered
      // context (see lib/scanner/txn-org-context.ts).
      const { rows } = await withTxnOrgContext(scopedClient, session.org_id, () =>
        code
          ? scopedClient.query<LocationRow>(
              `select loc.id::text,
                      loc.code,
                      loc.name,
                      loc.warehouse_id::text,
                      w.code as warehouse_code,
                      loc.location_type
                 from public.locations loc
                 join public.warehouses w
                   on w.org_id = app.current_org_id()
                  and w.id = loc.warehouse_id
                where loc.org_id = app.current_org_id()
                  and (
                    loc.code = $1
                    or lower(loc.code) = lower($1)
                    or loc.barcode = $1
                    or ($2::uuid is not null and loc.id = $2::uuid)
                  )
                order by case
                  when loc.code = $1 then 1
                  when lower(loc.code) = lower($1) then 2
                  when loc.barcode = $1 then 3
                  when $2::uuid is not null and loc.id = $2::uuid then 4
                  else 5
                end,
                loc.code asc
                limit 1`,
              [code, isUuid(code) ? code : null],
            )
          : scopedClient.query<LocationRow>(
              `select loc.id::text,
                      loc.code,
                      loc.name,
                      loc.warehouse_id::text,
                      w.code as warehouse_code,
                      loc.location_type
                 from public.locations loc
                 join public.warehouses w
                   on w.org_id = app.current_org_id()
                  and w.id = loc.warehouse_id
                where loc.org_id = app.current_org_id()
                  and ($1::uuid is null or w.site_id = $1::uuid)
                  and coalesce(loc.is_active, true)
                order by case when loc.location_type in ('receiving', 'default') then 0 else 1 end,
                         loc.level asc,
                         loc.code asc
                limit 50`,
              [session.site_id],
            ),
      );

      if (!code) {
        return jsonOk({
          locations: rows.map((row) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            warehouseId: row.warehouse_id,
            warehouseCode: row.warehouse_code,
            locationType: row.location_type,
          })),
        });
      }

      const row = rows[0];
      if (!row) return jsonError('location_not_found', 404);

      return jsonOk({
        location: {
          id: row.id,
          code: row.code,
          name: row.name,
          warehouseId: row.warehouse_id,
          warehouseCode: row.warehouse_code,
          locationType: row.location_type,
        },
      });
    }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
