import { NextRequest } from 'next/server';

import { writeScannerSessionAudit } from '../../../../lib/scanner/audit';
import { requireScannerSession } from '../../../../lib/scanner/guard';
import { isRecord, jsonError, jsonOk, nullableStringField, readJson } from '../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../lib/scanner/txn-org-context';
import { isUuid } from '../site-access';

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError('invalid_json', 400);

  const siteId = nullableStringField(body, 'siteId');
  const lineId = nullableStringField(body, 'lineId');
  const shift = nullableStringField(body, 'shift');
  if (siteId === undefined && lineId === undefined && shift === undefined) {
    return jsonError('missing_fields', 400);
  }
  if (siteId !== undefined && siteId !== null && !isUuid(siteId)) {
    return jsonError('invalid_site', 400);
  }

  const result = await requireScannerSession(request, body, 'scanner.context', async ({ client, session }) => {
    if (siteId !== undefined && siteId !== null) {
      const siteAccess = await withTxnOrgContext(client, session.org_id, session.user_id, async () => {
        const { rows } = await client.query<{ allowed: boolean }>(
          `select app.user_can_see_site(s.site_id) as allowed
             from (
               select id as site_id
                 from public.sites
                where org_id = app.current_org_id()
                  and id = $1::uuid
                limit 1
             ) s`,
          [siteId],
        );
        if (!rows[0]) return 'not_found' as const;
        return rows[0].allowed ? ('ok' as const) : ('not_found' as const);
      });
      if (siteAccess === 'not_found') {
        await writeScannerSessionAudit(client, session, 'scanner.context', 'site_not_found', { siteId });
        return jsonError('site_not_found', 404);
      }
    }

    const { rows } = await client.query<{
      site_id: string | null;
      line_id: string | null;
      shift: string | null;
      mode: 'personal' | 'kiosk';
    }>(
      `update public.scanner_sessions
          set site_id = case when $3::boolean then $4::uuid else site_id end,
              line_id = case when $5::boolean then $6::uuid else line_id end,
              shift = case when $7::boolean then $8::text else shift end,
              last_seen_at = now()
        where id = $1::uuid
          and org_id = $2::uuid
        returning site_id, line_id, shift, mode`,
      [
        session.id,
        session.org_id,
        siteId !== undefined,
        siteId ?? null,
        lineId !== undefined,
        lineId ?? null,
        shift !== undefined,
        shift ?? null,
      ],
    );

    const updated = rows[0];
    if (!updated) {
      await writeScannerSessionAudit(client, session, 'scanner.context', 'not_found');
      return jsonError('session_not_found', 404);
    }

    await writeScannerSessionAudit(client, session, 'scanner.context', 'ok');
    return jsonOk({
      session: {
        siteId: updated.site_id,
        lineId: updated.line_id,
        shift: updated.shift,
        mode: updated.mode,
      },
    });
  });

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
