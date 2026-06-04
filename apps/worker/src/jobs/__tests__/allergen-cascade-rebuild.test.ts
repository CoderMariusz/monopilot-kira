import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getOwnerConnection } from '../../../../../packages/db/test-utils/test-pool.js';

import { registerAllergenCascadeRebuild } from '../allergen-cascade-rebuild.js';
import { JobRegistry, type Logger } from '../../registry.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '09910000-0000-4000-8000-000000000000';
const orgA = '09910000-0000-4000-8000-00000000000a';
const orgB = '09910000-0000-4000-8000-00000000000b';
const userA = '09910000-0000-4000-8000-0000000000aa';
const userB = '09910000-0000-4000-8000-0000000000bb';
const roleA = '09910000-0000-4000-8000-0000000001aa';
const roleB = '09910000-0000-4000-8000-0000000001bb';
const sourceA = '09910000-0000-4000-8000-00000000aaa1';
const sourceB = '09910000-0000-4000-8000-00000000bbb1';
const sourceA2 = '09910000-0000-4000-8000-00000000aaa2';

function logger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

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

async function seedReferenceRows(pool: pg.Pool, orgId: string) {
  await pool.query(
    `insert into "Reference"."Allergens_by_RM"
       (org_id, ingredient_codes, allergen_code, confidence, source, last_verified)
     values ($1, 'RM1939', 'soybeans', 'confirmed', 'supplier_spec', current_date)
     on conflict (org_id, ingredient_codes, allergen_code) do update
       set confidence = excluded.confidence,
           source = excluded.source,
           last_verified = excluded.last_verified`,
    [orgId],
  );
  await pool.query(
    `insert into "Reference"."Allergens_added_by_Process"
       (org_id, process_name, allergen_code, confidence, recipe_condition)
     values ($1, 'Roast', 'milk', 'confirmed', null)
     on conflict do nothing`,
    [orgId],
  );
}

