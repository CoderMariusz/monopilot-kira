import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  resolve(packageRoot, 'migrations/516-npd-sensory-project-integrity.sql'),
  'utf8',
);
const require = createRequire(import.meta.url);
const hasPostgresTestcontainer = (() => {
  try {
    require.resolve('@testcontainers/postgresql');
    return true;
  } catch {
    return false;
  }
})();
const runTestcontainerSuite =
  hasPostgresTestcontainer && process.env.RLS_LIVE_TESTS === '1' ? describe : describe.skip;

const orgId = '51600000-0000-4000-8000-000000000001';
const projectId = '51600000-0000-4000-8000-000000000002';
const orphanProjectId = '51600000-0000-4000-8000-000000000099';
const projectCode = 'NPD-516-LIVE';
const productCode = 'FG-516-LIVE';
const unresolvedRef = 'Legacy product display name';

type StartedPostgres = {
  getConnectionUri(): string;
  stop(): Promise<void>;
};

type PostgreSqlContainerCtor = new (image: string) => {
  withDatabase(database: string): {
    withUsername(username: string): {
      withPassword(password: string): {
        start(): Promise<StartedPostgres>;
      };
    };
  };
};

let container: StartedPostgres | undefined;
let pool: pg.Pool | undefined;

async function startPostgres16(): Promise<StartedPostgres> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<{ PostgreSqlContainer: PostgreSqlContainerCtor }>;
  const { PostgreSqlContainer } = await dynamicImport('@testcontainers/postgresql');
  return new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('monopilot_migration_516')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();
}

runTestcontainerSuite('migration 516 — NPD sensory project integrity', () => {
  beforeAll(async () => {
    container = await startPostgres16();
    // eslint-disable-next-line no-restricted-syntax -- this migration test needs a raw pool bound to its ephemeral testcontainer.
    pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    await pool.query(`
      create table public.npd_projects (
        id uuid primary key,
        org_id uuid not null,
        code text not null,
        product_code text,
        created_at timestamptz not null default pg_catalog.now()
      );
      create table public.users (id uuid primary key);
      create table public.technical_sensory_evaluations (
        id uuid primary key default gen_random_uuid(),
        org_id uuid not null,
        subject_type text not null,
        subject_ref text not null,
        status text not null,
        status_reason text,
        updated_at timestamptz not null default pg_catalog.now()
      );
      create table public.audit_events (
        id bigserial primary key,
        org_id uuid not null,
        actor_user_id uuid,
        actor_type text,
        action text not null,
        resource_type text not null,
        resource_id text not null,
        before_state jsonb,
        after_state jsonb,
        request_id uuid not null,
        retention_class text not null
      );
    `);
    await pool.query(
      `insert into public.npd_projects (id, org_id, code, product_code)
       values ($1, $2, $3, $4)`,
      [projectId, orgId, projectCode, productCode],
    );
    await pool.query(
      `insert into public.technical_sensory_evaluations
         (org_id, subject_type, subject_ref, status)
       values ($1, 'project', $2, 'pass'),
              ($1, 'project', $3, 'pass'),
              ($1, 'project', $4, 'pass'),
              ($1, 'project', $5, 'pass'),
              ($1, 'project', $6, 'pass')`,
      [orgId, projectId, projectCode, productCode, orphanProjectId, unresolvedRef],
    );
    await pool.query(migration);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it('links legacy UUID, project-code, and unique product-code references', async () => {
    const linked = await pool!.query<{ subject_ref: string; npd_project_id: string | null }>(
      `select subject_ref, npd_project_id::text
         from public.technical_sensory_evaluations
        where subject_ref = any($1::text[])
        order by subject_ref`,
      [[projectId, projectCode, productCode]],
    );

    expect(linked.rows).toHaveLength(3);
    expect(linked.rows.every((row) => row.npd_project_id === projectId)).toBe(true);
  });

  it('voids only an explicit UUID parent reference that no longer exists', async () => {
    const orphan = await pool!.query<{ voided: boolean; void_reason: string | null }>(
      `select voided_at is not null as voided, void_reason
         from public.technical_sensory_evaluations
        where subject_ref = $1`,
      [orphanProjectId],
    );
    const audits = await pool!.query<{ subject_ref: string }>(
      `select before_state->>'subject_ref' as subject_ref
         from public.audit_events
        where action = 'technical.sensory.voided'`,
    );

    expect(orphan.rows).toEqual([{
      voided: true,
      void_reason: 'Parent NPD project was not present during migration 516',
    }]);
    expect(audits.rows).toEqual([{ subject_ref: orphanProjectId }]);
  });

  it('leaves an unmatched legacy reference live for manual review', async () => {
    const unresolved = await pool!.query<{
      npd_project_id: string | null;
      voided_at: Date | null;
    }>(
      `select npd_project_id::text, voided_at
         from public.technical_sensory_evaluations
        where subject_ref = $1`,
      [unresolvedRef],
    );

    expect(unresolved.rows).toEqual([{ npd_project_id: null, voided_at: null }]);
  });

  it('rejects a new live project sensory row without a same-org parent', async () => {
    await expect(
      pool!.query(
        `insert into public.technical_sensory_evaluations
           (org_id, subject_type, subject_ref, status)
         values ($1, 'project', $2, 'pending')`,
        [orgId, randomUUID()],
      ),
    ).rejects.toThrow(/requires an existing same-org npd project/i);
  });

  it('is idempotent when the migration is applied again', async () => {
    await pool!.query(migration);

    const audits = await pool!.query<{ count: string }>(
      `select count(*)::text as count
         from public.audit_events
        where action = 'technical.sensory.voided'`,
    );
    expect(audits.rows).toEqual([{ count: '1' }]);
  });
});
