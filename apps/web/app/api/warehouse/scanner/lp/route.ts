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
      const lp = await withTxnOrgContext(scopedClient, session.org_id, session.user_id, async () => {
        const access = await scopedClient.query<{ id: string }>(
          `select id::text
             from public.license_plates
            where org_id = app.current_org_id()
              and (lp_number = $1 or ($2::uuid is not null and id = $2::uuid))
              and app.user_can_see_site(site_id)
            limit 1`,
          [code, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(code) ? code : null],
        );
        if (!access.rows[0]) return null;
        return getScannerLpDetail(scopedClient, code);
      });
      if (!lp) return jsonError('lp_not_found', 404);
      return jsonOk({ lp });
    }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
