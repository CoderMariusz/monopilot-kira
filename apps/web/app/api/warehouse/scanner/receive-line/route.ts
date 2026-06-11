import type { NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../../lib/scanner/guard';
import { isRecord, jsonError, jsonOk, readJson, stringField } from '../../../../../lib/scanner/route-utils';
import { withScannerOrg } from '../../../../../lib/scanner/with-scanner-org';
import { receiveScannerPoLine, ReceivePoError } from '../../../../../lib/warehouse/scanner/receive-po';

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError('invalid_body', 400);

  const input = {
    clientOpId: stringField(body, 'clientOpId') ?? '',
    poLineId: stringField(body, 'poLineId') ?? '',
    qty: stringField(body, 'qty') ?? '',
    batchNumber: stringField(body, 'batchNumber'),
    bestBefore: stringField(body, 'bestBefore'),
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
