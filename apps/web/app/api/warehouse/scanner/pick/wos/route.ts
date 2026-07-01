import type { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../../lib/scanner/guard';
import { jsonError, jsonOk } from '../../../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../../lib/scanner/with-scanner-org';
import { listPickWorkOrders } from '../../../../../../lib/warehouse/scanner/movement';

export async function GET(request: NextRequest) {
  const result = await requireScannerSession(request, null, 'warehouse.scanner.pick.wos', async ({ client, session }) =>
    withScannerOrg(client, session, async ({ client: scopedClient }) => {
      // app.current_org_id() only resolves inside a txn with a registered
      // context (see lib/scanner/txn-org-context.ts).
      const wos = await withTxnOrgContext(scopedClient, session.org_id, session.user_id, () =>
        listPickWorkOrders(scopedClient, session),
      );
      return jsonOk({ wos });
    }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
