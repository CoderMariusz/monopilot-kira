import { NextRequest } from 'next/server';

import { setPin, verifyPin } from '../../../../lib/scanner/auth';
import { writeScannerSessionAudit } from '../../../../lib/scanner/audit';
import { requireScannerSession } from '../../../../lib/scanner/guard';
import { isRecord, jsonError, jsonOk, readJson, stringField, validPin } from '../../../../lib/scanner/route-utils';

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError('invalid_json', 400);

  const currentPin = stringField(body, 'currentPin');
  const newPin = stringField(body, 'newPin');
  if (!currentPin || !newPin) return jsonError('missing_fields', 400);
  if (!validPin(newPin)) return jsonError('invalid_pin_format', 400);

  const result = await requireScannerSession(request, body, 'scanner.change_pin', async ({ client, session }) => {
    const pinResult = await verifyPin(session.user_id, currentPin, { client });
    if (pinResult === 'locked') {
      await writeScannerSessionAudit(client, session, 'scanner.change_pin', 'pin_locked');
      return jsonError('pin_locked', 423);
    }
    if (pinResult !== true) {
      await writeScannerSessionAudit(client, session, 'scanner.change_pin', 'invalid_pin');
      return jsonError('invalid_pin', 401);
    }

    await setPin(session.user_id, newPin);
    await writeScannerSessionAudit(client, session, 'scanner.change_pin', 'ok');
    return jsonOk({});
  });

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
