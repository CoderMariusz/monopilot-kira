import { timingSafeEqual } from 'node:crypto';
import type pg from 'pg';
// @ts-expect-error TS2835: T-098 intentionally uses the blocked extensionless
// specifier so the scoped ESLint exception cannot be bypassed with .js.
import { getOwnerConnection } from './clients';

type QueryArgs = Parameters<pg.Pool['query']>;

function isNonEmptySecret(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function cronBearerMatches(
  provided: string,
  expected: string | undefined,
): boolean {
  if (!isNonEmptySecret(expected)) return false;

  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (providedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

async function setSystemActor(client: pg.PoolClient): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(
      `select set_config('app.actor_type', 'system', false)`,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

export function getSystemActorConnection(): pg.Pool {
  const pool = getOwnerConnection();
  const connect = pool.connect.bind(pool);
  const initializedClients = new WeakSet<pg.PoolClient>();

  pool.connect = async (): Promise<pg.PoolClient> => {
    const client = await connect();
    try {
      if (!initializedClients.has(client)) {
        await setSystemActor(client);
        initializedClients.add(client);
      }
      return client;
    } catch (error) {
      client.release();
      throw error;
    }
  };

  pool.query = (async (...args: QueryArgs) => {
    const client = await pool.connect();
    try {
      return await client.query(...args);
    } finally {
      client.release();
    }
  }) as pg.Pool['query'];

  return pool;
}
