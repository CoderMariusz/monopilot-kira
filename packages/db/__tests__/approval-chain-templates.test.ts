import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  approvalChainTemplates,
  type ApprovalChainStep,
} from '../schema/approval-chain-templates.js';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '07700000-0000-4000-8000-000000000077';
const orgA = '07700000-0000-4000-8000-0000000000aa';
const orgB = '07700000-0000-4000-8000-0000000000bb';

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function seedOrg(pool: pg.Pool, orgId: string, name: string) {
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Approval Chain Templates Tenant', 'eu', 'https://approval-chain-templates.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await pool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, $3, 'bakery')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgId, tenantId, name],
  );
}

async function withOrgContext<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  orgId: string,
  callback: (client: pg.PoolClient) => Promise<T>,
) {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1, $2)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );

  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await callback(client);
    await client.query('rollback');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

describe('098 approval chain templates migration source', () => {
  it('uses org_id scope, chain_mode check, forced app.current_org_id RLS, app_user grants, and no stale tenant/current_setting reads', () => {
    const sql = readFileSync(resolve(process.cwd(), 'migrations/098-approval-chain-templates.sql'), 'utf8');

    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+"Reference"\."ApprovalChainTemplates"/i);
    expect(sql).toMatch(/org_id\s+uuid\s+not\s+null/i);
    expect(sql).not.toMatch(/\btenant_id\b/i);
    expect(sql).toMatch(/chain_mode\s+text\s+not\s+null/i);
    expect(sql).toMatch(/check\s*\(\s*chain_mode\s+in\s*\(\s*'single'\s*,\s*'multi'\s*\)\s*\)/i);
    expect(sql).toMatch(/steps\s+jsonb\s+not\s+null/i);
    expect(sql).toMatch(/primary\s+key\s*\(\s*org_id\s*,\s*template_id\s*\)/i);
    expect(sql).toMatch(/alter\s+table\s+"Reference"\."ApprovalChainTemplates"\s+enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/alter\s+table\s+"Reference"\."ApprovalChainTemplates"\s+force\s+row\s+level\s+security/i);
    expect(sql).toMatch(/using\s*\(\s*org_id\s*=\s*app\.current_org_id\(\)\s*\)/i);
    expect(sql).toMatch(/with\s+check\s*\(\s*org_id\s*=\s*app\.current_org_id\(\)\s*\)/i);
    expect(sql).toMatch(
      /grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+"Reference"\."ApprovalChainTemplates"\s+to\s+app_user/i,
    );
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationTest('approval chain templates table', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await ensureAppUser(ownerPool);
    await seedOrg(ownerPool, orgA, 'Approval Chain Templates Org A');
    await seedOrg(ownerPool, orgB, 'Approval Chain Templates Org B');
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  it("rejects chain_mode outside 'single' and 'multi'", async () => {
    await expect(
      ownerPool.query(
        `
          insert into "Reference"."ApprovalChainTemplates" (org_id, template_id, chain_mode, steps)
          values ($1, 'invalid-mode', 'triple', '[{"role":"manager","order":1,"required_count":1}]'::jsonb)
        `,
        [orgA],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('scopes rows by app.current_org_id and rejects cross-org inserts for app_user', async () => {
    await ownerPool.query(
      `
        insert into "Reference"."ApprovalChainTemplates" (org_id, template_id, chain_mode, steps)
        values
          ($1, 'default', 'single', '[{"role":"npd_manager","order":1,"required_count":1}]'::jsonb),
          ($2, 'default', 'multi', '[{"role":"technical","order":1,"required_count":1}]'::jsonb)
        on conflict (org_id, template_id) do update
          set chain_mode = excluded.chain_mode,
              steps = excluded.steps
      `,
      [orgA, orgB],
    );

    const visibleRows = await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      const result = await client.query<{ org_id: string; chain_mode: string }>(
        `
          select org_id, chain_mode
          from "Reference"."ApprovalChainTemplates"
          where template_id = 'default'
        `,
      );
      return result.rows;
    });
    expect(visibleRows).toEqual([{ org_id: orgA, chain_mode: 'single' }]);

    await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      await expect(
        client.query(
          `
            insert into "Reference"."ApprovalChainTemplates" (org_id, template_id, chain_mode, steps)
            values ($1, 'cross-org', 'single', '[{"role":"manager","order":1,"required_count":1}]'::jsonb)
          `,
          [orgB],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('rejects invalid steps with INVALID_STEPS during the Drizzle write path', async () => {
    const db = drizzle(ownerPool);

    await expect(async () => {
      await db.insert(approvalChainTemplates).values({
        orgId: orgA,
        templateId: 'missing-required-count',
        chainMode: 'single',
        steps: [{ role: 'manager', order: 1 } as unknown as ApprovalChainStep],
      });
    }).rejects.toThrow(/INVALID_STEPS/);
  });
});
