/**
 * T-036 — Schema-driven column draft/publish Server Actions (RED phase)
 *
 * Migration: packages/db/migrations/022-dept-column-drafts.sql
 *   (REASSIGNED from JSON's "011-dept-column-drafts.sql" — 011 is taken by T-019 departments
 *    per STATUS.md migration ordering lock.)
 *
 * NAMING COLLISION FIX: T-036 JSON's `schema_migrations` (column-version tracking) collides
 *   with T-054's `public.schema_migrations` (migration-runner state table).
 *   This RED test pins the renamed table: `dept_column_migrations`.
 *
 * Tables expected (implemented in GREEN):
 *   dept_column_drafts(
 *     id              uuid PK default gen_random_uuid(),
 *     org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 *     dept_id         uuid NOT NULL,
 *     column_key      text NOT NULL,
 *     field_type      text NOT NULL CHECK IN ('string','number','date','enum','formula','relation'),
 *     validation_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
 *     presentation_json jsonb NOT NULL DEFAULT '{}'::jsonb,
 *     status          text NOT NULL DEFAULT 'draft' CHECK IN ('draft','published'),
 *     created_by      uuid NOT NULL,
 *     created_at      timestamptz NOT NULL DEFAULT now()
 *   )
 *   dept_column_migrations(    -- RENAMED from JSON's `schema_migrations`
 *     id              bigserial PK,
 *     org_id          uuid NOT NULL,
 *     dept_column_id  uuid NOT NULL,
 *     prev_version    integer NOT NULL,
 *     new_version     integer NOT NULL,
 *     applied_at      timestamptz NOT NULL DEFAULT now()
 *   )
 *
 * Both tables: ENABLE+FORCE RLS; policy `org_id = app.current_org_id()`; GRANT to app_user.
 *
 * Server-Action signatures (packages/schema-driven/src/actions/draft.ts):
 *   upsertDeptColumnDraft({
 *     actorUserId, orgId, deptId, columnKey, fieldType, validationJson, presentationJson?
 *   }): Promise<UpsertResult>
 *     UpsertResult = { success: true; draftId: string } | { success: false; error: 'forbidden' }
 *
 *   publishDeptColumnDraft({ actorUserId, orgId, draftId }): Promise<PublishResult>
 *     PublishResult = { success: true; deptColumnId: string; newSchemaVersion: number; idempotent: boolean }
 *                   | { success: false; error: 'forbidden' | 'not_found' | 'already_published' }
 *
 * Use getAppConnection() for assertions; getOwnerConnection() for setup ONLY (T-058).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';
import {
  getAppConnection,
  getOwnerConnection,
} from '../../../db/test-utils/test-pool.js';

// ─── module under test (does not exist yet → RED) ───────────────────────────
import {
  upsertDeptColumnDraft,
  publishDeptColumnDraft,
} from '../actions/draft.js';

// ─── env guard ──────────────────────────────────────────────────────────────
const databaseUrl = process.env.DATABASE_URL;
const runIntegration = databaseUrl ? describe : describe.skip;

// ─── deterministic UUIDs ────────────────────────────────────────────────────
const tenantId  = '11111111-aaaa-4aaa-8aaa-111111111111';
const orgId     = '22222222-bbbb-4bbb-8bbb-222222222222';
const deptId    = '33333333-cccc-4ccc-8ccc-333333333333';
const adminId   = '44444444-dddd-4ddd-8ddd-444444444444'; // holds org.schema.admin
const noobId    = '55555555-eeee-4eee-8eee-555555555555'; // no role
const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

// ─── helpers ────────────────────────────────────────────────────────────────

async function applyMigrations(owner: pg.Pool): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner, appUserPassword);

  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dbRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../db');
  const migrations = [
    '001-baseline.sql',
    '002-rls-baseline.sql',
    '003-outbox.sql',
    '004-audit.sql',
    '005-tenant-idp-config.sql',
    '006-app-role.sql',
    '009-schema-driven.sql',
    '011-departments.sql',
    '017-rbac.sql',
    '022-dept-column-drafts.sql',
  ] as const;

  for (const file of migrations) {
    const p = resolve(dbRoot, 'migrations', file);
    if (existsSync(p)) {
      await owner.query(readFileSync(p, 'utf8'));
    }
  }
}

async function seedFixture(owner: pg.Pool): Promise<void> {
  // tenant + org
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-036 Test Tenant', 'eu', 'https://t036.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'T-036 Test Org', 'generic')
     on conflict (id) do nothing`,
    [orgId, tenantId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email) values
       ($1, $2, 'admin@t036.example'),
       ($3, $2, 'noob@t036.example')
     on conflict (id) do nothing`,
    [adminId, orgId, noobId],
  );

  // Grant org.schema.admin to admin user (system role auto-seeded by trigger from migration 017)
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
       select $1::uuid, r.id, $2::uuid
       from public.roles r
       where r.org_id = $2::uuid and r.slug = 'org.schema.admin'
     on conflict do nothing`,
    [adminId, orgId],
  );

  // Seed Reference.Departments so publishDeptColumnDraft can resolve dept_code for deptId.
  await owner.query(
    `INSERT INTO "Reference"."Departments" (id, org_id, code, display_name, role_description)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (org_id, code) DO NOTHING`,
    [deptId, orgId, 'production', 'Production', 'Production department'],
  );
}

async function cleanDraftTables(owner: pg.Pool): Promise<void> {
  await owner.query(`delete from public.dept_column_migrations where org_id = $1::uuid`, [orgId]);
  await owner.query(`delete from public.dept_column_drafts where org_id = $1::uuid`, [orgId]);
  await owner.query(
    `delete from "Reference"."DeptColumns" where org_id = $1::uuid and dept_code = 'production'`,
    [orgId],
  );
  await owner.query(
    `delete from public.audit_events where org_id = $1::uuid and resource_type = 'dept_column_draft'`,
    [orgId],
  );
}

async function fetchDraft(owner: pg.Pool, draftId: string) {
  const { rows } = await owner.query(
    `select id, org_id, dept_id, column_key, field_type, validation_json, status
       from public.dept_column_drafts where id = $1`,
    [draftId],
  );
  return rows[0];
}

async function fetchSchemaVersion(
  owner: pg.Pool,
  columnKey: string,
): Promise<number | null> {
  const { rows } = await owner.query<{ schema_version: number }>(
    `select schema_version from "Reference"."DeptColumns"
       where org_id = $1 and dept_code = 'production' and column_key = $2`,
    [orgId, columnKey],
  );
  return rows.length > 0 ? Number(rows[0]!.schema_version) : null;
}

async function countMigrationRows(owner: pg.Pool, deptColumnId: string): Promise<number> {
  const { rows } = await owner.query<{ c: string }>(
    `select count(*)::text as c from public.dept_column_migrations where dept_column_id = $1`,
    [deptColumnId],
  );
  return Number(rows[0]!.c);
}

// ════════════════════════════════════════════════════════════════════════════
// AC1 — upsertDeptColumnDraft happy path
// ════════════════════════════════════════════════════════════════════════════
runIntegration('AC1 — upsertDeptColumnDraft happy path (Schema Admin)', () => {
  let owner: pg.Pool;

  beforeAll(async () => {
    if (!databaseUrl) return;
    owner = getOwnerConnection();
    await applyMigrations(owner);
    await seedFixture(owner);
    await cleanDraftTables(owner);
  });

  afterAll(async () => {
    if (owner) await owner.end().catch(() => undefined);
  });

  it('inserts a dept_column_drafts row with status=draft and validation_json matching input EXACTLY', async () => {
    const validationInput = {
      enum_values: ['low', 'medium', 'high'],
      required: true,
      max_length: 16,
    };
    const result = await upsertDeptColumnDraft({
      actorUserId: adminId,
      orgId,
      deptId,
      columnKey: 'priority',
      fieldType: 'enum',
      validationJson: validationInput,
      presentationJson: { label: 'Priority' },
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(typeof result.draftId).toBe('string');
    expect(result.draftId.length).toBeGreaterThan(0);

    const row = await fetchDraft(owner, result.draftId);
    // Mutation: store wrong validation_json → exact-match fails
    expect(row).toMatchObject({
      org_id: orgId,
      dept_id: deptId,
      column_key: 'priority',
      field_type: 'enum',
      status: 'draft',
    });
    expect(row.validation_json).toEqual(validationInput);
  });

  it('rejects field_type outside allowed set with SQLSTATE 23514 (CHECK)', async () => {
    // Pin the CHECK constraint via direct INSERT (impl must NOT bypass).
    await expect(
      owner.query(
        `insert into public.dept_column_drafts
           (org_id, dept_id, column_key, field_type, validation_json, presentation_json, status, created_by)
         values ($1, $2, 'bogus', 'definitely_not_a_real_type', '{}'::jsonb, '{}'::jsonb, 'draft', $3)`,
        [orgId, deptId, adminId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AC2 — publishDeptColumnDraft transactional atomicity
// ════════════════════════════════════════════════════════════════════════════
runIntegration('AC2 — publishDeptColumnDraft transactional atomicity', () => {
  let owner: pg.Pool;

  beforeAll(async () => {
    if (!databaseUrl) return;
    owner = getOwnerConnection();
    await applyMigrations(owner);
    await seedFixture(owner);
  });

  beforeEach(async () => {
    if (!databaseUrl) return;
    await cleanDraftTables(owner);
  });

  afterAll(async () => {
    if (owner) await owner.end().catch(() => undefined);
  });

  it('happy path: bumps schema_version by EXACTLY 1, appends migration row, flips draft to published — single txn', async () => {
    // Pre-seed an existing DeptColumns row so we can test "version bump" (not just initial insert).
    await owner.query(
      `insert into "Reference"."DeptColumns"
         (id, org_id, dept_code, column_key, field_type, is_required, validation_dsl, schema_version)
       values ($1, $2, $3, 'lot_size', 'number', false, '{}'::jsonb, 7)
       on conflict (org_id, dept_code, column_key) do update set schema_version = excluded.schema_version`,
      [randomUUID(), orgId, 'production'],
    );

    const versionBefore = await fetchSchemaVersion(owner, 'lot_size');
    expect(versionBefore).toBe(7);

    const drafted = await upsertDeptColumnDraft({
      actorUserId: adminId,
      orgId,
      deptId,
      columnKey: 'lot_size',
      fieldType: 'number',
      validationJson: { min: 1, max: 9999 },
    });
    expect(drafted.success).toBe(true);
    if (!drafted.success) throw new Error('unreachable');

    const published = await publishDeptColumnDraft({
      actorUserId: adminId,
      orgId,
      draftId: drafted.draftId,
    });
    expect(published.success).toBe(true);
    if (!published.success) throw new Error('unreachable');

    // ── Assertion 1: schema_version bumped by EXACTLY 1
    // Mutation: accidental double-increment (e.g. UPDATE ... SET schema_version = schema_version + 2)
    //           would make this fail (got 9, expected 8).
    const versionAfter = await fetchSchemaVersion(owner, 'lot_size');
    expect(versionAfter).toBe(8);
    expect(published.newSchemaVersion).toBe(8);
    expect(published.idempotent).toBe(false);

    // ── Assertion 2: dept_column_migrations row appended
    // Mutation: skip migration insert → count delta fails.
    const migCount = await countMigrationRows(owner, published.deptColumnId);
    expect(migCount).toBe(1);
    const { rows: migRows } = await owner.query<{
      prev_version: number;
      new_version: number;
      org_id: string;
    }>(
      `select prev_version, new_version, org_id from public.dept_column_migrations
         where dept_column_id = $1`,
      [published.deptColumnId],
    );
    expect(migRows[0]).toMatchObject({
      org_id: orgId,
    });
    expect(Number(migRows[0]!.prev_version)).toBe(7);
    expect(Number(migRows[0]!.new_version)).toBe(8);

    // ── Assertion 3: draft.status flipped to 'published'
    // Mutation: skip status flip → still 'draft'.
    const draftAfter = await fetchDraft(owner, drafted.draftId);
    expect(draftAfter.status).toBe('published');
  });

  it('publishDeptColumnDraft with non-existent dept_id → returns dept_not_found, no version bump', async () => {
    // Mutation proof for the REWORK fix: before fix, a missing Reference.Departments row
    // silently fell back to dept_code='production'; now it must return dept_not_found.
    const missingDeptId = randomUUID(); // not seeded in Reference.Departments

    const drafted = await upsertDeptColumnDraft({
      actorUserId: adminId,
      orgId,
      deptId: missingDeptId, // unknown dept — no Reference.Departments row
      columnKey: 'orphan_col',
      fieldType: 'string',
      validationJson: {},
    });
    expect(drafted.success).toBe(true);
    if (!drafted.success) throw new Error('unreachable');

    const result = await publishDeptColumnDraft({
      actorUserId: adminId,
      orgId,
      draftId: drafted.draftId,
    });

    // Must NOT silently fall back to 'production'; must return explicit error.
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect(result.error).toBe('dept_not_found');

    // Draft must remain unpublished.
    const draftAfter = await fetchDraft(owner, drafted.draftId);
    expect(draftAfter.status).toBe('draft');
  });

  it('atomicity: simulated mid-publish failure rolls back ALL writes (no version bump, no mig row, draft stays draft)', async () => {
    // Pre-seed DeptColumns with known version
    const dcId = randomUUID();
    await owner.query(
      `insert into "Reference"."DeptColumns"
         (id, org_id, dept_code, column_key, field_type, is_required, validation_dsl, schema_version)
       values ($1, $2, $3, 'broken_col', 'number', false, '{}'::jsonb, 3)
       on conflict (org_id, dept_code, column_key) do update set schema_version = excluded.schema_version`,
      [dcId, orgId, 'production'],
    );

    const drafted = await upsertDeptColumnDraft({
      actorUserId: adminId,
      orgId,
      deptId,
      columnKey: 'broken_col',
      fieldType: 'number',
      validationJson: { min: 0 },
    });
    expect(drafted.success).toBe(true);
    if (!drafted.success) throw new Error('unreachable');

    // Force a conflict by manually inserting a CONFLICTING dept_column_migrations row
    // BEFORE publish runs, with the new_version that publish will try to insert.
    // If publish uses (dept_column_id, new_version) as a UNIQUE key for idempotency
    // detection, this simulates a partial prior failure. To trigger a hard failure
    // mid-publish, we instead inject a DDL that breaks the migration insert path:
    //
    // Approach: drop the dept_column_migrations table TEMPORARILY, run publish (which
    // will fail mid-transaction on the migration insert), then restore the table.
    // Snapshot state before, assert state unchanged after.
    const versionBefore = await fetchSchemaVersion(owner, 'broken_col');
    expect(versionBefore).toBe(3);

    // Snapshot drafts table
    const draftBefore = await fetchDraft(owner, drafted.draftId);
    expect(draftBefore.status).toBe('draft');

    // Rename target table to force INSERT failure mid-publish
    await owner.query(
      `alter table public.dept_column_migrations rename to dept_column_migrations__t036_renamed`,
    );

    let threwOrFailed = false;
    try {
      const r = await publishDeptColumnDraft({
        actorUserId: adminId,
        orgId,
        draftId: drafted.draftId,
      });
      // Either it throws OR returns success:false. Both are acceptable; what we need
      // is that the OTHER state mutations were rolled back.
      if (!r.success) threwOrFailed = true;
    } catch {
      threwOrFailed = true;
    } finally {
      // Restore table name
      await owner.query(
        `alter table public.dept_column_migrations__t036_renamed rename to dept_column_migrations`,
      );
    }

    expect(threwOrFailed).toBe(true);

    // Mutation: NOT wrapping all writes in a single transaction → version_after !== 3
    //           and/or draft.status === 'published'.
    const versionAfter = await fetchSchemaVersion(owner, 'broken_col');
    expect(versionAfter).toBe(3); // NO bump
    const draftAfter = await fetchDraft(owner, drafted.draftId);
    expect(draftAfter.status).toBe('draft'); // NOT flipped
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AC3 — idempotency
// ════════════════════════════════════════════════════════════════════════════
runIntegration('AC3 — publishDeptColumnDraft idempotency', () => {
  let owner: pg.Pool;

  beforeAll(async () => {
    if (!databaseUrl) return;
    owner = getOwnerConnection();
    await applyMigrations(owner);
    await seedFixture(owner);
    await cleanDraftTables(owner);
  });

  afterAll(async () => {
    if (owner) await owner.end().catch(() => undefined);
  });

  it('second publish call for same draftId is a no-op: same schema_version, same migration row count, same draft.status', async () => {
    // Pre-seed DeptColumns at version 4
    await owner.query(
      `insert into "Reference"."DeptColumns"
         (id, org_id, dept_code, column_key, field_type, is_required, validation_dsl, schema_version)
       values ($1, $2, $3, 'idem_col', 'string', false, '{}'::jsonb, 4)
       on conflict (org_id, dept_code, column_key) do update set schema_version = excluded.schema_version`,
      [randomUUID(), orgId, 'production'],
    );

    const drafted = await upsertDeptColumnDraft({
      actorUserId: adminId,
      orgId,
      deptId,
      columnKey: 'idem_col',
      fieldType: 'string',
      validationJson: { max_length: 64 },
    });
    expect(drafted.success).toBe(true);
    if (!drafted.success) throw new Error('unreachable');

    // First publish
    const first = await publishDeptColumnDraft({ actorUserId: adminId, orgId, draftId: drafted.draftId });
    expect(first.success).toBe(true);
    if (!first.success) throw new Error('unreachable');
    expect(first.idempotent).toBe(false);
    expect(first.newSchemaVersion).toBe(5);

    const versionAfterFirst = await fetchSchemaVersion(owner, 'idem_col');
    const migCountAfterFirst = await countMigrationRows(owner, first.deptColumnId);
    const draftAfterFirst = await fetchDraft(owner, drafted.draftId);
    expect(versionAfterFirst).toBe(5);
    expect(migCountAfterFirst).toBe(1);
    expect(draftAfterFirst.status).toBe('published');

    // Second publish — must be idempotent (no double bump, no duplicate row)
    const second = await publishDeptColumnDraft({ actorUserId: adminId, orgId, draftId: drafted.draftId });
    expect(second.success).toBe(true);
    if (!second.success) throw new Error('unreachable');

    // Mutation: 2nd publish double-bumps version → versionAfterSecond=6 (fails: expected 5)
    const versionAfterSecond = await fetchSchemaVersion(owner, 'idem_col');
    expect(versionAfterSecond).toBe(versionAfterFirst);

    // Mutation: 2nd publish appends another migration row → count=2 (fails: expected 1)
    const migCountAfterSecond = await countMigrationRows(owner, first.deptColumnId);
    expect(migCountAfterSecond).toBe(migCountAfterFirst);

    const draftAfterSecond = await fetchDraft(owner, drafted.draftId);
    expect(draftAfterSecond.status).toBe('published');

    // The action contract MUST surface idempotency to the caller
    expect(second.idempotent).toBe(true);
    expect(second.newSchemaVersion).toBe(versionAfterFirst);
    expect(second.deptColumnId).toBe(first.deptColumnId);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AC4 — RBAC guard (forbidden + audit_events with retention_class='security')
// ════════════════════════════════════════════════════════════════════════════
runIntegration('AC4 — RBAC: non-schema-admin caller → 403 + audit_events row (retention_class=security)', () => {
  let owner: pg.Pool;

  beforeAll(async () => {
    if (!databaseUrl) return;
    owner = getOwnerConnection();
    await applyMigrations(owner);
    await seedFixture(owner);
    await cleanDraftTables(owner);
  });

  afterAll(async () => {
    if (owner) await owner.end().catch(() => undefined);
  });

  async function countSecurityAuditFor(action: string): Promise<number> {
    const { rows } = await owner.query<{ c: string }>(
      `select count(*)::text as c
         from public.audit_events
         where org_id = $1
           and actor_user_id = $2
           and action = $3
           and retention_class = 'security'
           and resource_type = 'dept_column_draft'`,
      [orgId, noobId, action],
    );
    return Number(rows[0]!.c);
  }

  it('upsertDeptColumnDraft as non-admin → returns 403/forbidden AND writes audit_events with retention_class=security', async () => {
    const upsertBefore = await countSecurityAuditFor('dept_column.draft.denied');

    const result = await upsertDeptColumnDraft({
      actorUserId: noobId,
      orgId,
      deptId,
      columnKey: 'rbac_denied',
      fieldType: 'string',
      validationJson: {},
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    // Mutation: skipping RBAC → success=true, error undefined → both fail.
    expect(result.error).toBe('forbidden');
    // Some impls also expose an HTTP-style status; allow either contract via OR-assert:
    if ('status' in result) {
      expect((result as { status?: number }).status).toBe(403);
    }

    // Audit row written with retention_class='security' EXACTLY
    const upsertAfter = await countSecurityAuditFor('dept_column.draft.denied');
    expect(upsertAfter).toBe(upsertBefore + 1);

    // Mutation: writing retention_class='operational' instead would fail this exact-match
    // AND, if a CHECK constraint pins this action to 'security', the INSERT itself fires SQLSTATE 23514.
    const { rows } = await owner.query(
      `select retention_class, action, resource_type
         from public.audit_events
         where org_id = $1 and actor_user_id = $2 and action = 'dept_column.draft.denied'
         order by occurred_at desc limit 1`,
      [orgId, noobId],
    );
    expect(rows[0]).toMatchObject({
      retention_class: 'security',
      action: 'dept_column.draft.denied',
      resource_type: 'dept_column_draft',
    });

    // No draft row was created
    const { rows: draftRows } = await owner.query(
      `select id from public.dept_column_drafts where org_id = $1 and column_key = 'rbac_denied'`,
      [orgId],
    );
    expect(draftRows).toHaveLength(0);
  });

  it('publishDeptColumnDraft as non-admin → returns 403/forbidden AND writes audit_events with retention_class=security', async () => {
    // Setup: admin creates a legitimate draft so a non-admin attempt to publish it can be measured.
    const drafted = await upsertDeptColumnDraft({
      actorUserId: adminId,
      orgId,
      deptId,
      columnKey: 'rbac_publish_denied',
      fieldType: 'string',
      validationJson: {},
    });
    expect(drafted.success).toBe(true);
    if (!drafted.success) throw new Error('unreachable');

    const publishBefore = await countSecurityAuditFor('dept_column.publish.denied');

    const result = await publishDeptColumnDraft({
      actorUserId: noobId,
      orgId,
      draftId: drafted.draftId,
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect(result.error).toBe('forbidden');

    const publishAfter = await countSecurityAuditFor('dept_column.publish.denied');
    expect(publishAfter).toBe(publishBefore + 1);

    const { rows } = await owner.query(
      `select retention_class, action, resource_type
         from public.audit_events
         where org_id = $1 and actor_user_id = $2 and action = 'dept_column.publish.denied'
         order by occurred_at desc limit 1`,
      [orgId, noobId],
    );
    expect(rows[0]).toMatchObject({
      retention_class: 'security',
      action: 'dept_column.publish.denied',
      resource_type: 'dept_column_draft',
    });

    // Draft was NOT promoted (status still 'draft')
    const draftAfter = await fetchDraft(owner, drafted.draftId);
    expect(draftAfter.status).toBe('draft');
  });

  it('audit_events.retention_class CHECK rejects non-{security|standard|operational|ephemeral} with SQLSTATE 23514', async () => {
    // Pins the CHECK from migration 004; mutation: writing 'foobar' must fire 23514.
    await expect(
      owner.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, retention_class)
         values ($1, $2, 'user', 'dept_column.draft.denied', 'dept_column_draft', $3, $4, 'invalid_class')`,
        [orgId, noobId, randomUUID(), randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// RED-phase marker — runs even without DATABASE_URL so the file is non-empty
// when integration is skipped. Pins the import contract.
// ════════════════════════════════════════════════════════════════════════════
describe('RED — module contract', () => {
  it('upsertDeptColumnDraft and publishDeptColumnDraft are exported (will fail until GREEN creates actions/draft.ts)', () => {
    expect(typeof upsertDeptColumnDraft).toBe('function');
    expect(typeof publishDeptColumnDraft).toBe('function');
  });
});
