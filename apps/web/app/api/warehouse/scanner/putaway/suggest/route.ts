import type { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../../lib/scanner/guard';
import { jsonError, jsonOk, stringField } from '../../../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../../lib/scanner/with-scanner-org';
import { isUuid, suggestPutawayLocations, WarehouseScannerError } from '../../../../../../lib/warehouse/scanner/movement';

export async function GET(request: NextRequest) {
  const lpId = stringField(Object.fromEntries(new URL(request.url).searchParams), 'lpId');
  if (!lpId || !isUuid(lpId)) return jsonError('invalid_input', 422);

  const result = await requireScannerSession(
    request,
    null,
    'warehouse.scanner.putaway.suggest',
    async ({ client, session }) =>
      withScannerOrg(client, session, async ({ client: scopedClient }) => {
        try {
          // app.current_org_id() only resolves inside a txn with a registered
          // context (see lib/scanner/txn-org-context.ts).
          const suggestions = await withTxnOrgContext(scopedClient, session.org_id, session.user_id, () =>
            suggestPutawayLocations(scopedClient, lpId),
          );
          return jsonOk({ suggestions });
        } catch (error) {
          if (error instanceof WarehouseScannerError) return jsonError(error.code, error.status);
          throw error;
        }
      }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
