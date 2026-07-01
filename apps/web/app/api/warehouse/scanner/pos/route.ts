import type { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../lib/scanner/guard';
import { jsonError, jsonOk } from '../../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../lib/scanner/with-scanner-org';
import { listScannerPurchaseOrders } from '../../../../../lib/warehouse/scanner/receive-po';

export async function GET(request: NextRequest) {
  const result = await requireScannerSession(request, null, 'scanner.receive_po.list', async ({ client, session }) =>
    withScannerOrg(client, session, async ({ client: scopedClient }) => {
      const pos = await withTxnOrgContext(scopedClient, session.org_id, session.user_id, () =>
        listScannerPurchaseOrders(scopedClient, session),
      );
      return jsonOk({ pos });
    }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
