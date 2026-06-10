import { NextRequest } from 'next/server';

import { writeScannerSessionAudit } from '../../../../lib/scanner/audit';
import { requireScannerSession } from '../../../../lib/scanner/guard';
import { isRecord, jsonError, jsonOk, readJson } from '../../../../lib/scanner/route-utils';

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError('invalid_json', 400);

  const result = await requireScannerSession(request, body, 'scanner.logout', async ({ client, session }) => {
    await client.query(
      `update public.scanner_sessions
          set ended_at = coalesce(ended_at, now()),
              last_seen_at = now()
        where id = $1::uuid
          and org_id = $2::uuid`,
      [session.id, session.org_id],
    );
    await writeScannerSessionAudit(client, session, 'scanner.logout', 'ok');
    return jsonOk({});
  });

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
