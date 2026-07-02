import { NextRequest } from 'next/server';

import { startWo } from '../../../../../../../lib/production/start-wo';
import { hasPermission, type ProductionContext } from '../../../../../../../lib/production/shared';
import { requireScannerSession } from '../../../../../../../lib/scanner/guard';
import {
  acquireScannerIdempotencyLock,
  findServerReplay,
  insertServerReplay,
  reconstructServerReplayError,
} from '../../../../../../../lib/scanner/replay';
import { isRecord } from '../../../../../../../lib/scanner/route-utils';
import { cleanupTxnOrgContext, registerTxnOrgContext } from '../../../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../../../lib/scanner/with-scanner-org';
import {
  auditAttempt,
  getWoId,
  readRecordBody,
  parseRequiredClientOpId,
  scannerError,
  scannerOk,
  scannerTransactionId,
  scannerValidationError,
  type RouteContext,
} from '../../../_support';

function uuidOrNull(value: string | null | undefined): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function startReplayResponse(ext: Record<string, unknown>) {
  const start = isRecord(ext.start) ? ext.start : ext;
  return scannerOk({
    start,
    transactionId: typeof ext.transactionId === 'string' ? ext.transactionId : null,
    replay: true,
  });
}

function startFailedReplayResponse(replay: { result_code: string | null; ext: Record<string, unknown> }) {
  const { error, status, extra } = reconstructServerReplayError(replay);
  if (
    (error === 'changeover_signoff_required' || error === 'allergen_changeover_required') &&
    extra.changeoverId
  ) {
    return scannerError('changeover_signoff_required', status, { changeoverId: extra.changeoverId });
  }
  return scannerError(error, status, { details: extra.details ?? null });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const woId = await getWoId(context);
  const operation = 'production.scanner.wos.start';
  const body = await readRecordBody(request);
  if (!body) return scannerValidationError(request, null, operation, 'invalid_json', 400, { woId });

  const clientOpIdParsed = parseRequiredClientOpId(body);
  if (!clientOpIdParsed.ok) {
    return scannerValidationError(request, body, operation, clientOpIdParsed.error, 400, { woId });
  }
  const clientOpId = clientOpIdParsed.clientOpId;

  const result = await requireScannerSession(request, body, operation, async ({ client, session }) => {
    const permCtx = { client, userId: session.user_id, orgId: session.org_id } as unknown as ProductionContext;
    if (!(await hasPermission(permCtx, 'production.wo.start'))) {
      await auditAttempt(client, session, operation, 'forbidden', { woId, clientOpId });
      return scannerError('forbidden', 403);
    }

    let txnOrgContextToken: string | null = null;
    try {
      await client.query('begin');
      txnOrgContextToken = await registerTxnOrgContext(client, session.org_id, session.user_id);
      await acquireScannerIdempotencyLock(client, session.org_id, clientOpId);

      const replay = await findServerReplay(client, session.org_id, clientOpId, operation);
      if (replay) {
        await client.query('commit');
        await auditAttempt(client, session, operation, 'replay', { woId, clientOpId });
        if (replay.result_code === 'ok') return startReplayResponse(replay.ext);
        return startFailedReplayResponse(replay);
      }

      const siteGateRes = await client.query<{ allowed: boolean } | { ok?: never }>(
        `select app.user_can_see_site(wo.site_id) as allowed
           from public.work_orders wo
          where wo.org_id = app.current_org_id()
            and wo.id = $1::uuid
          limit 1`,
        [woId],
      );
      const siteRow = siteGateRes.rows[0] as { allowed: boolean } | undefined;
      if (!siteRow) {
        await insertServerReplay(client, session, {
          operation,
          clientOpId,
          resultCode: 'not_found',
          woId,
          ext: { woId, clientOpId, status: 404 },
        });
        await client.query('commit');
        await auditAttempt(client, session, operation, 'not_found', { woId, clientOpId });
        return scannerError('not_found', 404);
      }
      if (!siteRow.allowed) {
        await insertServerReplay(client, session, {
          operation,
          clientOpId,
          resultCode: 'forbidden',
          woId,
          ext: { woId, clientOpId, status: 403 },
        });
        await client.query('commit');
        await auditAttempt(client, session, operation, 'site_forbidden', { woId, clientOpId });
        return scannerError('forbidden', 403);
      }

      const transactionId = scannerTransactionId('start', clientOpId);
      const started = await withScannerOrg(session, (ctx) =>
        startWo(ctx, {
          woId,
          transactionId,
          lineId: session.line_id,
          shiftId: uuidOrNull(session.shift),
        }),
      );

      if (!started.ok) {
        const replayError =
          (started.error === 'changeover_signoff_required' || started.error === 'allergen_changeover_required') &&
          started.details &&
          typeof started.details === 'object' &&
          'changeoverId' in started.details
            ? 'changeover_signoff_required'
            : started.error;
        const replayExt: Record<string, unknown> = {
          woId,
          clientOpId,
          transactionId,
          status: started.status,
          details: started.details ?? null,
        };
        if (
          replayError === 'changeover_signoff_required' &&
          started.details &&
          typeof started.details === 'object' &&
          'changeoverId' in started.details
        ) {
          replayExt.changeoverId = (started.details as { changeoverId: unknown }).changeoverId;
        }
        await insertServerReplay(client, session, {
          operation,
          clientOpId,
          resultCode: replayError,
          woId,
          ext: replayExt,
        });
        await client.query('commit');
        await auditAttempt(client, session, operation, started.error, { woId, clientOpId, transactionId });
        if (replayError === 'changeover_signoff_required' && replayExt.changeoverId) {
          return scannerError('changeover_signoff_required', 409, {
            changeoverId: replayExt.changeoverId,
          });
        }
        return scannerError(started.error, started.status, { details: started.details ?? null });
      }

      await insertServerReplay(client, session, {
        operation,
        clientOpId,
        resultCode: 'ok',
        woId,
        ext: {
          woId,
          clientOpId,
          transactionId,
          start: started.data,
        },
      });
      await client.query('commit');
      await auditAttempt(client, session, operation, 'ok', { woId, clientOpId, transactionId });
      return scannerOk({ start: started.data, transactionId, replay: false });
    } catch (error) {
      try {
        await client.query('rollback');
      } catch {
        /* noop */
      }
      throw error;
    } finally {
      await cleanupTxnOrgContext(client, txnOrgContextToken);
    }
  });

  if ('guardError' in result) return scannerError(result.error, result.status);
  return result;
}
