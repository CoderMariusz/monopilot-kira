import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  packageRoot,
  'migrations/168-bom-version-state-machine-clone-on-write.sql',
);

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '16800000-0000-4000-8000-000000000001';
const orgA = '16800000-0000-4000-8000-0000000000aa';
const orgARole = '16800000-0000-4000-8000-00000000a111';
const orgAUser = '16800000-0000-4000-8000-00000000aaaa';
const fgItemA = '16800000-0000-4000-8000-0000000fffaa';
const rmItemA = '16800000-0000-4000-8000-0000000fffcc';
const productA = 'FG-T073-A';

async function ensureAppUser(pool: pg.Pool) {
  // Serialize the role mutation across parallel test files (transaction-scoped advisory lock)
  // so concurrent CREATE/ALTER ROLE never hit "tuple concurrently updated" on pg_authid.
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(73730168)');
    await client.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'app_user') then
          create role app_user login password '${appUserPassword}';
        else
          alter role app_user login password '${appUserPassword}';
        end if;
      end
      $$;
    `);
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function seedBase(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T073 Tenant', 'eu', 'https://t073.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'T073 Org A', 'bakery')
     on conflict (id) do nothing`,
    [orgA, tenantId],
  );
  await pool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 't073_user', 'T073 Role A', '[]'::jsonb, true)
     on conflict (org_id, code) do nothing`,
    [orgARole, orgA],
  );
  await pool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 't073-a@example.test', 'T073 User A', $3)
     on conflict (id) do nothing`,
    [orgAUser, orgA, orgARole],
  );
  await pool.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
     values ($1, $2, 'T073-FG-A', 'fg', 'T073 FG A', 'kg'),
            ($3, $2, 'T073-RM-A', 'rm', 'T073 RM A', 'kg')
     on conflict (id) do nothing`,
    [fgItemA, orgA, rmItemA],
  );
  await pool.query('delete from public.bom_headers where org_id = $1 and product_id like $2', [orgA, productA + '%']);
  await pool.query('delete from public.product where product_code = $1', [productA]);
  await pool.query(
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
     values ($1, $2, 'T073 FG A', 1, $3)`,
    [productA, orgA, orgAUser],
  );
}

async function trustOrgContext(pool: pg.Pool, sessionToken: string, orgId: string) {
  await pool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1, $2)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

