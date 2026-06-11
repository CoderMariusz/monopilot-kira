import { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../lib/scanner/guard';
import { withTxnOrgContext } from '../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../lib/scanner/with-scanner-org';
import { scannerError, scannerOk } from '../_support';

type WasteCategoryRow = {
  code: string;
  name: string;
};

export async function GET(request: NextRequest) {
  const result = await requireScannerSession(request, null, 'production.scanner.waste_categories', async ({ client, session }) => {
    const categories = await withScannerOrg(client, session, async ({ client: orgClient }) =>
      // app.current_org_id() only resolves inside a txn with a registered
      // context (see lib/scanner/txn-org-context.ts) — in autocommit the
      // org-filtered SELECT below always returns empty without this wrapper.
      withTxnOrgContext(orgClient, session.org_id, async () => {
        const res = await orgClient.query<WasteCategoryRow>(
          `select code, name
             from public.waste_categories
            where org_id = app.current_org_id()
              and is_active = true
            order by name asc, code asc`,
        );
        return res.rows;
      }),
    );

    return scannerOk({
      categories: categories.map((row) => ({
        code: row.code,
        name: row.name,
      })),
    });
  });

  if ('guardError' in result) return scannerError(result.error, result.status);
  return result;
}
