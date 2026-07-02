import { NextRequest } from 'next/server';

import { registerOutput } from '../../../../../../../lib/production/output/register-output';
import { emitConsumeBlocked, ProductionActionError, QualityHoldError } from '../../../../../../../lib/production/shared';
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
  type RouteContext,
} from '../../../_support';

type WoProductRow = { product_id: string };

function optionalDecimal(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  return isDecimalString(value) ? value.trim() : '';
}

function outputReplayResponse(ext: Record<string, unknown>) {
  const output = isRecord(ext.output) ? ext.output : ext;
  return scannerOk({
    output,
    lp_id: typeof ext.lp_id === 'string' ? ext.lp_id : null,
    transactionId:
      typeof ext.transactionId === 'string' ? ext.transactionId : typeof ext.transaction_id === 'string' ? ext.transaction_id : null,
    replay: true,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const woId = await getWoId(context);
  const operation = 'production.scanner.wos.output';
  const body = await readRecordBody(request);
  if (!body) return scannerValidationError(request, null, operation, 'invalid_json', 400, { woId });

  const clientOpIdParsed = parseRequiredClientOpId(body);
  if (!clientOpIdParsed.ok) {
    return scannerValidationError(request, body, operation, clientOpIdParsed.error, 400, { woId });
  }
  const clientOpId = clientOpIdParsed.clientOpId;

  const qtyUnits = optionalDecimal(body, 'qtyUnits');
  const actualWeightKg = optionalDecimal(body, 'actualWeightKg');
  const qtyKg = optionalDecimal(body, 'qtyKg');
  if (qtyUnits === '' || actualWeightKg === '' || qtyKg === '') {
    return scannerValidationError(request, body, operation, 'invalid_qty', 422, { woId, clientOpId });
  }

  const unitsUom = stringField(body, 'unitsUom');
  if (qtyUnits && unitsUom !== 'each' && unitsUom !== 'box') {
    return scannerValidationError(request, body, operation, 'invalid_units_uom', 422, { woId, clientOpId });
  }

  const outputType = stringField(body, 'outputType') ?? 'primary';
  if (!['primary', 'co_product', 'by_product'].includes(outputType)) {
    return scannerValidationError(request, body, operation, 'invalid_output_type', 422, { woId, clientOpId });
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
        if (replay.result_code === 'ok') return outputReplayResponse(replay.ext);
        const { error, status, extra } = reconstructServerReplayError(replay);
        return scannerError(error, status, extra);
      }

      const woRes = await client.query<WoProductRow>(
        `select product_id
           from public.work_orders
          where org_id = app.current_org_id()
            and id = $1::uuid
            and ($2::uuid is null or production_line_id = $2::uuid)
            and app.user_can_see_site(site_id)
          limit 1`,
        [woId, session.line_id],
      );
      const wo = woRes.rows[0];
      if (!wo) {
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

      const transactionId = scannerTransactionId('output', clientOpId);
      const serviceBody = {
        transaction_id: transactionId,
        output_type: outputType,
        product_id: wo.product_id,
        qtyUnits,
        unitsUom: unitsUom ?? undefined,
        actualWeightKg,
        qtyKg,
        batch_number: stringField(body, 'batchNumber') ?? undefined,
      };

      const data = await withScannerOrg(session, (ctx) => registerOutput(ctx, woId, serviceBody));

      await insertServerReplay(client, session, {
        operation,
        clientOpId,
        resultCode: 'ok',
        woId,
        ext: {
          woId,
          clientOpId,
          transactionId,
          outputId: data.output_id,
          output: data,
          lp_id: data.lp_id,
        },
      });
      await client.query('commit');
      await auditAttempt(client, session, operation, 'ok', {
        woId,
        clientOpId,
        transactionId,
        outputId: data.output_id,
      });
      return scannerOk({ output: data, lp_id: data.lp_id, transactionId, replay: false });
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