// Each active BOM uses its OWN product so the partial unique index
// bom_headers_active_version_idx (one active version per org/product) never collides
// across tests. Returns the header id; the product_code is unique per call.
async function insertActiveBom(pool: pg.Pool): Promise<string> {
  const id = randomUUID();
  const productCode = `${productA}-${id.slice(0, 8)}`;
  await pool.query(
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
     values ($1, $2, 'T073 FG', 1, $3)`,
    [productCode, orgA, orgAUser],
  );
  // Build the version as DRAFT first (lines/co-products can only be added to mutable headers
  // per the 090 immutability trigger), then promote draft -> in_review -> technical_approved
  // -> active through the (new) state machine.
  await pool.query(
    `insert into public.bom_headers
       (id, org_id, product_id, origin_module, status, version, created_by_user)
     values ($1, $2, $3, 'technical', 'draft', 1, $4)`,
    [id, orgA, productCode, orgAUser],
  );
  await pool.query(
    `insert into public.bom_lines
       (org_id, bom_header_id, line_no, component_code, component_type, item_id, quantity, uom)
     values ($1, $2, 1, 'T073-RM-A', 'RM', $3, 2.500000, 'kg')`,
    [orgA, id, rmItemA],
  );
  await pool.query(
    `insert into public.bom_co_products
       (org_id, bom_header_id, co_product_item_id, quantity, uom, allocation_pct)
     values ($1, $2, $3, 1.000000, 'kg', 10.000)`,
    [orgA, id, fgItemA],
  );
  await pool.query(`update public.bom_headers set status = 'in_review' where id = $1`, [id]);
  await pool.query(
    `update public.bom_headers set status = 'technical_approved', approved_by = $2, approved_at = now() where id = $1`,
    [id, orgAUser],
  );
  await pool.query(`update public.bom_headers set status = 'active' where id = $1`, [id]);
  return id;
}

describe('168 BOM state-machine + clone-on-write migration file', () => {
  it('exists and is Wave0-locked (app.current_org_id, no tenant_id/raw GUC, FG-canonical)', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/bom_headers_enforce_status_transition/);
    expect(sql).toMatch(/bom_request_version_edit/);
    expect(sql).toMatch(/bom_factory_release_bundle_decision/);
    expect(sql).toMatch(/app\.current_org_id\(\)/);
    expect(sql).not.toMatch(/^\s*tenant_id\s+(uuid|text)/im);
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
    expect(sql).not.toMatch(/\bFA-[A-Z0-9]/);
    // No new outbox event types invented — reuse the registered one only.
    expect(sql).toMatch(/'bom\.version_submitted'/);
  });
});

runIntegrationTest('168 BOM version state machine', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedBase(ownerPool);
    // Idempotency: applying the migration twice must be a clean no-op.
    await ownerPool.query(readFileSync(migrationPath, 'utf8'));
    await ownerPool.query(readFileSync(migrationPath, 'utf8'));
  });

  afterAll(async () => {
    await ownerPool.query('delete from public.bom_headers where org_id = $1 and product_id like $2', [orgA, productA + '%']).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('AC: state-machine rejects re-opening a terminal version (superseded -> active)', async () => {
    // A direct forward activation (draft -> active, with approval evidence) is allowed for
    // atomic/seed activation; the clone-on-write invariant is that an IMMUTABLE/terminal
    // version may never re-open. superseded -> active must be rejected.
    const id = await insertActiveBom(ownerPool);
    await ownerPool.query(`update public.bom_headers set status = 'superseded' where id = $1`, [id]);
    await expect(
      ownerPool.query(`update public.bom_headers set status = 'active' where id = $1`, [id]),
    ).rejects.toThrow(/invalid BOM version status transition/i);
    await ownerPool.query('delete from public.bom_headers where id = $1', [id]);
  });

  it('AC: state-machine rejects a backward move active -> draft', async () => {
    const id = await insertActiveBom(ownerPool);
    await expect(
      ownerPool.query(`update public.bom_headers set status = 'draft' where id = $1`, [id]),
    ).rejects.toThrow(/invalid BOM version status transition|immutable/i);
    await ownerPool.query('delete from public.bom_headers where id = $1', [id]);
  });

  it('AC: state-machine permits active -> superseded', async () => {
    const id = await insertActiveBom(ownerPool);
    await expect(
      ownerPool.query(`update public.bom_headers set status = 'superseded' where id = $1`, [id]),
    ).resolves.toBeTruthy();
    await ownerPool.query('delete from public.bom_headers where id = $1', [id]);
  });

  it('AC2: clone-on-write — bom_request_version_edit creates a NEW in_review version, source unchanged', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);
    const activeId = await insertActiveBom(ownerPool);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const cloned = await client.query<{
        decision: string;
        bom_header_id: string;
        status: string;
        version: number;
        supersedes_bom_header_id: string;
      }>(`select * from public.bom_request_version_edit($1, $2, $3)`, [
        activeId,
        orgAUser,
        'Edit requested',
      ]);
      expect(cloned.rows[0]?.decision).toBe('cloned');
      expect(cloned.rows[0]?.status).toBe('in_review');
      expect(cloned.rows[0]?.version).toBe(2);
      expect(cloned.rows[0]?.supersedes_bom_header_id).toBe(activeId);

      // Lines + co-products copied onto the new draft.
      const newId = cloned.rows[0]?.bom_header_id;
      const lineCount = await client.query<{ c: string }>(
        `select count(*)::text as c from public.bom_lines where bom_header_id = $1`,
        [newId],
      );
      expect(lineCount.rows[0]?.c).toBe('1');
      const cpCount = await client.query<{ c: string }>(
        `select count(*)::text as c from public.bom_co_products where bom_header_id = $1`,
        [newId],
      );
      expect(cpCount.rows[0]?.c).toBe('1');

      // Source active version is byte-for-byte unchanged (status + content).
      const src = await client.query<{ status: string; version: number }>(
        `select status, version from public.bom_headers where id = $1`,
        [activeId],
      );
      expect(src.rows[0]?.status).toBe('active');
      expect(src.rows[0]?.version).toBe(1);

      // Idempotent: a second call returns the existing in-flight draft, not a new one.
      const again = await client.query<{ decision: string; bom_header_id: string }>(
        `select * from public.bom_request_version_edit($1, $2, $3)`,
        [activeId, orgAUser, 'Edit requested again'],
      );
      expect(again.rows[0]?.decision).toBe('existing');
      expect(again.rows[0]?.bom_header_id).toBe(newId);

      await client.query('rollback');
    } finally {
      client.release();
    }
    await ownerPool.query('delete from public.bom_headers where org_id = $1 and product_id like $2', [orgA, productA + '%']);
  });

  it('clone-on-write helper rejects editing a draft (only immutable versions clone)', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);
    const id = randomUUID();
    await ownerPool.query(
      `insert into public.bom_headers (id, org_id, product_id, origin_module, status, version, created_by_user)
       values ($1, $2, $3, 'technical', 'draft', 1, $4)`,
      [id, orgA, productA, orgAUser],
    );
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
      await expect(
        client.query(`select * from public.bom_request_version_edit($1, $2, null)`, [id, orgAUser]),
      ).rejects.toThrow(/directly editable|clone-on-write only applies/i);
      await client.query('rollback');
    } finally {
      client.release();
    }
    await ownerPool.query('delete from public.bom_headers where id = $1', [id]);
  });

  it('AC5: bundle decision rejects partial release (BOM ready, factory_spec not) unless split', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);
    const bomId = await insertActiveBom(ownerPool);

    const specId = randomUUID();
    await ownerPool.query(
      `insert into public.factory_specs (id, org_id, fg_item_id, spec_code, version, status, source, created_by)
       values ($1, $2, $3, 'T073-SPEC', 1, 'draft', 'technical', $4)`,
      [specId, orgA, fgItemA, orgAUser],
    );

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      // BOM active, spec draft -> partial -> reject.
      const partial = await client.query<{ decision: string; reason: string }>(
        `select decision, reason from public.bom_factory_release_bundle_decision($1, $2, false)`,
        [bomId, specId],
      );
      expect(partial.rows[0]?.decision).toBe('reject');
      expect(partial.rows[0]?.reason).toBe('PARTIAL_RELEASE_NOT_ALLOWED');

      // Explicit split unblocks the ready side.
      const split = await client.query<{ decision: string }>(
        `select decision from public.bom_factory_release_bundle_decision($1, $2, true)`,
        [bomId, specId],
      );
      expect(split.rows[0]?.decision).toBe('approve');

      await client.query('rollback');
    } finally {
      client.release();
    }
    await ownerPool.query('delete from public.factory_specs where id = $1', [specId]);
    await ownerPool.query('delete from public.bom_headers where org_id = $1 and product_id like $2', [orgA, productA + '%']);
  });

  it('AC5: bundle decision approves when BOM active AND factory_spec approved_for_factory', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);
    const bomId = await insertActiveBom(ownerPool);

    const specId = randomUUID();
    await ownerPool.query(
      `insert into public.factory_specs
         (id, org_id, fg_item_id, spec_code, version, status, source, approved_by, approved_at, created_by)
       values ($1, $2, $3, 'T073-SPEC-OK', 1, 'approved_for_factory', 'technical', $4, now(), $4)`,
      [specId, orgA, fgItemA, orgAUser],
    );

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
      const ok = await client.query<{ decision: string; reason: string | null }>(
        `select decision, reason from public.bom_factory_release_bundle_decision($1, $2, false)`,
        [bomId, specId],
      );
      expect(ok.rows[0]?.decision).toBe('approve');
      expect(ok.rows[0]?.reason).toBeNull();
      await client.query('rollback');
    } finally {
      client.release();
    }
    await ownerPool.query('delete from public.factory_specs where id = $1', [specId]);
    await ownerPool.query('delete from public.bom_headers where org_id = $1 and product_id like $2', [orgA, productA + '%']);
  });
});
