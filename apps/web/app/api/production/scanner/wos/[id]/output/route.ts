import { NextRequest } from 'next/server';

import { registerOutput } from '../../../../../../../lib/production/output/register-output';
import { emitConsumeBlocked, QualityHoldError } from '../../../../../../../lib/production/shared';
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

type WoProductRow = { product_id: string };

function optionalDecimal(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  return isDecimalString(value) ? value.trim() : '';
}

export async function POST(request: NextRequest, context: RouteContext) {
  const woId = await getWoId(context);
  const operation = 'production.scanner.wos.output';
  const body = await readRecordBody(request);
  if (!body) return scannerValidationError(request, null, operation, 'invalid_json', 400, { woId });

  const clientOpId = requiredClientOpId(body);
  if (!clientOpId) return scannerValidationError(request, body, operation, 'missing_fields', 400, { woId });

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
    try {
      const woRes = await client.query<WoProductRow>(
        `select product_id
           from public.work_orders
          where org_id = $1::uuid
            and id = $2::uuid
            and ($3::uuid is null or production_line_id = $3::uuid)
          limit 1`,
        [session.org_id, woId, session.line_id],
      );
      const wo = woRes.rows[0];
      if (!wo) {
        await auditAttempt(client, session, 'production.scanner.wos.output', 'not_found', { woId, clientOpId });
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
      await auditAttempt(client, session, 'production.scanner.wos.output', 'ok', {
        woId,
        clientOpId,
        transactionId,
        outputId: data.output_id,
      });
      return scannerOk({ output: data, lp_id: data.lp_id, transactionId, replay: false });
    } catch (error) {
      if (error instanceof QualityHoldError) {
        await withScannerOrg(session, (ctx) => emitConsumeBlocked(ctx, error));
      }
      await auditAttempt(client, session, 'production.scanner.wos.output', error instanceof Error ? error.message : 'error', {
        woId,
        clientOpId,
      });
      return productionErrorResponse(error);
    }
  });

  if ('guardError' in result) return scannerError(result.error, result.status);
  return result;
}
