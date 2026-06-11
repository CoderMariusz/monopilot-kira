import type { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../lib/scanner/guard';
import { jsonError, jsonOk } from '../../../../../lib/scanner/route-utils';
import { withScannerOrg } from '../../../../../lib/scanner/with-scanner-org';
import { listScannerPurchaseOrders } from '../../../../../lib/warehouse/scanner/receive-po';

export async function GET(request: NextRequest) {
  const result = await requireScannerSession(request, null, 'scanner.receive_po.list', async ({ client, session }) =>
    withScannerOrg(client, session, async () => {
      const pos = await listScannerPurchaseOrders(client, session);
      return jsonOk({ pos });
    }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
