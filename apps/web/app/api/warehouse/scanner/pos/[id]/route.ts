import type { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../../lib/scanner/guard';
import { jsonError, jsonOk } from '../../../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../../lib/scanner/with-scanner-org';
import { getScannerPurchaseOrder } from '../../../../../../lib/warehouse/scanner/receive-po';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const result = await requireScannerSession(request, null, 'scanner.receive_po.detail', async ({ client, session }) =>
    withScannerOrg(client, session, async ({ client: scopedClient }) => {
      const po = await withTxnOrgContext(scopedClient, session.org_id, session.user_id, () =>
        getScannerPurchaseOrder(scopedClient, session, id),
      );
      if (!po) return jsonError('po_not_found', 404);
      return jsonOk({ po });
    }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
