/**
 * T-080 — RED→GREEN REAL DB-backed integration tests for the FactorySpec+BOM bundle
 * approval/rejection Server Actions.
 *
 * Drives approveReleaseBundleAction / rejectReleaseBundleAction through the real
 * withOrgContext app_user transaction (RLS via app.current_org_id()). Owner SQL is used
 * only for seed / cleanup / persisted-row assertions. Proves:
 *   - AC1 atomic approve moves factory_spec → approved_for_factory AND BOM →
 *     technical_approved, emits one technical.factory_spec.approved event, and the T-081
 *     release adapter sets the NPD soft uuid factory_release_status.active_factory_spec_id;
 *   - AC2 a release blocker (RM usability fail) rejects atomically — neither side moves;
 *   - AC3 D365 disabled: local release still works (no D365 dependency anywhere);
 *   - AC4 released bundle is immutable — re-approve returns released_record_immutable;
 *   - AC5 a user without technical.product_spec.approve is forbidden;
 *   - split prohibition: rejection leaves both sides un-released;
 *   - e-sign enforced: a wrong PIN returns esign_failed and nothing is released.
 *
 * Skips automatically when DATABASE_URL is unset.
 */
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  appUserPassword,
  databaseUrl,
  makeAppUserConnectionString,
  withActionActor,
} from '../../../app/(npd)/brief/actions/__tests__/brief-integration-helpers';
import { approveReleaseBundleAction } from '../../../actions/technical/release-bundles/approve-bundle';
import { rejectReleaseBundleAction } from '../../../actions/technical/release-bundles/reject-bundle';

const run = databaseUrl ? describe : describe.skip;

const APPROVE_PERMS = ['technical.product_spec.approve', 'technical.bom.approve'];
const PIN = '135790';

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  approverUserId: randomUUID(),
  viewerUserId: randomUUID(),
  approverRoleId: randomUUID(),
  viewerRoleId: randomUUID(),
  orgBRoleId: randomUUID(),
  orgBUserId: randomUUID(),
};

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await owner.query(`
    do $$
    begin
      perform pg_advisory_xact_lock(hashtext('t080:ensure-app-user'));
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}';
      else
        alter role app_user login password '${appUserPassword}';
      end if;
    end
    $$;
  `);
}

async function seedIdentities(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-080 IT Tenant', 'eu', 'https://t080.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'T-080 Org A', 'fmcg'), ($4, $2, $5, 'T-080 Org B', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgAId, seed.tenantId, `t080-a-${seed.orgAId.slice(0, 8)}`, seed.orgBId, `t080-b-${seed.orgBId.slice(0, 8)}`],
  );
  const permsJson = JSON.stringify(APPROVE_PERMS);
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 't080-approver', false, 't080-approver', 'T-080 Approver', $3::jsonb, false, 30),
       ($4, $2, 't080-viewer', false, 't080-viewer', 'T-080 Viewer', '[]'::jsonb, false, 31),
       ($5, $6, 't080-approver-b', false, 't080-approver-b', 'T-080 Approver B', $3::jsonb, false, 30)
     on conflict (id) do nothing`,
    [seed.approverRoleId, seed.orgAId, permsJson, seed.viewerRoleId, seed.orgBRoleId, seed.orgBId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     select r.id, p.permission
       from (values ($1::uuid), ($2::uuid)) r(id)
       cross join unnest($3::text[]) as p(permission)
     on conflict (role_id, permission) do nothing`,
    [seed.approverRoleId, seed.orgBRoleId, APPROVE_PERMS],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'T-080 Approver', 'T-080 Approver', $4),
       ($5, $2, $6, 'T-080 Viewer', 'T-080 Viewer', $7),
       ($8, $9, $10, 'T-080 Approver B', 'T-080 Approver B', $11)
     on conflict (id) do nothing`,
    [
      seed.approverUserId, seed.orgAId, `t080-approver-${seed.approverUserId}@example.test`, seed.approverRoleId,
      seed.viewerUserId, `t080-viewer-${seed.viewerUserId}@example.test`, seed.viewerRoleId,
      seed.orgBUserId, seed.orgBId, `t080-approver-b-${seed.orgBUserId}@example.test`, seed.orgBRoleId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3), ($6, $7, $8)
     on conflict (user_id, role_id) do nothing`,
    [
      seed.approverUserId, seed.approverRoleId, seed.orgAId,
      seed.viewerUserId, seed.viewerRoleId,
      seed.orgBUserId, seed.orgBRoleId, seed.orgBId,
    ],
  );
  const pinHash = await argon2.hash(PIN, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  await owner.query(
    `insert into public.user_pins (user_id, pin_hash, attempts_count, locked_until, last_attempt_at)
     values ($1, $2, 0, null, null), ($3, $2, 0, null, null)
     on conflict (user_id) do update set pin_hash = excluded.pin_hash, attempts_count = 0, locked_until = null`,
    [seed.approverUserId, pinHash, seed.orgBUserId],
  );
}

