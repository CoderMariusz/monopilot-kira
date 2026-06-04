import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../db/test-utils/test-pool.js';

import { queueAllergenCascadeRebuild } from '../src/bulk-rebuild.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '09900000-0000-4000-8000-000000000000';
const orgA = '09900000-0000-4000-8000-00000000000a';
const orgB = '09900000-0000-4000-8000-00000000000b';
const userA = '09900000-0000-4000-8000-0000000000aa';
const userB = '09900000-0000-4000-8000-0000000000bb';
const roleA = '09900000-0000-4000-8000-0000000001aa';
const roleB = '09900000-0000-4000-8000-0000000001bb';

async function ensureAppUser(pool: pg.Pool) {
  const password = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
  await pool.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${password}';
      else
        alter role app_user login password '${password}';
      end if;
    end
    $$;
  `);
}

async function trustOrg(pool: pg.Pool, sessionToken: string, orgId: string) {
  await pool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1, $2)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

async function seedBase(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-099 Tenant', 'eu', 'https://t099.example.test')
     on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'T-099 Org A', 'bakery'),
            ($3, $2, 'T-099 Org B', 'fmcg')
     on conflict (id) do update set name = excluded.name`,
    [orgA, tenantId, orgB],
  );
  await pool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 'npd_technical', 'T-099 Role A', '[]'::jsonb, true),
            ($3, $4, 'npd_technical', 'T-099 Role B', '[]'::jsonb, true)
     on conflict (org_id, code) do update set name = excluded.name`,
    [roleA, orgA, roleB, orgB],
  );
  await pool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 't099-a@example.test', 'T-099 User A', $3),
            ($4, $5, 't099-b@example.test', 'T-099 User B', $6)
     on conflict (id) do update set org_id = excluded.org_id, role_id = excluded.role_id`,
    [userA, orgA, roleA, userB, orgB, roleB],
  );
  await pool.query(
    `delete from public.allergen_cascade_rebuild_jobs where org_id in ($1, $2)`,
    [orgA, orgB],
  ).catch(() => undefined);
  await pool.query(`delete from public.prod_detail where product_code like 'FA-T099-%'`);
  await pool.query(`delete from public.product where product_code like 'FA-T099-%'`);
  await pool.query(
    `insert into public.product (product_code, org_id, product_name, ingredient_codes, created_by_user)
     values
       ('FA-T099-RM-A1', $1, 'RM A1', 'RM1939, RM2000', $2),
       ('FA-T099-RM-A2', $1, 'RM A2', 'RM1939', $2),
       ('FA-T099-PROC-A', $1, 'Proc A', 'RM0001', $2),
       ('FA-T099-UNTOUCHED-A', $1, 'Untouched A', 'RM404', $2),
       ('FA-T099-RM-B', $3, 'RM B', 'RM1939', $4)
     on conflict (org_id, product_code) do update
       set org_id = excluded.org_id,
           product_name = excluded.product_name,
           ingredient_codes = excluded.ingredient_codes,
           created_by_user = excluded.created_by_user`,
    [orgA, userA, orgB, userB],
  );
  await pool.query(
    `insert into public.prod_detail (product_code, org_id, intermediate_code, component_index, manufacturing_operation_1)
     values
       ('FA-T099-PROC-A', $1, 'I-PROC-A', 1, 'Roast'),
       ('FA-T099-UNTOUCHED-A', $1, 'I-OTHER-A', 1, 'Pack'),
       ('FA-T099-RM-B', $2, 'I-RM-B', 1, 'Roast')`,
    [orgA, orgB],
  );
}

run('allergen bulk rebuild SQL helper', () => {
  let owner: pg.Pool;
  let app: pg.Pool;

  beforeAll(async () => {
    owner = getOwnerConnection();
    app = getAppConnection();
    await seedBase(owner);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  it('queues only the affected FA set for the current org', async () => {
    const sessionToken = randomUUID();
    const sourceEventId = randomUUID();
    await trustOrg(owner, sessionToken, orgA);

    const rows = await queueAllergenCascadeRebuild(app, {
      orgId: orgA,
      sessionToken,
      sourceEventId,
      ingredientCodes: ['RM1939'],
      processNames: ['Roast'],
    });

    expect(rows.map((row) => row.productCode).sort()).toEqual([
      'FA-T099-PROC-A',
      'FA-T099-RM-A1',
      'FA-T099-RM-A2',
    ]);
    expect(rows.every((row) => row.inserted)).toBe(true);

    const queued = await owner.query<{ product_code: string; source_event_id: string }>(
      `select product_code, source_event_id::text
       from public.allergen_cascade_rebuild_jobs
       where org_id = $1
       order by product_code`,
      [orgA],
    );
    expect(queued.rows).toEqual(
      rows
        .map((row) => ({ product_code: row.productCode, source_event_id: sourceEventId }))
        .sort((a, b) => a.product_code.localeCompare(b.product_code)),
    );
  });

  it('deduplicates duplicate source events and rejects cross-org queue attempts', async () => {
    const sessionToken = randomUUID();
    const sourceEventId = randomUUID();
    await trustOrg(owner, sessionToken, orgA);

    const first = await queueAllergenCascadeRebuild(app, {
      orgId: orgA,
      sessionToken,
      sourceEventId,
      ingredientCodes: ['RM1939'],
      processNames: [],
    });
    const replay = await queueAllergenCascadeRebuild(app, {
      orgId: orgA,
      sessionToken,
      sourceEventId,
      ingredientCodes: ['RM1939'],
      processNames: [],
    });

    expect(first.map((row) => row.productCode).sort()).toEqual([
      'FA-T099-RM-A1',
      'FA-T099-RM-A2',
    ]);
    expect(replay.map((row) => row.inserted)).toEqual([false, false]);

    await expect(
      queueAllergenCascadeRebuild(app, {
        orgId: orgB,
        sessionToken,
        sourceEventId: randomUUID(),
        ingredientCodes: ['RM1939'],
        processNames: [],
      }),
    ).rejects.toThrow(/current org|org context|does not match|invalid organization context/i);
  });

  it('enforces queue table RLS visibility and WITH CHECK across orgs', async () => {
    const sessionToken = randomUUID();
    await trustOrg(owner, sessionToken, orgA);

    await owner.query(
      // Per-org PK (migration 142): the composite FK requires a product row in
      // the SAME org. 'FA-T099-RM-B' is the orgB-scoped product; use it so this
      // orgB job row is valid (RLS visibility is what this test exercises).
      `insert into public.allergen_cascade_rebuild_jobs
         (org_id, product_code, source_event_id, source_event_type)
       values ($1, 'FA-T099-RM-B', gen_random_uuid(), 'reference.allergens_by_rm.bulk_changed')
       on conflict do nothing`,
      [orgB],
    );

    const client = await app.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const visible = await client.query<{ org_id: string }>(
        `select distinct org_id::text
         from public.allergen_cascade_rebuild_jobs
         where org_id in ($1::uuid, $2::uuid)
         order by org_id`,
        [orgA, orgB],
      );
      expect(visible.rows).toEqual([{ org_id: orgA }]);

      await expect(
        client.query(
          `insert into public.allergen_cascade_rebuild_jobs
             (org_id, product_code, source_event_id, source_event_type)
           values ($1, 'FA-T099-RM-B', gen_random_uuid(), 'reference.allergens_by_rm.bulk_changed')`,
          [orgB],
        ),
      ).rejects.toThrow(/row-level security|violates row-level security|permission denied/i);
      await client.query('rollback');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
});
