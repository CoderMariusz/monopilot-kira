import type { NextRequest } from 'next/server';

import { withScannerDb } from './db';
import { writeScannerSessionAudit } from './audit';
import { findScannerSessionForAudit, verifyScannerSession } from './session';

import type pg from 'pg';
import type { ScannerSessionRow } from './session';

export type ScannerGuardResult = {
  client: pg.PoolClient;
  session: ScannerSessionRow;
  token: string;
};

function tokenFromAuthorization(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export async function requireScannerSession<T>(
  request: NextRequest,
  body: unknown,
  operation: string,
  fn: (ctx: ScannerGuardResult) => Promise<T>,
): Promise<T | { guardError: true; status: number; error: 'missing_token' | 'invalid_session' }> {
  const bodyToken =
    typeof body === 'object' && body !== null && 'token' in body && typeof body.token === 'string'
      ? body.token
      : null;
  const token = tokenFromAuthorization(request) ?? bodyToken;

  if (!token) {
    return { guardError: true, status: 401, error: 'missing_token' };
  }

  return withScannerDb(async (client) => {
    const session = await verifyScannerSession(client, token);
    if (!session) {
      const auditSession = await findScannerSessionForAudit(client, token);
      if (auditSession) {
        await writeScannerSessionAudit(client, auditSession, operation, 'invalid_session');
      }
      return { guardError: true, status: 401, error: 'invalid_session' };
    }
    return fn({ client, session, token });
  });
}
