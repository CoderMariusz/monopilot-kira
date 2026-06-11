import type { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../../lib/scanner/guard';
import { jsonError, jsonOk, stringField } from '../../../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../../lib/scanner/with-scanner-org';
import { isUuid, listFefoLps } from '../../../../../../lib/warehouse/scanner/movement';

export async function GET(request: NextRequest) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const productId = stringField(query, 'productId');
  const uom = stringField(query, 'uom');
  if (!productId || !isUuid(productId) || !uom) return jsonError('invalid_input', 422);

  const result = await requireScannerSession(request, null, 'warehouse.scanner.pick.lps', async ({ client, session }) =>
    withScannerOrg(client, session, async ({ client: scopedClient }) => {
      // app.current_org_id() only resolves inside a txn with a registered
      // context (see lib/scanner/txn-org-context.ts).
      const lps = await withTxnOrgContext(scopedClient, session.org_id, () =>
        listFefoLps(scopedClient, productId, uom),
      );
      return jsonOk({ lps });
    }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
