import { NextRequest } from 'next/server';

import { writeScannerSessionAudit } from '../../../../lib/scanner/audit';
import { requireScannerSession } from '../../../../lib/scanner/guard';
import { isRecord, jsonError, jsonOk, readJson, stringField } from '../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../lib/scanner/txn-org-context';

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError('invalid_json', 400);

  const lpId = stringField(body, 'lpId');
  const acquire = body.acquire;
  if (!lpId || typeof acquire !== 'boolean') return jsonError('missing_fields', 400);

  const result = await requireScannerSession(request, body, 'scanner.lock_lp', async ({ client, session }) => {
    if (acquire) {
      // mig 191:76 documents a 5-minute service-side auto-release: a stale
      // lock (held > 5 min) is stealable by the next requester. The CTE
      // captures the PREVIOUS holder (RETURNING alone would only show the
      // post-update row) so a steal can be audited as 'lp_stolen'.
      const { rows } = await withTxnOrgContext(client, session.org_id, session.user_id, () =>
        client.query<{ stolen: boolean }>(
          `with prev as (
           select id, locked_by, locked_at
             from public.license_plates
            where id = $1::uuid
              and org_id = app.current_org_id()
              and app.user_can_see_site(site_id)
         )
         update public.license_plates lp
            set locked_by = $2::uuid,
                locked_at = now(),
                updated_by = $2::uuid,
                updated_at = now()
           from prev
          where lp.id = prev.id
            and (prev.locked_by is null
                 or prev.locked_by = $2::uuid
                 or prev.locked_at < now() - interval '5 minutes')
          returning (prev.locked_by is not null and prev.locked_by <> $2::uuid) as stolen`,
          [lpId, session.user_id],
        ),
      );

      if (!rows[0]) {
        await writeScannerSessionAudit(client, session, 'scanner.lock_lp', 'lp_locked', { lpId, acquire });
        return jsonError('lp_locked', 409);
      }

      await writeScannerSessionAudit(
        client,
        session,
        'scanner.lock_lp',
        rows[0].stolen ? 'lp_stolen' : 'ok',
        { lpId, acquire },
      );
      return jsonOk({ locked: true });
    }

    await withTxnOrgContext(client, session.org_id, session.user_id, () =>
      client.query(
        `update public.license_plates
          set locked_by = null,
              locked_at = null,
              updated_by = $2::uuid,
              updated_at = now()
        where id = $1::uuid
          and org_id = app.current_org_id()
          and locked_by = $2::uuid
          and app.user_can_see_site(site_id)`,
        [lpId, session.user_id],
      ),
    );

    await writeScannerSessionAudit(client, session, 'scanner.lock_lp', 'ok', { lpId, acquire });
    return jsonOk({ locked: false });
  });

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
