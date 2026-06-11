import { NextRequest } from 'next/server';

import { emitConsumeBlocked, QualityHoldError } from '../../../../../../../lib/production/shared';
import { recordWaste } from '../../../../../../../lib/production/waste/record-waste';
import { requireScannerSession } from '../../../../../../../lib/scanner/guard';
import { stringField } from '../../../../../../../lib/scanner/route-utils';
import { withScannerOrg } from '../../../../../../../lib/scanner/with-scanner-org';
import {
  auditAttempt,
  getWoId,
  isDecimalString,
  productionErrorResponse,
  readRecordBody,
  requiredClientOpId,
  scannerError,
  scannerOk,
  scannerTransactionId,
  scannerValidationError,
  type RouteContext,
} from '../../../_support';

export async function POST(request: NextRequest, context: RouteContext) {
  const woId = await getWoId(context);
  const operation = 'production.scanner.wos.waste';
  const body = await readRecordBody(request);
  if (!body) return scannerValidationError(request, null, operation, 'invalid_json', 400, { woId });

  const clientOpId = requiredClientOpId(body);
  const categoryCode = stringField(body, 'categoryCode');
  const qtyKgRaw = body.qtyKg;
  if (!clientOpId || !categoryCode || qtyKgRaw === undefined || qtyKgRaw === null) {
    return scannerValidationError(request, body, operation, 'missing_fields', 400, { woId });
  }
  const qtyKg = typeof qtyKgRaw === 'string' ? qtyKgRaw.trim() : null;
  if (!qtyKg) return scannerValidationError(request, body, operation, 'invalid_qty', 422, { woId, clientOpId });
  if (!isDecimalString(qtyKg) || qtyKg === '0' || /^0+(\.0+)?$/.test(qtyKg)) {
    return scannerValidationError(request, body, operation, 'invalid_qty', 422, { woId, clientOpId });
  }

  const result = await requireScannerSession(request, body, operation, async ({ client, session }) => {
    try {
      const woRes = await client.query<{ id: string }>(
        `select id
           from public.work_orders
          where org_id = $1::uuid
            and id = $2::uuid
            and ($3::uuid is null or production_line_id = $3::uuid)
          limit 1`,
        [session.org_id, woId, session.line_id],
      );
      if (!woRes.rows[0]) {
        await auditAttempt(client, session, 'production.scanner.wos.waste', 'not_found', { woId, clientOpId });
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

      await auditAttempt(client, session, 'production.scanner.wos.waste', 'ok', {
        woId,
        clientOpId,
        transactionId,
        wasteId: data.waste_id,
      });
      return scannerOk({ waste: data, transactionId, replay: false });
    } catch (error) {
      if (error instanceof QualityHoldError) {
        await withScannerOrg(session, (ctx) => emitConsumeBlocked(ctx, error));
      }
      await auditAttempt(client, session, 'production.scanner.wos.waste', error instanceof Error ? error.message : 'error', {
        woId,
        clientOpId,
      });
      return productionErrorResponse(error);
    }
  });

  if ('guardError' in result) return scannerError(result.error, result.status);
  return result;
}
