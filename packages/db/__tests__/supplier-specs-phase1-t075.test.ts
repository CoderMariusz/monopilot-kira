import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/174-supplier-specs-phase1-governance.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '17400000-0000-4000-8000-000000000001';
const orgA = '17400000-0000-4000-8000-0000000000aa';
const orgARole = '17400000-0000-4000-8000-00000000a111';
const orgAUser = '17400000-0000-4000-8000-00000000aaaa';
const rmItemA = '17400000-0000-4000-8000-0000000fffaa';
const supplierCode = 'SUP-T075-A';

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function seedBase(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T075 Tenant', 'eu', 'https://t075.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'T075 Org A', 'bakery')
     on conflict (id) do nothing`,
    [orgA, tenantId],
  );
  await pool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 't075_user', 'T075 Role A', '[]'::jsonb, true)
     on conflict (org_id, code) do nothing`,
    [orgARole, orgA],
  );
  await pool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 't075-a@example.test', 'T075 User A', $3)
     on conflict (id) do nothing`,
    [orgAUser, orgA, orgARole],
  );
  await pool.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
     values ($1, $2, 'T075-RM-A', 'rm', 'T075 RM A', 'kg')
     on conflict (id) do nothing`,
    [rmItemA, orgA],
  );
}

async function cleanup(pool: pg.Pool) {
  await pool.query('delete from public.supplier_spec_review_proposals where org_id = $1', [orgA]).catch(() => undefined);
  await pool.query('delete from public.supplier_specs where org_id = $1 and supplier_code = $2', [orgA, supplierCode]).catch(() => undefined);
}

async function trustOrgContext(pool: pg.Pool, sessionToken: string, orgId: string) {
  await pool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1, $2)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

async function insertSpec(
  pool: pg.Pool,
  opts: {
    supplierStatus?: string;
    lifecycle?: string;
    review?: string;
    expiry?: string | null;
    version: string;
  },
): Promise<string> {
  const id = randomUUID();
  // effective_from must be <= expiry (CHECK supplier_specs_expiry_after_effective_check).
  // When the test sets a past expiry, anchor effective_from earlier than that expiry.
  const effectiveFrom =
    opts.expiry && opts.expiry < '2100-01-01' && opts.expiry < new Date().toISOString().slice(0, 10)
      ? '1999-01-01'
      : null;
  await pool.query(
    `insert into public.supplier_specs
       (id, org_id, item_id, supplier_code, supplier_status, spec_version,
        effective_from, expiry_date, lifecycle_status, review_status,
        approved_by, approved_at, uploaded_by)
     values ($1, $2, $3, $4, $5, $6,
        coalesce($7::date, current_date), $8, $9, $10,
        case when $9 = 'active' and $10 = 'approved' then $11::uuid else null end,
        case when $9 = 'active' and $10 = 'approved' then now() else null end,
        $11::uuid)`,
    [
      id,
      orgA,
      rmItemA,
      supplierCode,
      opts.supplierStatus ?? 'approved',
      opts.version,
      effectiveFrom,
      opts.expiry ?? null,
      opts.lifecycle ?? 'active',
      opts.review ?? 'approved',
      orgAUser,
    ],
  );
  return id;
}

describe('174 supplier_specs Phase-1 governance migration file', () => {
  it('exists, Wave0-locked, preserves declared_allergens, no D365 FK / no new outbox type', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/create table if not exists public\.supplier_spec_review_proposals/i);
    expect(sql).toMatch(/supplier_spec_rm_usability/);
    expect(sql).toMatch(/supplier_spec_resolved_lifecycle/);
    expect(sql).toMatch(/approve_supplier_spec_review/);
    expect(sql).toMatch(/app\.current_org_id\(\)/);
    expect(sql).not.toMatch(/^\s*tenant_id\s+(uuid|text)/im);
    expect(sql).not.toMatch(/\bFA-[A-Z0-9]/);
    // declared_allergens carried, not dropped.
    expect(sql).toMatch(/declared_allergens/);
    // site_id day-1 on the new operational table.
    expect(sql).toMatch(/site_id uuid/);
  });
});

