import type { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../lib/scanner/guard';
import { isRecord, jsonError, jsonOk, readJson, stringField } from '../../../../../lib/scanner/route-utils';
import { withScannerOrg } from '../../../../../lib/scanner/with-scanner-org';
import { receiveScannerPoLine, ReceivePoError } from '../../../../../lib/warehouse/scanner/receive-po';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError('invalid_body', 400);

  // Lane W9-L8: optional destination location — uuid shape gate here, the
  // org-scoped existence check happens inside the receive transaction.
  const toLocationId = stringField(body, 'toLocationId');
  if (toLocationId && !UUID_RE.test(toLocationId)) return jsonError('invalid_location', 422);

  const input = {
    clientOpId: stringField(body, 'clientOpId') ?? '',
    poLineId: stringField(body, 'poLineId') ?? '',
    qty: stringField(body, 'qty') ?? '',
    batchNumber: stringField(body, 'batchNumber'),
    bestBefore: stringField(body, 'bestBefore'),
    toLocationId,
  };

  const result = await requireScannerSession(request, body, 'scanner.receive_po', async ({ client, session }) =>
    withScannerOrg(client, session, async () => {
      try {
        const received = await receiveScannerPoLine(client, session, input);
        return jsonOk(received);
      } catch (err) {
        if (err instanceof ReceivePoError) return jsonError(err.code, err.status);
        throw err;
      }
    }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
