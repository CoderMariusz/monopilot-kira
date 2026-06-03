import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runRestoreDrill } from '../run-drill.js';
import { smokeQueries } from '../smoke-queries.js';

const ownerUrl = process.env['DATABASE_URL_OWNER'];
const hasOwnerUrl = Boolean(ownerUrl);
const describeDb = hasOwnerUrl ? describe : describe.skip;

function databaseUrl(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

function safeName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function ownerMaintenanceUrl(): string {
  if (!ownerUrl) throw new Error('DATABASE_URL_OWNER is required');
  return databaseUrl(ownerUrl, 'postgres');
}

function exec(command: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync(command, args, {
    cwd: join(import.meta.dirname, '../../../..'),
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function createDatabase(name: string): Promise<void> {
  const client = new pg.Client({ connectionString: ownerMaintenanceUrl() });
  await client.connect();
  try {
    await client.query(`create database "${name}"`);
  } finally {
    await client.end();
  }
}

async function dropDatabase(name: string): Promise<void> {
  const client = new pg.Client({ connectionString: ownerMaintenanceUrl() });
  await client.connect();
  try {
    await client.query(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1`,
      [name],
    );
    await client.query(`drop database if exists "${name}"`);
  } finally {
    await client.end();
  }
}

async function seedMinimalFixture(connectionString: string): Promise<void> {
  exec('pnpm', ['--filter', '@monopilot/db', 'migrate'], {
    DATABASE_URL: connectionString,
    DATABASE_URL_OWNER: connectionString,
  });

  const pool = new pg.Pool({ connectionString });
  const orgId = '00000000-0000-0000-0000-000000000002';
  try {
    for (const table of ['lot', 'work_order', 'quality_event', 'shipment', 'bom_item']) {
      await pool.query(
        `insert into public.${table} (external_id, org_id)
         values ($1, $2)`,
        [`restore-drill-${table}`, orgId],
      );
    }
  } finally {
    await pool.end();
  }
}

describe('restore drill static contract', () => {
  it('defines the required placeholder R13 RLS smoke query', () => {
    const query = smokeQueries.find((candidate) => candidate.name === 'placeholder_r13_rls');

    expect(query?.sql).toContain('pg_policies');
    for (const table of ['lot', 'work_order', 'quality_event', 'shipment', 'bom_item']) {
      expect(query?.sql).toContain(`'${table}'`);
    }
  });

  it('documents the quarterly restore drill tooling and T-120 task ID', () => {
    const policy = readFileSync(
      join(import.meta.dirname, '../../../../_foundation/contracts/backup-policy.md'),
      'utf8',
    );

    expect(policy).toContain('## Quarterly Restore Drill');
    expect(policy).toContain('tooling/restore-drill/');
    expect(policy).toContain('T-120');
  });

  it('wires the root drill script to the restore-drill workspace', () => {
    const rootPackage = JSON.parse(
      readFileSync(join(import.meta.dirname, '../../../../package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(rootPackage.scripts?.['drill']).toBe(
      'pnpm --filter @monopilot/restore-drill drill',
    );
  });
});

describeDb('restore drill integration', () => {
  const createdDatabases: string[] = [];
  let workDir = '';

  beforeAll(() => {
    workDir = join(tmpdir(), safeName('restore_drill'));
    mkdirSync(workDir, { recursive: true });
  });

  afterAll(async () => {
    for (const name of createdDatabases.reverse()) {
      await dropDatabase(name);
    }
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  async function freshDatabase(prefix: string): Promise<{ name: string; url: string }> {
    const name = safeName(prefix);
    await createDatabase(name);
    createdDatabases.push(name);
    return { name, url: databaseUrl(ownerUrl!, name) };
  }

  it('restores a pg_dump fixture, migrates to head, and passes every smoke query', async () => {
    const source = await freshDatabase('restore_drill_source');
    const target = await freshDatabase('restore_drill_target');
    await seedMinimalFixture(source.url);

    const dumpPath = join(workDir, 'minimal-fixture.sql');
    exec('pg_dump', ['--no-owner', '--no-privileges', '--file', dumpPath, source.url]);

    const report = await runRestoreDrill({
      dumpPath,
      databaseUrl: target.url,
      reportDir: join(workDir, 'reports'),
    });

    expect(report.passed).toBe(true);
    expect(report.phase).toBe('passed');
    expect(report.smokeResults).not.toHaveLength(0);
    expect(report.smokeResults.every((result) => result.passed)).toBe(true);
  });

  it('fails non-zero and reports the restore phase for a corrupt dump', async () => {
    const target = await freshDatabase('restore_drill_corrupt_target');
    const dumpPath = join(workDir, 'corrupt.sql');
    writeFileSync(dumpPath, 'create table public.restore_drill_corrupt (\n', 'utf8');

    await expect(
      runRestoreDrill({
        dumpPath,
        databaseUrl: target.url,
        reportDir: join(workDir, 'reports'),
      }),
    ).rejects.toMatchObject({
      report: expect.objectContaining({
        passed: false,
        phase: 'restore',
      }),
    });
  });
});
