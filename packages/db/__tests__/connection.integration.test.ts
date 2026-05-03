import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationTest = hasDatabaseUrl ? it : it.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('packages/db integration contract', () => {
  runIntegrationTest('connects via drizzle and returns 1', async () => {
    const { db, closeDb } = await import('../lib/client');
    const [row] = await db.execute(sql`SELECT 1 AS one`);

    expect(Number((row as { one: string | number }).one)).toBe(1);

    await closeDb();
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