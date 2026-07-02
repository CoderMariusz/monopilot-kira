import { NextRequest } from 'next/server';

import { writeScannerSessionAudit } from '../../../../lib/scanner/audit';
import { requireScannerSession } from '../../../../lib/scanner/guard';
import { withTxnOrgContext } from '../../../../lib/scanner/txn-org-context';
import { jsonError, jsonOk, toPublicScannerSessionBody } from './support';

export async function GET(request: NextRequest) {
  const result = await requireScannerSession(request, null, 'scanner.bootstrap', async ({ client, session }) => {
    const [sitesResult, linesResult] = await withTxnOrgContext(client, session.org_id, session.user_id, () =>
      Promise.all([
        client.query<{ id: string; name: string }>(
          `select id, name
             from public.sites
            where org_id = app.current_org_id()
              and is_active = true
              and app.user_can_see_site(id)
            order by name`,
        ),
        client.query<{ id: string; name: string; site_id: string | null }>(
          `select id, name, site_id
             from public.production_lines
            where org_id = app.current_org_id()
              and status = 'active'
              and app.user_can_see_site(site_id)
            order by name`,
        ),
      ]),
    );

    await writeScannerSessionAudit(client, session, 'scanner.bootstrap', 'ok');
    return jsonOk({
      session: toPublicScannerSessionBody(session),
      sites: sitesResult.rows.map((site) => ({ id: site.id, name: site.name })),
      lines: linesResult.rows.map((line) => ({
        id: line.id,
        name: line.name,
        siteId: line.site_id,
      })),
    });
  });

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
