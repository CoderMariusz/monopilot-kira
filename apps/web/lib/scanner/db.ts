import { getOwnerConnection } from '@monopilot/db/clients.js';

import type pg from 'pg';

export type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

// Memoised module-singleton owner pool (same pattern as saml.ts Slot F-4 /
// packages/auth/src/totp.ts). Creating a fresh pg.Pool per request and
// calling .end() in a finally makes pooling pointless — every request pays a
// TCP connect + auth handshake and hot paths leak half-closed sockets. The
// pool is torn down implicitly at process exit.
let scannerPool: pg.Pool | null = null;

function getScannerPool(): pg.Pool {
  if (!scannerPool) {
    scannerPool = getOwnerConnection();
  }
  return scannerPool;
}

export async function withScannerDb<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getScannerPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
