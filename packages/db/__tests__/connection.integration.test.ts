import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAppConnection } from '../test-utils/test-pool.js';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationTest = hasDatabaseUrl ? it : it.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('packages/db integration contract', () => {
  runIntegrationTest('connects via drizzle and returns 1', async () => {
    const pool = getAppConnection();
    const db = drizzle(pool);
    const result = await db.execute(sql`SELECT 1 AS one`);
    const row = (result as { rows: { one: string | number }[] }).rows[0];

    expect(Number(row.one)).toBe(1);

    await pool.end();
  });

  runIntegrationTest('runs drizzle migrate command against an empty migrations folder', () => {
    const command = 'pnpm run migrate';
    expect(() => {
      execSync(command, {
        cwd: packageRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }).not.toThrow();
  });
});