import type { NextRequest } from 'next/server';

import { hasPermission, type ProductionContext } from '../../../../../lib/production/shared';
import { requireScannerSession } from '../../../../../lib/scanner/guard';
import { isRecord, jsonError, jsonOk, readJson, stringField } from '../../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../lib/scanner/with-scanner-org';
import { moveScannerLp, WarehouseScannerError } from '../../../../../lib/warehouse/scanner/movement';
import { isUuid, scannerLocationSiteAccess, scannerLpSiteAccess } from '../../../scanner/site-access';
import { auditAttempt } from '../../../production/scanner/_support';

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError('invalid_input', 422);

  const input = {
    clientOpId: stringField(body, 'clientOpId') ?? '',
    lpId: stringField(body, 'lpId') ?? '',
    toLocationId: stringField(body, 'toLocationId') ?? '',
    moveType: 'putaway' as const,
  };

  const result = await requireScannerSession(request, body, 'warehouse.scanner.putaway', async ({ client, session }) =>
    withScannerOrg(client, session, async ({ client: scopedClient }) => {
      // Review fix F2: inventory WRITE — gate on the same permission the desktop
      // createStockMove uses (warehouse.stock.move); mirror the inspect route's
      // forbidden audit. Read-only scanner lookups stay read-open.
      const permCtx = { client: scopedClient, userId: session.user_id, orgId: session.org_id } as unknown as ProductionContext;
      if (!(await hasPermission(permCtx, 'warehouse.stock.move'))) {
        await auditAttempt(scopedClient, session, 'warehouse.scanner.putaway', 'forbidden', {
          lpId: input.lpId,
          clientOpId: input.clientOpId,
        });
        return jsonError('forbidden', 403, {
          message: 'You need the "warehouse.stock.move" permission to move stock. Ask an admin to grant it.',
        });
      }

      try {
        if (isUuid(input.lpId) && isUuid(input.toLocationId)) {
          const access = await withTxnOrgContext(scopedClient, session.org_id, session.user_id, async () => {
            const lpAccess = await scannerLpSiteAccess(scopedClient, input.lpId);
            if (lpAccess !== 'ok') return lpAccess;
            return scannerLocationSiteAccess(scopedClient, input.toLocationId);
          });
          if (access === 'not_found') return jsonError('not_found', 404);
          if (access === 'forbidden') return jsonError('forbidden', 403);
        }
        return jsonOk(await moveScannerLp(scopedClient, session, input));
      } catch (error) {
        if (error instanceof WarehouseScannerError) return jsonError(error.code, error.status, { message: error.message });
        throw error;
      }
    }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
