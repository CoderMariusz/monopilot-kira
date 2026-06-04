import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegration = databaseUrl ? describe : describe.skip;

const tenantId = '05710300-0000-4000-8000-000000000057';
const orgA = '05710300-1111-4000-8111-000000000057';
const orgB = '05710300-2222-4000-8222-000000000057';

describe('103 npd.project.created outbox migration source', () => {
  it('extends the canonical outbox event CHECK without tenant_id/current_setting leakage', () => {
    const sql = readFileSync(resolve(process.cwd(), 'migrations/103-npd-project-created-outbox.sql'), 'utf8');

    expect(sql).toMatch(/'npd\.project\.created'/);
    expect(sql).toMatch(/drop\s+constraint\s+if\s+exists\s+npd_projects_code_key/i);
    expect(sql).toMatch(/add\s+constraint\s+npd_projects_org_code_unique\s+unique\s*\(\s*org_id\s*,\s*code\s*\)/i);
    expect(sql).toMatch(/grant\s+select,\s*insert\s+on\s+public\.outbox_events\s+to\s+app_user/i);
    expect(sql).not.toMatch(/\btenant_id\b/i);
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
  });
});

runIntegration('npd.project.created outbox event app-role behavior', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedOrgs(ownerPool);
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  it('accepts npd.project.created and keeps outbox RLS non-vacuously org-scoped', async () => {
    const eventA = randomUUID();
    const eventB = randomUUID();
    await ownerPool.query(
      `
        insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
        values
          ($1::uuid, 'npd.project.created', 'npd_project', $2, '{}'::jsonb, 't057-test', $3),
          ($4::uuid, 'npd.project.created', 'npd_project', $5, '{}'::jsonb, 't057-test', $6)
        on conflict (org_id, dedup_key) where dedup_key is not null do nothing
      `,
      [orgA, eventA, `t057:${eventA}`, orgB, eventB, `t057:${eventB}`],
    );

    const visibleRows = await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      const result = await client.query<{ org_id: string; aggregate_id: string }>(
        `
          select org_id, aggregate_id
          from public.outbox_events
          where event_type = 'npd.project.created'
            and aggregate_id in ($1, $2)
          order by aggregate_id
        `,
        [eventA, eventB],
      );
      return result.rows;
    });
    expect(visibleRows).toEqual([{ org_id: orgA, aggregate_id: eventA }]);

    await expect(
      withOrgContext(appPool, ownerPool, orgA, async (client) => {
        await client.query(
          `
            insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
            values ($1::uuid, 'npd.project.created', 'npd_project', $2, '{}'::jsonb, 't057-test')
          `,
          [orgB, randomUUID()],
        );
      }),
    ).rejects.toThrow(/row-level security|violates row-level security|permission denied/i);
  });

  it('allows the same NPD project code in two orgs while preserving per-org RLS', async () => {
    const projectA = randomUUID();
    const projectB = randomUUID();
    await ownerPool.query(
      `
        delete from public.npd_projects
        where org_id in ($1::uuid, $2::uuid)
          and code = 'NPD-001'
          and app_version = 't057-test'
      `,
      [orgA, orgB],
    );

    await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      await client.query(
        `
          insert into public.npd_projects (id, org_id, code, name, type, current_gate, current_stage, start_from, app_version)
          values ($1::uuid, $2::uuid, 'NPD-001', 'T057 Org A duplicate-code proof', 'Recipe Standard', 'G0', 'brief', 'blank', 't057-test')
        `,
        [projectA, orgA],
      );
    }, { rollback: false });

    await withOrgContext(appPool, ownerPool, orgB, async (client) => {
      await client.query(
        `
          insert into public.npd_projects (id, org_id, code, name, type, current_gate, current_stage, start_from, app_version)
          values ($1::uuid, $2::uuid, 'NPD-001', 'T057 Org B duplicate-code proof', 'Recipe Standard', 'G0', 'brief', 'blank', 't057-test')
        `,
        [projectB, orgB],
      );
    }, { rollback: false });

    const allRows = await ownerPool.query<{ org_id: string; code: string }>(
      `
        select org_id, code
        from public.npd_projects
        where id in ($1::uuid, $2::uuid)
        order by org_id
      `,
      [projectA, projectB],
    );
    expect(allRows.rows).toEqual([
      { org_id: orgA, code: 'NPD-001' },
      { org_id: orgB, code: 'NPD-001' },
    ]);

    const orgAVisible = await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      const result = await client.query<{ id: string; org_id: string; code: string }>(
        `
          select id, org_id, code
          from public.npd_projects
          where code = 'NPD-001'
            and id in ($1::uuid, $2::uuid)
          order by id
        `,
        [projectA, projectB],
      );
      return result.rows;
    });
    expect(orgAVisible).toEqual([{ id: projectA, org_id: orgA, code: 'NPD-001' }]);
  });
});

async function seedOrgs(pool: pg.Pool) {
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1::uuid, 'T-057 Outbox Tenant', 'eu', 'https://t057-outbox.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await pool.query(
    `
      insert into public.organizations (id, tenant_id, slug, name, industry_code)
      values ($1::uuid, $2::uuid, 't-057-outbox-a', 'T-057 Outbox A', 'bakery'),
             ($3::uuid, $2::uuid, 't-057-outbox-b', 'T-057 Outbox B', 'bakery')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            slug = excluded.slug,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
}

async function withOrgContext<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  orgId: string,
  callback: (client: pg.PoolClient) => Promise<T>,
  options: { rollback?: boolean } = {},
) {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1::uuid, $2::uuid)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );

  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await callback(client);
    if (options.rollback === false) {
      await client.query('commit');
    } else {
      await client.query('rollback');
    }
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
