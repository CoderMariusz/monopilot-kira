import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable must be set for @monopilot/db');
}

const pool = new Pool({
  connectionString: databaseUrl,
});

export const db = drizzle(pool);

export const closeDb = async () => {
  await pool.end();
};