type Bundle = {
  fgItemId: string;
  bomHeaderId: string;
  factorySpecId: string;
};

/**
 * Seed an FG item, an active component item, a BOM header (draft) with a usable line, and
 * an in_review factory_spec in org A. When `npd` is true, also seed an NPD project +
 * product + a pending_technical_approval factory_release_status so the release-loop
 * adapter (T-081) has a row to update.
 */
async function seedBundle(opts: { npd: boolean; inactiveComponent?: boolean }): Promise<Bundle & { productCode?: string; projectId?: string }> {
  const fgItemId = randomUUID();
  const componentId = randomUUID();
  const bomHeaderId = randomUUID();
  const factorySpecId = randomUUID();
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const fgCode = `FG-${suffix}`;
  const rmCode = `RM-${suffix}`;

  await owner.query(
    `insert into public.items (id, org_id, item_code, item_type, name, status, uom_base, created_by)
     values
       ($1, $2, $3, 'fg', 'T-080 FG', 'active', 'kg', $7),
       ($4, $2, $5, 'rm', 'T-080 RM', $6, 'kg', $7)`,
    [fgItemId, seed.orgAId, fgCode, componentId, rmCode, opts.inactiveComponent ? 'blocked' : 'active', seed.approverUserId],
  );

  let productCode: string | undefined;
  let projectId: string | undefined;
  if (opts.npd) {
    productCode = `FG-${suffix}`;
    projectId = randomUUID();
    await owner.query(
      `insert into public.product (product_code, org_id, created_by_user)
       values ($1, $2, $3)`,
      [productCode, seed.orgAId, seed.approverUserId],
    );
    await owner.query(
      `insert into public.npd_projects (id, org_id, code, name, type, product_code, current_gate, current_stage, created_by_user)
       values ($1, $2, $3, 'T-080 Project', 'standard', $4, 'G4', 'handoff', $5)`,
      [projectId, seed.orgAId, `NPD-${suffix}`, productCode, seed.approverUserId],
    );
  }

  await owner.query(
    `insert into public.bom_headers (id, org_id, product_id, npd_project_id, fa_code, origin_module, status, version, created_by_user)
     values ($1, $2, $3, $4, $5, 'npd', 'draft', 1, $6)`,
    [bomHeaderId, seed.orgAId, productCode ?? null, projectId ?? null, productCode ? null : fgCode, seed.approverUserId],
  );
  await owner.query(
    `insert into public.bom_lines (org_id, bom_header_id, line_no, component_code, item_id, quantity, uom, component_type)
     values ($1, $2, 1, $3, $4, 1.5, 'kg', 'RM')`,
    [seed.orgAId, bomHeaderId, rmCode, componentId],
  );

  // source='technical': an in_review version (the npd_builder source is constrained to
  // draft-only by factory_specs_npd_builder_draft_check; a spec moves to in_review under
  // Technical ownership, which is exactly the state the bundle approval consumes).
  await owner.query(
    `insert into public.factory_specs (id, org_id, fg_item_id, spec_code, version, status, source, bom_header_id, bom_version, created_by)
     values ($1, $2, $3, $4, 1, 'in_review', 'technical', $5, 1, $6)`,
    [factorySpecId, seed.orgAId, fgItemId, `SPEC-${suffix}`, bomHeaderId, seed.approverUserId],
  );

  if (opts.npd && productCode && projectId) {
    await owner.query(
      `insert into public.factory_release_status
         (org_id, project_id, product_code, release_status, active_bom_header_id, active_factory_spec_id, requested_by, requested_at)
       values ($1, $2, $3, 'pending_technical_approval', $4, $5, $6, now())`,
      [seed.orgAId, projectId, productCode, bomHeaderId, factorySpecId, seed.approverUserId],
    );
  }

  return { fgItemId, bomHeaderId, factorySpecId, productCode, projectId };
}

