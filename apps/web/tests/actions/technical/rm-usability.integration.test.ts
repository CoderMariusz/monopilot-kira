/**
 * T-074 — RM usability ENFORCEMENT: REAL DB-backed integration tests.
 *
 * Drives the `validateBomComponent` Server Action (the bom_edit enforcement
 * seam) through withOrgContext + RLS against real Supabase-shape data. Proves:
 *   - AC5: a blocking verdict (blocked item / expired spec / allergen conflict)
 *     rejects with `{ ok:false, error:'blocked', verdict }` carrying the same
 *     reason code, and NO bom_lines row is mutated;
 *   - the green path returns `{ ok:true, verdict }` with usable=true;
 *   - org isolation — the action only sees the caller-org's item.
 *
 * Skips when DATABASE_URL is unset.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  appUserPassword,
  databaseUrl,
  makeAppUserConnectionString,
  withActionActor,
} from '../../../app/(npd)/brief/actions/__tests__/brief-integration-helpers';
import { validateBomComponent } from '../../../actions/technical/boms/validate-component';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../helpers/owner-org-context.js';

const run = databaseUrl ? describe : describe.skip;

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  userAId: randomUUID(),
  userBId: randomUUID(),
  roleAId: randomUUID(),
  roleBId: randomUUID(),
  // items
  activeItemId: randomUUID(), // usable
  blockedItemId: randomUUID(), // ITEM_NOT_ACTIVE
  allergenItemId: randomUUID(), // ALLERGEN_CONFLICT
  expiredSpecItemId: randomUUID(), // SUPPLIER_SPEC_NOT_ACTIVE
};

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seedItem(orgId: string, id: string, code: string, status: string): Promise<void> {
  await owner.query(
    `insert into public.items (id, org_id, item_code, name, item_type, status, uom_base)
     values ($1, $2, $3, $3, 'rm', $4, 'kg') on conflict (id) do nothing`,
    [id, orgId, code, status],
  );
}

async function seedSpec(
  orgId: string,
  itemId: string,
  supplierCode: string,
  opts: { lifecycle: string; review: string; supplierStatus: string; expiry: string | null },
): Promise<void> {
  // effective_from must be <= expiry_date (CHECK constraint). For an expired
  // spec the effective date is in the past too.
  const effectiveFrom = opts.expiry && opts.expiry < '2026-01-01' ? '2019-01-01' : '2025-01-01';
  await owner.query(
    `insert into public.supplier_specs
       (org_id, item_id, supplier_code, supplier_status, spec_version,
        lifecycle_status, review_status, effective_from, expiry_date)
     values ($1, $2, $3, $4, 'v1', $5, $6, $7, $8)`,
    [orgId, itemId, supplierCode, opts.supplierStatus, opts.lifecycle, opts.review, effectiveFrom, opts.expiry],
  );
}

async function seedFixtures(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'RM IT Tenant', 'eu', 'https://rm-it.example.test') on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'RM IT Org A', 'fmcg'), ($4, $2, $5, 'RM IT Org B', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgAId, seed.tenantId, `rm-a-${seed.orgAId.slice(0, 8)}`, seed.orgBId, `rm-b-${seed.orgBId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values ($1, $2, 'rm-it', false, 'rm-it', 'RM IT', '[]'::jsonb, false, 10),
            ($3, $4, 'rm-it', false, 'rm-it', 'RM IT B', '[]'::jsonb, false, 10)
     on conflict (id) do nothing`,
    [seed.roleAId, seed.orgAId, seed.roleBId, seed.orgBId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values ($1, $2, $3, 'RM A', 'RM A', $4), ($5, $6, $7, 'RM B', 'RM B', $8)
     on conflict (id) do nothing`,
    [
      seed.userAId, seed.orgAId, `rm-a-${seed.userAId}@example.test`, seed.roleAId,
      seed.userBId, seed.orgBId, `rm-b-${seed.userBId}@example.test`, seed.roleBId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id) values ($1, $2, $3), ($4, $5, $6)
     on conflict (user_id, role_id) do nothing`,
    [seed.userAId, seed.roleAId, seed.orgAId, seed.userBId, seed.roleBId, seed.orgBId],
  );

  // Items (Org A).
  await seedItem(seed.orgAId, seed.activeItemId, `RM-OK-${seed.activeItemId.slice(0, 6)}`, 'active');
  await seedItem(seed.orgAId, seed.blockedItemId, `RM-BLK-${seed.blockedItemId.slice(0, 6)}`, 'blocked');
  await seedItem(seed.orgAId, seed.allergenItemId, `RM-ALG-${seed.allergenItemId.slice(0, 6)}`, 'active');
  await seedItem(seed.orgAId, seed.expiredSpecItemId, `RM-EXP-${seed.expiredSpecItemId.slice(0, 6)}`, 'active');

  // Specs: active+approved+in-date for the green + allergen + blocked items.
  const future = '2030-01-01';
  await seedSpec(seed.orgAId, seed.activeItemId, 'SUP-OK', { lifecycle: 'active', review: 'approved', supplierStatus: 'approved', expiry: future });
  await seedSpec(seed.orgAId, seed.blockedItemId, 'SUP-OK', { lifecycle: 'active', review: 'approved', supplierStatus: 'approved', expiry: future });
  await seedSpec(seed.orgAId, seed.allergenItemId, 'SUP-OK', { lifecycle: 'active', review: 'approved', supplierStatus: 'approved', expiry: future });
  // Expired spec for the expired-item case.
  await seedSpec(seed.orgAId, seed.expiredSpecItemId, 'SUP-EXP', { lifecycle: 'active', review: 'approved', supplierStatus: 'approved', expiry: '2020-01-01' });

  // Allergen profile: the allergen item CONTAINS milk.
  await owner.query(
    `insert into public.item_allergen_profiles (org_id, item_id, allergen_code, source, intensity)
     values ($1, $2, 'milk', 'supplier_spec', 'contains')
     on conflict (org_id, item_id, allergen_code) do nothing`,
    [seed.orgAId, seed.allergenItemId],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.item_allergen_profiles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.supplier_specs where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.bom_lines where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.items where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.user_roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.users where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.organizations where id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

run('T-074 validateBomComponent enforcement (RLS, real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert
    owner = new pg.Pool({ connectionString: databaseUrl });
    process.env.DATABASE_URL_APP = makeAppUserConnectionString();
    await seedFixtures();
  });

  afterAll(async () => {
    if (owner) {
      await cleanup().catch(() => undefined);
      await owner.end();
    }
    delete process.env.DATABASE_URL_APP;
  });

  it('green path: active item + active approved spec + no conflict → ok=true, usable', async () => {
    const r = await withActionActor(seed.userAId, seed.orgAId, () =>
      validateBomComponent({ itemId: seed.activeItemId }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.verdict.usable).toBe(true);
  });

  it('AC5: blocked item → ok=false, error=blocked, ITEM_NOT_ACTIVE, and NO bom_lines mutation', async () => {
    const before = await owner.query(`select count(*)::int as n from public.bom_lines where org_id = $1`, [seed.orgAId]);
    const r = await withActionActor(seed.userAId, seed.orgAId, () =>
      validateBomComponent({ itemId: seed.blockedItemId }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('blocked');
      expect(r.verdict?.blockingReasons).toContain('ITEM_NOT_ACTIVE');
    }
    const after = await owner.query(`select count(*)::int as n from public.bom_lines where org_id = $1`, [seed.orgAId]);
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  it('AC3 via the seam: target FG forbids milk + RM contains milk → ALLERGEN_CONFLICT with codes', async () => {
    const r = await withActionActor(seed.userAId, seed.orgAId, () =>
      validateBomComponent({ itemId: seed.allergenItemId, targetFgForbiddenAllergens: ['MILK'] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.verdict?.blockingReasons).toContain('ALLERGEN_CONFLICT');
      const confRow = r.verdict?.checks.find((c) => c.code === 'ALLERGEN_CONFLICT');
      expect(confRow?.allergenCodes).toEqual(['MILK']);
    }
  });

  it('AC2 via the seam: expired supplier_spec → SUPPLIER_SPEC_NOT_ACTIVE', async () => {
    const r = await withActionActor(seed.userAId, seed.orgAId, () =>
      validateBomComponent({ itemId: seed.expiredSpecItemId }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.verdict?.blockingReasons).toContain('SUPPLIER_SPEC_NOT_ACTIVE');
  });

  it('org isolation: Org B cannot resolve Org A item → item_not_found', async () => {
    const r = await withActionActor(seed.userBId, seed.orgBId, () =>
      validateBomComponent({ itemId: seed.activeItemId }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('item_not_found');
  });

  it('rejects a non-uuid itemId with invalid_input', async () => {
    const r = await withActionActor(seed.userAId, seed.orgAId, () =>
      validateBomComponent({ itemId: 'nope' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('invalid_input');
  });
});
