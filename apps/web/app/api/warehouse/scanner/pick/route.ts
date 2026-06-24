import type { NextRequest } from 'next/server';

import { hasPermission, type ProductionContext } from '../../../../../lib/production/shared';
import { requireScannerSession } from '../../../../../lib/scanner/guard';
import { isRecord, jsonError, jsonOk, readJson, stringField } from '../../../../../lib/scanner/route-utils';
import { withScannerOrg } from '../../../../../lib/scanner/with-scanner-org';
import { pickScannerLp, WarehouseScannerError } from '../../../../../lib/warehouse/scanner/movement';
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
