import { NextRequest } from 'next/server';

import { emitConsumeBlocked, ProductionActionError, QualityHoldError } from '../../../../../../../lib/production/shared';
import { recordWaste } from '../../../../../../../lib/production/waste/record-waste';
import { requireScannerSession } from '../../../../../../../lib/scanner/guard';
import {
  acquireScannerIdempotencyLock,
  findServerReplay,
  insertServerReplay,
  reconstructServerReplayError,
} from '../../../../../../../lib/scanner/replay';
import { isRecord, stringField } from '../../../../../../../lib/scanner/route-utils';
import { cleanupTxnOrgContext, registerTxnOrgContext } from '../../../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../../../lib/scanner/with-scanner-org';
import {
  auditAttempt,
  getWoId,
  isDecimalString,
  productionErrorResponse,
  readRecordBody,
  parseRequiredClientOpId,
  scannerError,
  scannerOk,
  scannerTransactionId,
  scannerValidationError,
  scannerWorkOrderVisibleOnLineSql,
  type RouteContext,
} from '../../../_support';

function wasteReplayResponse(ext: Record<string, unknown>) {
  const waste = isRecord(ext.waste) ? ext.waste : ext;
  return scannerOk({
    waste,
    transactionId: typeof ext.transactionId === 'string' ? ext.transactionId : null,
    replay: true,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const woId = await getWoId(context);
  const operation = 'production.scanner.wos.waste';
  const body = await readRecordBody(request);
  if (!body) return scannerValidationError(request, null, operation, 'invalid_json', 400, { woId });

  const clientOpIdParsed = parseRequiredClientOpId(body);
  if (!clientOpIdParsed.ok) {
    return scannerValidationError(request, body, operation, clientOpIdParsed.error, 400, { woId });
  }
  const clientOpId = clientOpIdParsed.clientOpId;
  const categoryCode = stringField(body, 'categoryCode');
  const qtyKgRaw = body.qtyKg;
  if (!categoryCode || qtyKgRaw === undefined || qtyKgRaw === null) {
    return scannerValidationError(request, body, operation, 'missing_fields', 400, { woId });
  }
  const qtyKg = typeof qtyKgRaw === 'string' ? qtyKgRaw.trim() : null;
  if (!qtyKg) return scannerValidationError(request, body, operation, 'invalid_qty', 422, { woId, clientOpId });
  if (!isDecimalString(qtyKg) || qtyKg === '0' || /^0+(\.0+)?$/.test(qtyKg)) {
    return scannerValidationError(request, body, operation, 'invalid_qty', 422, { woId, clientOpId });
  }

  const result = await requireScannerSession(request, body, operation, async ({ client, session }) => {
    let txnOrgContextToken: string | null = null;
    try {
      await client.query('begin');
      txnOrgContextToken = await registerTxnOrgContext(client, session.org_id, session.user_id);
      await acquireScannerIdempotencyLock(client, session.org_id, clientOpId);

      const replay = await findServerReplay(client, session.org_id, clientOpId, operation);
      if (replay) {
        await client.query('commit');
        await auditAttempt(client, session, operation, 'replay', { woId, clientOpId });
        if (replay.result_code === 'ok') return wasteReplayResponse(replay.ext);
        const { error, status, extra } = reconstructServerReplayError(replay);
        return scannerError(error, status, extra);
      }

      const woRes = await client.query<{ id: string }>(
        `select id
           from public.work_orders
          where org_id = app.current_org_id()
            and id = $1::uuid
            and ${scannerWorkOrderVisibleOnLineSql(2)}
            and app.user_can_see_site(site_id)
          limit 1`,
        [woId, session.line_id],
      );
      if (!woRes.rows[0]) {
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

      const transactionId = scannerTransactionId('waste', clientOpId);
      const data = await withScannerOrg(session, (ctx) =>
        recordWaste(ctx, woId, {
          transaction_id: transactionId,
          category_code: categoryCode,
          qty_kg: qtyKg,
          reason_notes: stringField(body, 'reason') ?? undefined,
          shift_id: session.shift ?? 'scanner',
        }),
      );

      await insertServerReplay(client, session, {
        operation,
        clientOpId,
        resultCode: 'ok',
        woId,
        ext: {
          woId,
          clientOpId,
          transactionId,
          wasteId: data.waste_id,
          waste: data,
        },
      });
      await client.query('commit');
      await auditAttempt(client, session, operation, 'ok', {
        woId,
        clientOpId,
        transactionId,
        wasteId: data.waste_id,
      });
      return scannerOk({ waste: data, transactionId, replay: false });
    } catch (error) {
      if (error instanceof QualityHoldError || error instanceof ProductionActionError) {
        try {
          await insertServerReplay(client, session, {
            operation,
            clientOpId,
            resultCode: error.code,
            woId,
            ext: {
              woId,
              clientOpId,
              status: error.status,
              ...(error.details ?? {}),
            },
          });
          await client.query('commit');
        } catch {
          try {
            await client.query('rollback');
          } catch {
            /* noop */
          }
        }
        if (error instanceof QualityHoldError) {
          await withScannerOrg(session, (ctx) => emitConsumeBlocked(ctx, error));
        }
        await auditAttempt(client, session, operation, error instanceof Error ? error.message : 'error', {
          woId,
          clientOpId,
        });
        return productionErrorResponse(error);
      }
      try {
        await client.query('rollback');
      } catch {
        /* noop */
      }
      await auditAttempt(client, session, operation, error instanceof Error ? error.message : 'error', {
        woId,
        clientOpId,
      });
      return productionErrorResponse(error);
    } finally {
      await cleanupTxnOrgContext(client, txnOrgContextToken);
    }
  });

  if ('guardError' in result) return scannerError(result.error, result.status);
  return result;
}