async function seedBase(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-099 Worker Tenant', 'eu', 'https://t099-worker.example.test')
     on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'T-099 Worker Org A', 'bakery'),
            ($3, $2, 'T-099 Worker Org B', 'fmcg')
     on conflict (id) do update set name = excluded.name`,
    [orgA, tenantId, orgB],
  );
  await pool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 'npd_technical', 'T-099 Worker Role A', '[]'::jsonb, true),
            ($3, $4, 'npd_technical', 'T-099 Worker Role B', '[]'::jsonb, true)
     on conflict (org_id, code) do update set name = excluded.name`,
    [roleA, orgA, roleB, orgB],
  );
  await pool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 't099-worker-a@example.test', 'T-099 Worker User A', $3),
            ($4, $5, 't099-worker-b@example.test', 'T-099 Worker User B', $6)
     on conflict (id) do update set org_id = excluded.org_id, role_id = excluded.role_id`,
    [userA, orgA, roleA, userB, orgB, roleB],
  );
  await seedReferenceRows(pool, orgA);
  await seedReferenceRows(pool, orgB);
}

async function resetScenario(pool: pg.Pool) {
  await pool.query(`delete from public.audit_events where resource_type = 'allergen_cascade_rebuild'`);
  await pool.query(`delete from public.outbox_events where org_id::text like '099%'`);
  await pool.query(`delete from public.allergen_cascade_rebuild_jobs where org_id::text like '099%'`).catch(() => undefined);
  await pool.query(`delete from public.fa_allergen_overrides where product_code like 'FA-T099W-%'`);
  await pool.query(`delete from public.prod_detail where product_code like 'FA-T099W-%'`);
  await pool.query(`delete from public.product where product_code like 'FA-T099W-%'`);
  await pool.query(
    `insert into public.product (product_code, org_id, product_name, ingredient_codes, created_by_user)
     values
       ('FA-T099W-A-001', $1, 'Worker A 001', 'RM1939', $2),
       ('FA-T099W-A-002', $1, 'Worker A 002', 'RM1939', $2),
       ('FA-T099W-A-OVR', $1, 'Worker A override', 'RM1939', $2),
       ('FA-T099W-B-001', $3, 'Worker B 001', 'RM1939', $4)
     on conflict (product_code) do update
       set org_id = excluded.org_id,
           product_name = excluded.product_name,
           ingredient_codes = excluded.ingredient_codes,
           created_by_user = excluded.created_by_user,
           allergens = '{}'::text[],
           may_contain = '{}'::text[]`,
    [orgA, userA, orgB, userB],
  );
  await pool.query(
    `insert into public.prod_detail (product_code, org_id, intermediate_code, component_index, manufacturing_operation_1)
     values
       ('FA-T099W-A-002', $1, 'I-A-002', 1, 'Roast'),
       ('FA-T099W-B-001', $2, 'I-B-001', 1, 'Roast')`,
    [orgA, orgB],
  );
  await pool.query(
    `insert into public.fa_allergen_overrides
       (org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
     values ($1, 'FA-T099W-A-OVR', 'soybeans', 'remove', 'Confirmed label exception for test', $2, 'technical')`,
    [orgA, userA],
  );
}

async function insertBulkEvent(pool: pg.Pool, values: {
  orgId: string;
  eventType: 'reference.allergens_by_rm.bulk_changed' | 'reference.allergens_added_by_process.bulk_changed';
  sourceEventId: string;
  ingredientCodes?: string[];
  processNames?: string[];
}) {
  await pool.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
     values ($1, $2, 'reference', $3, $4::jsonb, 'test-t099', $5)
     on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
    [
      values.orgId,
      values.eventType,
      values.sourceEventId,
      JSON.stringify({
        source_event_id: values.sourceEventId,
        ingredient_codes: values.ingredientCodes ?? [],
        process_names: values.processNames ?? [],
      }),
      `t099:${values.sourceEventId}`,
    ],
  );
}

async function runJob(pool: pg.Pool) {
  const registry = new JobRegistry({ pool, logger: logger() });
  registerAllergenCascadeRebuild(registry, { batchSize: 100, debounceMs: 300_000 });
  await registry.runOnceForTest('allergen-cascade-rebuild');
}

run('allergen cascade rebuild worker', () => {
  let owner: pg.Pool;

  beforeAll(async () => {
    owner = getOwnerConnection();
    await seedBase(owner);
  });

  beforeEach(async () => {
    await resetScenario(owner);
  });

  afterAll(async () => {
    await owner?.end();
  });

  it('rebuilds affected FAs, preserves overrides, writes audit, emits one completion, and ignores replay', async () => {
    await insertBulkEvent(owner, {
      orgId: orgA,
      eventType: 'reference.allergens_by_rm.bulk_changed',
      sourceEventId: sourceA,
      ingredientCodes: ['RM1939'],
    });

    await runJob(owner);
    await insertBulkEvent(owner, {
      orgId: orgA,
      eventType: 'reference.allergens_by_rm.bulk_changed',
      sourceEventId: sourceA,
      ingredientCodes: ['RM1939'],
    });
    await runJob(owner);

    const products = await owner.query<{ product_code: string; allergens: string[] }>(
      `select product_code, allergens
       from public.product
       where product_code in ('FA-T099W-A-001', 'FA-T099W-A-002', 'FA-T099W-A-OVR')
       order by product_code`,
    );
    expect(products.rows).toEqual([
      { product_code: 'FA-T099W-A-001', allergens: ['soybeans'] },
      { product_code: 'FA-T099W-A-002', allergens: ['milk', 'soybeans'] },
      { product_code: 'FA-T099W-A-OVR', allergens: [] },
    ]);

    const overrideCount = await owner.query<{ count: string }>(
      `select count(*)::text from public.fa_allergen_overrides where product_code = 'FA-T099W-A-OVR'`,
    );
    expect(Number(overrideCount.rows[0].count)).toBe(1);

    const completions = await owner.query<{ payload: Record<string, unknown> }>(
      `select payload
       from public.outbox_events
       where org_id = $1
         and event_type = 'npd.allergens.bulk_rebuild_completed'`,
      [orgA],
    );
    expect(completions.rows).toHaveLength(1);
    expect(completions.rows[0].payload).toMatchObject({
      org_id: orgA,
      affected_count: 3,
      dropped_count: 0,
    });

    const changedEvents = await owner.query<{ count: string }>(
      `select count(*)::text
       from public.outbox_events
       where org_id = $1
         and event_type = 'fa.allergens_changed'
         and aggregate_id in ('FA-T099W-A-001', 'FA-T099W-A-002', 'FA-T099W-A-OVR')`,
      [orgA],
    );
    expect(Number(changedEvents.rows[0].count)).toBe(2);

    const audit = await owner.query<{ resource_id: string; override_diff: unknown }>(
      `select resource_id, after_state->'override_diff' as override_diff
       from public.audit_events
       where org_id = $1
         and resource_type = 'allergen_cascade_rebuild'
       order by resource_id`,
      [orgA],
    );
    expect(audit.rows.map((row) => row.resource_id)).toEqual([
      'FA-T099W-A-001',
      'FA-T099W-A-002',
      'FA-T099W-A-OVR',
    ]);
    expect(audit.rows.find((row) => row.resource_id === 'FA-T099W-A-OVR')?.override_diff).toEqual({
      add: [],
      remove: ['soybeans'],
    });
  });

  it('coalesces same-org events and keeps parallel orgs isolated', async () => {
    await insertBulkEvent(owner, {
      orgId: orgA,
      eventType: 'reference.allergens_by_rm.bulk_changed',
      sourceEventId: sourceA,
      ingredientCodes: ['RM1939'],
    });
    await insertBulkEvent(owner, {
      orgId: orgA,
      eventType: 'reference.allergens_added_by_process.bulk_changed',
      sourceEventId: sourceA2,
      processNames: ['Roast'],
    });
    await insertBulkEvent(owner, {
      orgId: orgB,
      eventType: 'reference.allergens_by_rm.bulk_changed',
      sourceEventId: sourceB,
      ingredientCodes: ['RM1939'],
    });

    await runJob(owner);

    const completions = await owner.query<{ org_id: string; affected_count: number; source_event_ids: string[] }>(
      `select org_id::text,
              (payload->>'affected_count')::int as affected_count,
              array(select jsonb_array_elements_text(payload->'source_event_ids')) as source_event_ids
       from public.outbox_events
       where org_id in ($1, $2)
         and event_type = 'npd.allergens.bulk_rebuild_completed'
       order by org_id`,
      [orgA, orgB],
    );

    expect(completions.rows).toEqual([
      { org_id: orgA, affected_count: 3, source_event_ids: [sourceA, sourceA2] },
      { org_id: orgB, affected_count: 1, source_event_ids: [sourceB] },
    ]);

    const products = await owner.query<{ product_code: string; org_id: string; allergens: string[] }>(
      `select product_code, org_id::text, allergens
       from public.product
       where product_code in ('FA-T099W-A-002', 'FA-T099W-B-001')
       order by product_code`,
    );
    expect(products.rows).toEqual([
      { product_code: 'FA-T099W-A-002', org_id: orgA, allergens: ['milk', 'soybeans'] },
      { product_code: 'FA-T099W-B-001', org_id: orgB, allergens: ['milk', 'soybeans'] },
    ]);
  });
});
