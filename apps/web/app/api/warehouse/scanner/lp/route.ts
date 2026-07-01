import type { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../lib/scanner/guard';
import { jsonError, jsonOk, stringField } from '../../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../lib/scanner/with-scanner-org';
import { getScannerLpDetail } from '../../../../../lib/warehouse/scanner/movement';

export async function GET(request: NextRequest) {
  const code = stringField(Object.fromEntries(new URL(request.url).searchParams), 'code');
  if (!code) return jsonError('missing_fields', 422);

  const result = await requireScannerSession(request, null, 'warehouse.scanner.lp.lookup', async ({ client, session }) =>
    withScannerOrg(client, session, async ({ client: scopedClient }) => {
      // app.current_org_id() only resolves inside a txn with a registered
      // context (see lib/scanner/txn-org-context.ts) — without this wrapper the
      // org-scoped lookup always returns empty.
      const lp = await withTxnOrgContext(scopedClient, session.org_id, session.user_id, () => getScannerLpDetail(scopedClient, code));
      if (!lp) return jsonError('lp_not_found', 404);
      return jsonOk({ lp });
    }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
