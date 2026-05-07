/**
 * @deprecated Use packages/db/src/clients.ts (getAppConnection) and the schema barrel
 * at packages/db/schema/index.ts directly. This file is kept for backward compatibility
 * with pre-existing tests and will be removed in T-058.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../schema/index.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable must be set for @monopilot/db');
}

const pool = new Pool({
  connectionString: databaseUrl,
});

export const db = drizzle(pool, { schema });

export const closeDb = async () => {
  await pool.end();
};
