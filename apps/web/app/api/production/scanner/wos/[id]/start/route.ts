import { NextRequest } from 'next/server';

import { startWo } from '../../../../../../../lib/production/start-wo';
import { hasPermission, type ProductionContext } from '../../../../../../../lib/production/shared';
import { requireScannerSession } from '../../../../../../../lib/scanner/guard';
import { withScannerOrg } from '../../../../../../../lib/scanner/with-scanner-org';
import {
  auditAttempt,
  getWoId,
  readRecordBody,
  requiredClientOpId,
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

export async function POST(request: NextRequest, context: RouteContext) {
  const woId = await getWoId(context);
  const operation = 'production.scanner.wos.start';
  const body = await readRecordBody(request);
  if (!body) return scannerValidationError(request, null, operation, 'invalid_json', 400, { woId });

  const clientOpId = requiredClientOpId(body);
  if (!clientOpId) return scannerValidationError(request, body, operation, 'missing_fields', 400, { woId });

  const result = await requireScannerSession(request, body, operation, async ({ client, session }) => {
    const permCtx = { client, userId: session.user_id, orgId: session.org_id } as unknown as ProductionContext;
    if (!(await hasPermission(permCtx, 'production.wo.start'))) {
      await auditAttempt(client, session, operation, 'forbidden', { woId, clientOpId });
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
      await auditAttempt(client, session, operation, started.error, { woId, clientOpId, transactionId });
      return scannerError(started.error, started.status, { details: started.details ?? null });
    }

    await auditAttempt(client, session, operation, 'ok', { woId, clientOpId, transactionId });
    return scannerOk({ start: started.data, transactionId, replay: false });
  });

  if ('guardError' in result) return scannerError(result.error, result.status);
  return result;
}
