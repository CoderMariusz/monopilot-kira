import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runErasure } from '../dispatcher';
import { registerErasureHandler } from '../registry';
import type { ErasureContext, ErasureHandler } from '../types';

const { Pool } = pg;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(packageRoot, '../..');
const migrationsRoot = resolve(repoRoot, 'packages/db/migrations');

const ownerConnectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
const integrationDescribe = ownerConnectionString ? describe : describe.skip;
const orgId = '11300000-0000-4000-8000-000000000113';
const tenantId = '11300000-0000-4000-8000-000000000001';
const testTable = 'public.gdpr_dispatcher_test_rows';

function appConnectionString(): string {
  const connectionString = process.env.DATABASE_URL_APP ?? ownerConnectionString;
  if (!connectionString) {
    throw new Error('DATABASE_URL_APP, DATABASE_URL_OWNER, or DATABASE_URL is required');
  }

  const url = new URL(connectionString);
  if (!process.env.DATABASE_URL_APP) {
    url.username = 'app_user';
    url.password = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
  }
  return url.toString();
}

function migration(name: string): string {
  return readFileSync(resolve(migrationsRoot, name), 'utf-8');
}

function domain(prefix: string): string {
  return `${prefix}.x${randomUUID().replace(/-/g, '')}`;
}

async function applyRequiredMigrations(ownerPool: pg.Pool): Promise<void> {
  for (const name of [
    '000-app-user-role.sql',
    '001-baseline.sql',
    '002-rls-baseline.sql',
    '004-audit.sql',
  ]) {
    await ownerPool.query(migration(name));
  }
}

