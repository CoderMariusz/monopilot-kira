import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nextSeq7 } from '../src/next-seq-7.js';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationTest = hasDatabaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration = (filename: string) =>
  readFileSync(resolve(packageRoot, 'migrations', filename), 'utf8');

const tenantId = '10400000-0000-4000-8000-000000000000';
const orgA = '10400000-0000-4000-8000-00000000000a';
const orgB = '10400000-0000-4000-8000-00000000000b';

async function seedAppUser(ownerPool: pg.Pool) {
  const password = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
  await ensureAppUserWithAdvisoryLock(ownerPool, password);
}

async function seedOrganizations(ownerPool: pg.Pool) {
  await ownerPool.query('insert into public.tenants (id, name, region_cluster, data_plane_url) values ($1, $2, $3, $4) on conflict (id) do nothing', [
    tenantId,
    'T-104 Tenant',
    'eu',
    'https://t-104.example.test',
  ]);
  await ownerPool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, $3, $4), ($5, $2, $6, $7)
     on conflict (id) do update
       set tenant_id = excluded.tenant_id,
           name = excluded.name,
           industry_code = excluded.industry_code`,
    [orgA, tenantId, 'T-104 Org A', 'bakery', orgB, 'T-104 Org B', 'pharma'],
  );
}

async function resetSequenceState(ownerPool: pg.Pool) {
  await ownerPool.query(`
    do $$
    begin
      if to_regclass('public.org_sequences') is not null then
        delete from public.org_sequences where org_id in ('${orgA}'::uuid, '${orgB}'::uuid);
      end if;
      if to_regclass('app.session_org_contexts') is not null then
        delete from app.session_org_contexts where org_id in ('${orgA}'::uuid, '${orgB}'::uuid);
      end if;
    end
    $$;
  `);
}

async function trustOrgContext(ownerPool: pg.Pool, sessionToken: string, orgId: string) {
  await ownerPool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1, $2)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

async function nextSeq7WithContext(appPool: pg.Pool, sessionToken: string, orgId: string) {
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const code = await nextSeq7(orgId, { client });
    await client.query('commit');
    return code;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

describe('061 org-scoped nextSeq7 migration contract', () => {
  it('creates org-scoped storage and uses a 7-digit formatter without tenant_id leakage', () => {
    const sql = migration('061-org-scoped-sequences.sql');

    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.org_sequences/i);
    expect(sql).toMatch(/\borg_id\b/i);
    expect(sql).toMatch(/primary\s+key\s*\(\s*org_id\s*,\s*seq_name\s*\)/i);
    expect(sql).toMatch(/app\.current_org_id\s*\(\s*\)/i);
    expect(sql).toMatch(/lpad\s*\([^;]+,\s*7\s*,\s*'0'\s*\)/i);
    expect(sql).not.toMatch(/\btenant_id\b/i);
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\.tenant_id['"]/i);
  });
});

runIntegrationTest('nextSeq7 org-scoped app-role behavior', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await seedAppUser(ownerPool);
    await ownerPool.query(migration('001-baseline.sql'));
    await ownerPool.query(migration('006-app-role.sql'));
    await ownerPool.query(migration('002-rls-baseline.sql'));
    await ownerPool.query(migration('061-org-scoped-sequences.sql'));
    await seedOrganizations(ownerPool);
    await resetSequenceState(ownerPool);
  });

  afterAll(async () => {
    await resetSequenceState(ownerPool);
    await appPool?.end();
    await ownerPool?.end();
  });

  beforeEach(async () => {
    await resetSequenceState(ownerPool);
  });

  it('returns a 7-digit string for an org', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);

    await expect(nextSeq7WithContext(appPool, sessionToken, orgA)).resolves.toBe('0000001');
  });

  it('returns 1000 unique, gap-free, monotonic values for one org under parallel calls', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const codes = await Promise.all(
      Array.from({ length: 1000 }, () => nextSeq7WithContext(appPool, sessionToken, orgA)),
    );
    const numericCodes = codes.map((code) => Number(code));

    expect(new Set(codes).size).toBe(1000);
    expect(codes.every((code) => /^\d{7}$/.test(code))).toBe(true);
    expect(Math.min(...numericCodes)).toBe(1);
    expect(Math.max(...numericCodes)).toBe(1000);
    expect([...numericCodes].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 1000 }, (_, index) => index + 1),
    );
  });

  it('keeps independent counters per org_id', async () => {
    const tokenA = randomUUID();
    const tokenB = randomUUID();
    await trustOrgContext(ownerPool, tokenA, orgA);
    await trustOrgContext(ownerPool, tokenB, orgB);

    await expect(nextSeq7WithContext(appPool, tokenA, orgA)).resolves.toBe('0000001');
    await expect(nextSeq7WithContext(appPool, tokenB, orgB)).resolves.toBe('0000001');
    await expect(nextSeq7WithContext(appPool, tokenA, orgA)).resolves.toBe('0000002');
    await expect(nextSeq7WithContext(appPool, tokenB, orgB)).resolves.toBe('0000002');
  });
});
