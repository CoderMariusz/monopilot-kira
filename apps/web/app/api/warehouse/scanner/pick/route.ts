import type { NextRequest } from 'next/server';

import { hasPermission, type ProductionContext } from '../../../../../lib/production/shared';
import { requireScannerSession } from '../../../../../lib/scanner/guard';
import { isRecord, jsonError, jsonOk, readJson, stringField } from '../../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../lib/scanner/with-scanner-org';
import { pickScannerLp, WarehouseScannerError } from '../../../../../lib/warehouse/scanner/movement';
import { isUuid, scannerLocationSiteAccess, scannerLpSiteAccess } from '../../../scanner/site-access';
import { auditAttempt } from '../../../production/scanner/_support';

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError('invalid_input', 422);

  const input = {
    clientOpId: stringField(body, 'clientOpId') ?? '',
    woId: stringField(body, 'woId') ?? '',
    materialId: stringField(body, 'materialId') ?? '',
    lpId: stringField(body, 'lpId') ?? '',
    toLocationId: stringField(body, 'toLocationId'),
  };

  const result = await requireScannerSession(request, body, 'warehouse.scanner.pick', async ({ client, session }) =>
    withScannerOrg(client, session, async ({ client: scopedClient }) => {
      // Review fix F2: inventory WRITE — gate on the same permission the desktop
      // createStockMove uses (warehouse.stock.move); mirror the inspect route's
      // forbidden audit. Read-only scanner lookups stay read-open.
      const permCtx = { client: scopedClient, userId: session.user_id, orgId: session.org_id } as unknown as ProductionContext;
      if (!(await hasPermission(permCtx, 'warehouse.stock.move'))) {
        await auditAttempt(scopedClient, session, 'warehouse.scanner.pick', 'forbidden', {
          lpId: input.lpId,
          clientOpId: input.clientOpId,
        });
        return jsonError('forbidden', 403, {
          message: 'You need the "warehouse.stock.move" permission to move stock. Ask an admin to grant it.',
        });
      }

      try {
        if (isUuid(input.woId) && isUuid(input.materialId) && isUuid(input.lpId)) {
          const access = await withTxnOrgContext(scopedClient, session.org_id, session.user_id, async () => {
            const material = await scopedClient.query<{ allowed: boolean; staging_location_id: string | null }>(
            `select app.user_can_see_site(wo.site_id) as allowed,
                    line.default_location_id::text as staging_location_id
               from public.wo_materials mat
               join public.work_orders wo
                 on wo.org_id = app.current_org_id()
                and wo.id = mat.wo_id
               left join public.production_lines line
                 on line.org_id = app.current_org_id()
                and line.id = wo.production_line_id
              where mat.org_id = app.current_org_id()
                and mat.wo_id = $1::uuid
                and mat.id = $2::uuid
              limit 1`,
              [input.woId, input.materialId],
            );
            const materialRow = material.rows[0];
            if (!materialRow) return 'not_found' as const;
            if (!materialRow.allowed) return 'not_found' as const;
            const lpAccess = await scannerLpSiteAccess(scopedClient, input.lpId);
            if (lpAccess !== 'ok') return lpAccess;
            const toLocationId = input.toLocationId ?? materialRow.staging_location_id;
            if (!toLocationId || !isUuid(toLocationId)) return 'ok' as const;
            return scannerLocationSiteAccess(scopedClient, toLocationId);
          });
          if (access !== 'ok') return jsonError('not_found', 404);
        }
        return jsonOk(await pickScannerLp(scopedClient, session, input));
      } catch (error) {
        if (error instanceof WarehouseScannerError) return jsonError(error.code, error.status, { message: error.message });
        throw error;
      }
    }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