async function prepareFixture(ownerPool: pg.Pool): Promise<void> {
  await ownerPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1::uuid, 'GDPR dispatcher test tenant', 'eu', 'local')
     on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await ownerPool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1::uuid, $2::uuid, 'GDPR dispatcher test org', 'generic')
     on conflict (id) do update
       set tenant_id = excluded.tenant_id,
           name = excluded.name,
           industry_code = excluded.industry_code`,
    [orgId, tenantId],
  );
  await ownerPool.query(
    `create table if not exists ${testTable} (
       id uuid primary key,
       org_id uuid not null references public.organizations(id) on delete cascade,
       subject_id text not null,
       marker text not null
     )`,
  );
  await ownerPool.query(`grant select, insert on ${testTable} to app_user`);
  await ownerPool.query(`alter table ${testTable} enable row level security`);
  await ownerPool.query(`alter table ${testTable} force row level security`);
  await ownerPool.query(`drop policy if exists gdpr_dispatcher_test_rows_org_context on ${testTable}`);
  await ownerPool.query(
    `create policy gdpr_dispatcher_test_rows_org_context
       on ${testTable}
       for all
       to app_user
       using (org_id = app.current_org_id())
       with check (org_id = app.current_org_id())`,
  );
}

async function cleanupOrgRows(ownerPool: pg.Pool): Promise<void> {
  await ownerPool.query(`delete from ${testTable} where org_id = $1::uuid`, [orgId]);
  await ownerPool.query(
    `delete from public.audit_events
     where org_id = $1::uuid
       and resource_type = 'gdpr_erasure'`,
    [orgId],
  );
  await ownerPool.query(`delete from app.session_org_contexts where org_id = $1::uuid`, [orgId]);
}

async function auditRows(ownerPool: pg.Pool, subjectId: string): Promise<
  Array<{
    action: string;
    resource_id: string;
    after_state: Record<string, unknown>;
  }>
> {
  const result = await ownerPool.query<{
    action: string;
    resource_id: string;
    after_state: Record<string, unknown>;
  }>(
    `select action, resource_id, after_state
     from public.audit_events
     where org_id = $1::uuid
       and resource_type = 'gdpr_erasure'
       and resource_id = $2
     order by occurred_at desc, id desc`,
    [orgId, subjectId],
  );
  return result.rows;
}

integrationDescribe(
  'runErasure Postgres integration (skipped unless DATABASE_URL_OWNER or DATABASE_URL is set)',
  () => {
    let ownerPool: pg.Pool;
    let appPool: pg.Pool;

    beforeAll(async () => {
      ownerPool = new Pool({ connectionString: ownerConnectionString });
      appPool = new Pool({ connectionString: appConnectionString() });
      await applyRequiredMigrations(ownerPool);
      await prepareFixture(ownerPool);
    });

    beforeEach(async () => {
      await cleanupOrgRows(ownerPool);
    });

    afterAll(async () => {
      if (ownerPool) {
        await ownerPool.query(`drop table if exists ${testTable}`);
        await ownerPool.query(`delete from app.session_org_contexts where org_id = $1::uuid`, [orgId]);
        await ownerPool.query(`delete from public.organizations where id = $1::uuid`, [orgId]);
        await ownerPool.query(`delete from public.tenants where id = $1::uuid`, [tenantId]);
        await ownerPool.end();
      }
      if (appPool) {
        await appPool.end();
      }
    });

    it('proves app_user cannot register session org context directly', async () => {
      await expect(
        appPool.query(
          `insert into app.session_org_contexts (session_token, org_id)
           values ($1::uuid, $2::uuid)`,
          [randomUUID(), orgId],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('establishes org context, runs handlers in order on one app transaction, and audits a text subject id', async () => {
      const domainA = domain('dispatcher.ordera');
      const domainB = domain('dispatcher.orderb');
      const subjectId = `not-a-uuid:${randomUUID()}`;
      const calls: Array<{ domain: string; ctx: ErasureContext; currentOrgId: string }> = [];

      const testA: ErasureHandler = async (ctx) => {
        const context = await ctx.tx.query<{ current_org_id: string }>(
          `select app.current_org_id()::text as current_org_id`,
        );
        calls.push({ domain: domainA, ctx, currentOrgId: context.rows[0]?.current_org_id ?? '' });
        return {
          domain: domainA,
          rowsAffected: 1,
          tablesTouched: ['public.alpha'],
          warnings: [],
        };
      };
      const testB: ErasureHandler = async (ctx) => {
        const context = await ctx.tx.query<{ current_org_id: string }>(
          `select app.current_org_id()::text as current_org_id`,
        );
        calls.push({ domain: domainB, ctx, currentOrgId: context.rows[0]?.current_org_id ?? '' });
        return {
          domain: domainB,
          rowsAffected: 2,
          tablesTouched: ['public.beta'],
          warnings: ['beta warning'],
        };
      };

      registerErasureHandler(domainA, testA);
      registerErasureHandler(domainB, testB);

      const report = await runErasure(ownerPool, appPool, orgId, subjectId, {
        domains: [domainA, domainB],
      });

      expect(calls.map((call) => call.domain)).toEqual([domainA, domainB]);
      expect(calls[0]?.ctx.tx).toBe(calls[1]?.ctx.tx);
      expect(calls.map((call) => call.currentOrgId)).toEqual([orgId, orgId]);
      expect(report.rowsAffected).toBe(3);
      expect(report.tablesTouched).toEqual(['public.alpha', 'public.beta']);

      const rows = await auditRows(ownerPool, subjectId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'gdpr.erasure.completed',
        resource_id: subjectId,
      });
      expect(rows[0]?.after_state).toMatchObject({
        orgId,
        subjectId,
        dryRun: false,
        domains: [domainA, domainB],
      });
    });

    it('rolls back handler writes, persists failure audit after rollback, and rethrows the original error', async () => {
      const writerDomain = domain('dispatcher.failure');
      const subjectId = `subject-fail:${randomUUID()}`;
      const original = new Error('handler failed as designed');

      registerErasureHandler(writerDomain, async (ctx) => {
        await ctx.tx.query(
          `insert into ${testTable} (id, org_id, subject_id, marker)
           values ($1::uuid, $2::uuid, $3, 'rolled-back')`,
          [randomUUID(), ctx.orgId, ctx.subjectId],
        );
        throw original;
      });

      await expect(
        runErasure(ownerPool, appPool, orgId, subjectId, { domains: [writerDomain] }),
      ).rejects.toBe(original);

      const businessRows = await ownerPool.query<{ count: number }>(
        `select count(*)::int as count
         from ${testTable}
         where org_id = $1::uuid and subject_id = $2`,
        [orgId, subjectId],
      );
      expect(businessRows.rows[0]?.count).toBe(0);

      const rows = await auditRows(ownerPool, subjectId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'gdpr.erasure.failed',
        resource_id: subjectId,
      });
      expect(rows[0]?.after_state).toMatchObject({
        orgId,
        subjectId,
        dryRun: false,
      });
      expect(rows[0]?.after_state.error).toMatchObject({
        name: 'Error',
        message: original.message,
      });
    });

    it('rolls back dry-run handler writes and persists only the dry-run audit event', async () => {
      const writerDomain = domain('dispatcher.dryrun');
      const subjectId = `subject-dry:${randomUUID()}`;
      const seenDryRun: boolean[] = [];

      registerErasureHandler(writerDomain, async (ctx) => {
        seenDryRun.push(ctx.dryRun);
        await ctx.tx.query(
          `insert into ${testTable} (id, org_id, subject_id, marker)
           values ($1::uuid, $2::uuid, $3, 'dry-run-should-not-persist')`,
          [randomUUID(), ctx.orgId, ctx.subjectId],
        );
        return {
          domain: writerDomain,
          rowsAffected: 1,
          tablesTouched: [testTable],
          warnings: [],
        };
      });

      const report = await runErasure(ownerPool, appPool, orgId, subjectId, {
        dryRun: true,
        domains: [writerDomain],
      });

      expect(seenDryRun).toEqual([true]);
      expect(report.dryRun).toBe(true);

      const businessRows = await ownerPool.query<{ count: number }>(
        `select count(*)::int as count
         from ${testTable}
         where org_id = $1::uuid and subject_id = $2`,
        [orgId, subjectId],
      );
      expect(businessRows.rows[0]?.count).toBe(0);

      const rows = await auditRows(ownerPool, subjectId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'gdpr.erasure.dry_run',
        resource_id: subjectId,
      });
    });
  },
);
