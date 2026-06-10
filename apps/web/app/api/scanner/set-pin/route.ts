import { NextRequest } from 'next/server';

import { findUserByEmail, setPin, verifySupabaseLoginPassword } from '../../../../lib/scanner/auth';
import { writeScannerAudit } from '../../../../lib/scanner/audit';
import { withScannerDb } from '../../../../lib/scanner/db';
import { isRecord, jsonError, jsonOk, readJson, stringField, validPin } from '../../../../lib/scanner/route-utils';

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError('invalid_json', 400);

  const email = stringField(body, 'email')?.toLowerCase();
  const password = stringField(body, 'password');
  const newPin = stringField(body, 'newPin');
  if (!email || !password || !newPin) return jsonError('missing_fields', 400);
  if (!validPin(newPin)) return jsonError('invalid_pin_format', 400);

  return withScannerDb(async (client) => {
    const user = await findUserByEmail(client, email);
    if (!user) return jsonError('invalid_credentials', 401);

    const auditBase = {
      orgId: user.org_id,
      userId: user.id,
      operation: 'scanner.set_pin',
    };
    const passwordOk = await verifySupabaseLoginPassword(email, password);
    if (!passwordOk) {
      await writeScannerAudit(client, { ...auditBase, resultCode: 'invalid_credentials' });
      return jsonError('invalid_credentials', 401);
    }

    await setPin(user.id, newPin);
    await writeScannerAudit(client, { ...auditBase, resultCode: 'ok' });
    return jsonOk({});
  });
}
