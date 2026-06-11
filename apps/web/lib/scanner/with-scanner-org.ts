import { randomUUID } from 'node:crypto';
import pg from 'pg';

import type { ProductionContext } from '../production/shared';
import type { ScannerSessionRow } from './session';

const { Pool } = pg;

let ownerPool: pg.Pool | null = null;
let appPool: pg.Pool | null = null;

export type ScannerOrgContext = {
  client: pg.PoolClient;
  session: ScannerSessionRow;
  orgId: string;
  userId: string;
};

function getOwnerPool(): pg.Pool {
  if (ownerPool) return ownerPool;
  const cs = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('withScannerOrg requires DATABASE_URL_OWNER or DATABASE_URL');
  ownerPool = new Pool({ connectionString: cs });
  return ownerPool;
}

function getAppPool(): pg.Pool {
  if (appPool) return appPool;
  const cs = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('withScannerOrg requires DATABASE_URL_APP or DATABASE_URL');

  const url = new URL(cs);
  if (!process.env.DATABASE_URL_APP) {
    url.username = 'app_user';
    url.password = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
  }
  appPool = new Pool({ connectionString: url.toString() });
  return appPool;
}

/**
 * Scanner bearer sessions are not Supabase user sessions. This helper creates
 * the same app-role/RLS execution context as withOrgContext, but binds it to
 * the already-verified scanner session's org_id and user_id.
 */
export async function withScannerOrg<T>(
  session: ScannerSessionRow,
  action: (ctx: ProductionContext) => Promise<T>,
): Promise<T>;
export async function withScannerOrg<T>(
  client: pg.PoolClient,
  session: ScannerSessionRow,
  action: (ctx: ScannerOrgContext) => Promise<T>,
): Promise<T>;
export async function withScannerOrg<T>(
  arg1: ScannerSessionRow | pg.PoolClient,
  arg2: ((ctx: ProductionContext) => Promise<T>) | ScannerSessionRow,
  arg3?: (ctx: ScannerOrgContext) => Promise<T>,
): Promise<T> {
  if (arg3) {
    const client = arg1 as pg.PoolClient;
    const session = arg2 as ScannerSessionRow;
    await client.query('select set_config($1, $2, true)', ['app.current_org_id', session.org_id]);
    return arg3({ client, session, orgId: session.org_id, userId: session.user_id });
  }

  const session = arg1 as ScannerSessionRow;
  const action = arg2 as (ctx: ProductionContext) => Promise<T>;
  const sessionToken = randomUUID();
  const owner = getOwnerPool();

  await owner.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1::uuid, $2::uuid)`,
    [sessionToken, session.org_id],
  );

  const client = await getAppPool().connect();
  try {
    await client.query('begin');
    await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [sessionToken, session.org_id]);
    const result = await action({
      userId: session.user_id,
      orgId: session.org_id,
      client,
    });
    await client.query('commit');
    return result;
  } catch (err) {
    try {
      await client.query('rollback');
    } catch {
      /* noop */
    }
    throw err;
  } finally {
    client.release();
    try {
      await owner.query(`delete from app.session_org_contexts where session_token = $1::uuid`, [sessionToken]);
    } catch {
      /* noop */
    }
  }
}