async function cleanup(): Promise<void> {
  const orgs = [seed.orgAId, seed.orgBId];
  await owner.query(`delete from public.e_sign_log where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.audit_events where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.audit_log where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.factory_release_status where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.factory_specs where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.bom_lines where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.bom_headers where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.npd_projects where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.product where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.items where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.outbox_events where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.user_pins where user_id = any($1)`, [[seed.approverUserId, seed.viewerUserId, seed.orgBUserId]]);
  await owner.query(`delete from public.user_roles where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.role_permissions where role_id in (select id from public.roles where org_id = any($1))`, [orgs]);
  await owner.query(`delete from public.users where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.roles where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.organizations where id = any($1)`, [orgs]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

run('T-080 FactorySpec+BOM bundle approval (RLS + RBAC + e-sign, real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedIdentities();
  });

  afterAll(async () => {
    if (owner) {
      await cleanup().catch(() => undefined);
      await owner.end();
    }
  });

  it('AC1 — atomic approve moves both sides, emits one event, closes the NPD release loop', async () => {
    const b = await seedBundle({ npd: true });

    const result = await withActionActor(seed.approverUserId, seed.orgAId, () =>
      approveReleaseBundleAction({ factorySpecId: b.factorySpecId, bomHeaderId: b.bomHeaderId, pin: PIN, reason: 'bundle approved for factory' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.factorySpecStatus).toBe('approved_for_factory');
    expect(result.data.bomStatus).toBe('technical_approved');
    expect(result.data.factoryReleaseStatusId).not.toBeNull();

    const spec = await owner.query(`select status, approved_by, approved_at from public.factory_specs where id = $1`, [b.factorySpecId]);
    expect(spec.rows[0]?.status).toBe('approved_for_factory');
    expect(spec.rows[0]?.approved_by).toBe(seed.approverUserId);
    expect(spec.rows[0]?.approved_at).not.toBeNull();

    const bom = await owner.query(`select status, approved_by from public.bom_headers where id = $1`, [b.bomHeaderId]);
    expect(bom.rows[0]?.status).toBe('technical_approved');

    const events = await owner.query(
      `select count(*)::int as n from public.outbox_events where org_id = $1 and event_type = 'technical.factory_spec.approved' and aggregate_id = $2`,
      [seed.orgAId, b.factorySpecId],
    );
    expect(events.rows[0]?.n).toBe(1);

    // T-081 adapter set the NPD soft uuid.
    const release = await owner.query(
      `select release_status, active_factory_spec_id from public.factory_release_status where id = $1`,
      [result.data.factoryReleaseStatusId],
    );
    expect(release.rows[0]?.release_status).toBe('approved_for_factory');
    expect(release.rows[0]?.active_factory_spec_id).toBe(b.factorySpecId);

    // e-sign row exists (CFR 21 Part 11).
    const esign = await owner.query(`select count(*)::int as n from public.e_sign_log where org_id = $1 and intent = 'tech.fa.release'`, [seed.orgAId]);
    expect(esign.rows[0]?.n).toBeGreaterThanOrEqual(1);
  });

  it('AC3 — D365 disabled: a pure-Technical FG (no NPD project) still releases locally', async () => {
    const b = await seedBundle({ npd: false });
    const result = await withActionActor(seed.approverUserId, seed.orgAId, () =>
      approveReleaseBundleAction({ factorySpecId: b.factorySpecId, bomHeaderId: b.bomHeaderId, pin: PIN, reason: 'local release no d365' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.factorySpecStatus).toBe('approved_for_factory');
    // No NPD release record to close → soft uuid loop returns null, but local release succeeded.
    expect(result.data.factoryReleaseStatusId).toBeNull();
  });

  it('AC2 — release blocker (RM usability fail) rejects atomically; neither side moves', async () => {
    const b = await seedBundle({ npd: false, inactiveComponent: true });
    const result = await withActionActor(seed.approverUserId, seed.orgAId, () =>
      approveReleaseBundleAction({ factorySpecId: b.factorySpecId, bomHeaderId: b.bomHeaderId, pin: PIN, reason: 'should be blocked' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('release_blocked');

    const spec = await owner.query(`select status from public.factory_specs where id = $1`, [b.factorySpecId]);
    expect(spec.rows[0]?.status).toBe('in_review'); // unchanged
    const bom = await owner.query(`select status from public.bom_headers where id = $1`, [b.bomHeaderId]);
    expect(bom.rows[0]?.status).toBe('draft'); // unchanged
    const events = await owner.query(
      `select count(*)::int as n from public.outbox_events where org_id = $1 and aggregate_id = $2`,
      [seed.orgAId, b.factorySpecId],
    );
    expect(events.rows[0]?.n).toBe(0); // no orphan event
  });

  it('AC5 — a user without technical.product_spec.approve is forbidden and nothing moves', async () => {
    const b = await seedBundle({ npd: false });
    const result = await withActionActor(seed.viewerUserId, seed.orgAId, () =>
      approveReleaseBundleAction({ factorySpecId: b.factorySpecId, bomHeaderId: b.bomHeaderId, pin: PIN, reason: 'no perm' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('forbidden');
    const spec = await owner.query(`select status from public.factory_specs where id = $1`, [b.factorySpecId]);
    expect(spec.rows[0]?.status).toBe('in_review');
  });

  it('e-sign enforced — a wrong PIN returns esign_failed and nothing is released', async () => {
    const b = await seedBundle({ npd: false });
    const result = await withActionActor(seed.approverUserId, seed.orgAId, () =>
      approveReleaseBundleAction({ factorySpecId: b.factorySpecId, bomHeaderId: b.bomHeaderId, pin: '000000', reason: 'wrong pin' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('esign_failed');
    const spec = await owner.query(`select status from public.factory_specs where id = $1`, [b.factorySpecId]);
    expect(spec.rows[0]?.status).toBe('in_review');
  });

  it('AC4 — re-approving an already-approved bundle returns released_record_immutable', async () => {
    const b = await seedBundle({ npd: false });
    const first = await withActionActor(seed.approverUserId, seed.orgAId, () =>
      approveReleaseBundleAction({ factorySpecId: b.factorySpecId, bomHeaderId: b.bomHeaderId, pin: PIN, reason: 'first approval' }),
    );
    expect(first.ok).toBe(true);
    const second = await withActionActor(seed.approverUserId, seed.orgAId, () =>
      approveReleaseBundleAction({ factorySpecId: b.factorySpecId, bomHeaderId: b.bomHeaderId, pin: PIN, reason: 'second approval' }),
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe('released_record_immutable');
  });

  it('split prohibition — rejecting the bundle leaves BOTH sides un-released', async () => {
    const b = await seedBundle({ npd: false });
    const result = await withActionActor(seed.approverUserId, seed.orgAId, () =>
      rejectReleaseBundleAction({ factorySpecId: b.factorySpecId, bomHeaderId: b.bomHeaderId, reason: 'spec fails review' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.factorySpecStatus).toBe('draft');
    expect(result.data.bomStatus).toBe('draft');

    const spec = await owner.query(`select status from public.factory_specs where id = $1`, [b.factorySpecId]);
    expect(spec.rows[0]?.status).toBe('draft');
    const bom = await owner.query(`select status from public.bom_headers where id = $1`, [b.bomHeaderId]);
    expect(bom.rows[0]?.status).toBe('draft'); // never released
  });

  it('org isolation — Org B approver cannot see/approve Org A bundle (not_found)', async () => {
    const b = await seedBundle({ npd: false });
    const result = await withActionActor(seed.orgBUserId, seed.orgBId, () =>
      approveReleaseBundleAction({ factorySpecId: b.factorySpecId, bomHeaderId: b.bomHeaderId, pin: PIN, reason: 'cross org' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not_found'); // RLS scopes the SELECT to zero rows
  });
});