runIntegrationTest('174 supplier_specs Phase-1 governance behavior', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedBase(ownerPool);
    // Idempotency: applying twice must be clean.
    await ownerPool.query(readFileSync(migrationPath, 'utf8'));
    await ownerPool.query(readFileSync(migrationPath, 'utf8'));
    await cleanup(ownerPool);
  });

  afterAll(async () => {
    await cleanup(ownerPool);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('AC1: a second active+approved spec for same (org,item,supplier) is rejected', async () => {
    await insertSpec(ownerPool, { version: 'v1', lifecycle: 'active', review: 'approved' });
    await expect(
      insertSpec(ownerPool, { version: 'v2', lifecycle: 'active', review: 'approved' }),
    ).rejects.toThrow(/supplier_specs_one_active_approved|duplicate key/i);
    await cleanup(ownerPool);
  });

  it('AC2: expiry in the past resolves lifecycle to expired and RM usability cannot pass', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);
    const specId = await insertSpec(ownerPool, {
      version: 'v1',
      lifecycle: 'active',
      review: 'approved',
      expiry: '2000-01-01',
    });

    const resolved = await ownerPool.query<{ r: string }>(
      `select public.supplier_spec_resolved_lifecycle('active', '2000-01-01'::date) as r`,
    );
    expect(resolved.rows[0]?.r).toBe('expired');

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
      const usable = await client.query<{ usable: boolean; reason: string }>(
        `select usable, reason from public.supplier_spec_rm_usability($1)`,
        [specId],
      );
      expect(usable.rows[0]?.usable).toBe(false);
      expect(usable.rows[0]?.reason).toBe('EXPIRED');
      await client.query('rollback');
    } finally {
      client.release();
    }
    await cleanup(ownerPool);
  });

  it('AC4: supplier_status blocked => RM usability returns SUPPLIER_NOT_APPROVED', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);
    const specId = await insertSpec(ownerPool, {
      version: 'v1',
      supplierStatus: 'blocked',
      lifecycle: 'draft',
      review: 'pending',
    });
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
      const usable = await client.query<{ usable: boolean; reason: string }>(
        `select usable, reason from public.supplier_spec_rm_usability($1)`,
        [specId],
      );
      expect(usable.rows[0]?.usable).toBe(false);
      expect(usable.rows[0]?.reason).toBe('SUPPLIER_NOT_APPROVED');
      await client.query('rollback');
    } finally {
      client.release();
    }
    await cleanup(ownerPool);
  });

  it('AC6: approved + non-expired + supplier approved => RM usability OK', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);
    const specId = await insertSpec(ownerPool, {
      version: 'v1',
      supplierStatus: 'approved',
      lifecycle: 'active',
      review: 'approved',
      expiry: '2999-01-01',
    });
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
      const usable = await client.query<{ usable: boolean; reason: string }>(
        `select usable, reason from public.supplier_spec_rm_usability($1)`,
        [specId],
      );
      expect(usable.rows[0]?.usable).toBe(true);
      expect(usable.rows[0]?.reason).toBe('OK');
      await client.query('rollback');
    } finally {
      client.release();
    }
    await cleanup(ownerPool);
  });

  it('AC3/AC7: a PO proposal does NOT mutate the active spec; reject leaves it untouched', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);
    const activeSpecId = await insertSpec(ownerPool, {
      version: 'v1',
      lifecycle: 'active',
      review: 'approved',
      expiry: '2999-01-01',
    });

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      // PO review proposes a change (no mutation of supplier_specs).
      const proposal = await client.query<{ id: string }>(
        `insert into public.supplier_spec_review_proposals
           (org_id, supplier_spec_id, source, proposed_attrs, observed_notes, is_non_conformance, created_by)
         values ($1, $2, 'po_actual', '{"observed_protein": 11.2}'::jsonb, 'PO actual delta', true, $3)
         returning id`,
        [orgA, activeSpecId, orgAUser],
      );
      const proposalId = proposal.rows[0]?.id;

      // Active spec unchanged so far.
      const before = await client.query<{ review_status: string; lifecycle_status: string }>(
        `select review_status, lifecycle_status from public.supplier_specs where id = $1`,
        [activeSpecId],
      );
      expect(before.rows[0]?.review_status).toBe('approved');
      expect(before.rows[0]?.lifecycle_status).toBe('active');

      // Reject the proposal -> prior active+approved spec must remain untouched.
      await client.query(`select public.reject_supplier_spec_review($1, $2, 'rejected', false)`, [
        proposalId,
        orgAUser,
      ]);
      const after = await client.query<{ review_status: string; lifecycle_status: string }>(
        `select review_status, lifecycle_status from public.supplier_specs where id = $1`,
        [activeSpecId],
      );
      expect(after.rows[0]?.review_status).toBe('approved');
      expect(after.rows[0]?.lifecycle_status).toBe('active');

      const proposalState = await client.query<{ proposal_status: string }>(
        `select proposal_status from public.supplier_spec_review_proposals where id = $1`,
        [proposalId],
      );
      expect(proposalState.rows[0]?.proposal_status).toBe('rejected');

      await client.query('rollback');
    } finally {
      client.release();
    }
    await cleanup(ownerPool);
  });

  it('AC3: approveSupplierSpecReview clones a new active+approved spec and supersedes the prior one', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);
    const activeSpecId = await insertSpec(ownerPool, {
      version: 'v1',
      lifecycle: 'active',
      review: 'approved',
      expiry: '2999-01-01',
    });

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const proposal = await client.query<{ id: string }>(
        `insert into public.supplier_spec_review_proposals
           (org_id, supplier_spec_id, source, proposed_attrs, created_by)
         values ($1, $2, 'technical', '{"protein": 12.0}'::jsonb, $3)
         returning id`,
        [orgA, activeSpecId, orgAUser],
      );
      const proposalId = proposal.rows[0]?.id;

      const newSpecId = await client.query<{ approve_supplier_spec_review: string }>(
        `select public.approve_supplier_spec_review($1, $2, 'v2', null, 'approved') as approve_supplier_spec_review`,
        [proposalId, orgAUser],
      );
      const newId = newSpecId.rows[0]?.approve_supplier_spec_review;
      expect(newId).toBeTruthy();
      expect(newId).not.toBe(activeSpecId);

      // Prior spec superseded; new spec active+approved (single-active preserved).
      const prior = await client.query<{ lifecycle_status: string }>(
        `select lifecycle_status from public.supplier_specs where id = $1`,
        [activeSpecId],
      );
      expect(prior.rows[0]?.lifecycle_status).toBe('superseded');

      const created = await client.query<{ lifecycle_status: string; review_status: string; declared_attrs: unknown }>(
        `select lifecycle_status, review_status, declared_attrs from public.supplier_specs where id = $1`,
        [newId],
      );
      expect(created.rows[0]?.lifecycle_status).toBe('active');
      expect(created.rows[0]?.review_status).toBe('approved');
      expect(created.rows[0]?.declared_attrs).toMatchObject({ protein: 12.0 });

      const activeCount = await client.query<{ c: string }>(
        `select count(*)::text as c from public.supplier_specs
         where org_id = $1 and item_id = $2 and supplier_code = $3
           and lifecycle_status = 'active' and review_status = 'approved'`,
        [orgA, rmItemA, supplierCode],
      );
      expect(activeCount.rows[0]?.c).toBe('1');

      await client.query('rollback');
    } finally {
      client.release();
    }
    await cleanup(ownerPool);
  });
});
