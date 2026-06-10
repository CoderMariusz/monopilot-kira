import { NextRequest } from 'next/server';

import { findUserByEmail, userHasPin, verifyPin } from '../../../../lib/scanner/auth';
import { writeScannerAudit } from '../../../../lib/scanner/audit';
import { withScannerDb } from '../../../../lib/scanner/db';
import { createScannerSession } from '../../../../lib/scanner/session';
import { isRecord, jsonError, jsonOk, readJson, stringField } from '../../../../lib/scanner/route-utils';

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError('invalid_json', 400);

  const email = stringField(body, 'email')?.toLowerCase();
  const pin = stringField(body, 'pin');
  if (!email || !pin) return jsonError('missing_fields', 400);

  return withScannerDb(async (client) => {
    const user = await findUserByEmail(client, email);
    if (!user) return jsonError('invalid_pin', 401);

    const auditBase = {
      orgId: user.org_id,
      userId: user.id,
      operation: 'scanner.login',
    };

    if (!(await userHasPin(client, user.id))) {
      await writeScannerAudit(client, { ...auditBase, resultCode: 'pin_not_enrolled' });
      return jsonError('pin_not_enrolled', 409);
    }

    const pinResult = await verifyPin(user.id, pin, { client });
    if (pinResult === 'locked') {
      await writeScannerAudit(client, { ...auditBase, resultCode: 'pin_locked' });
      return jsonError('pin_locked', 423);
    }
    if (pinResult !== true) {
      await writeScannerAudit(client, { ...auditBase, resultCode: 'invalid_pin' });
      return jsonError('invalid_pin', 401);
    }

    const session = await createScannerSession(client, {
      orgId: user.org_id,
      userId: user.id,
      mode: 'personal',
    });
    await writeScannerAudit(client, {
      ...auditBase,
      sessionId: session.sessionId,
      resultCode: 'ok',
    });

    return jsonOk({
      token: session.token,
      user: { id: user.id, name: user.name },
      expiresAt: session.expiresAt,
    });
  });
}
