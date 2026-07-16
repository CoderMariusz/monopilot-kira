/**
 * C043 — post-signEvent failure must roll back the real e_sign_log row (and audit/outbox/status).
 * Pending-first dual-sign approval remains a conscious commit (signature + audit only).
 * Skips when DATABASE_URL is unset.
 */
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../packages/db/src/clients.js';
import {
  approveReleaseBundle,
  BundleApprovalRollbackError,
  BUNDLE_APPROVE_INTENT,
  type QueryClient,
} from '../release-bundle-service';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const PIN = '135790';
const APPROVE_PERMS = ['technical.product_spec.approve', 'technical.bom.approve'];

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function withOrgTxn<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `insert into app.session_org_contexts (session_token, org_id, user_id)
     values ($1::uuid, $2::uuid, $3::uuid)
     on conflict (session_token) do update
       set org_id = excluded.org_id, user_id = excluded.user_id`,
    [sessionToken, orgId, userId],
  );
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await ownerPool
      .query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken])
      .catch(() => undefined);
  }
}

function wrapClientForPostSignSpecUpdateFailure(client: pg.PoolClient): QueryClient {
  const nativeQuery = client.query.bind(client);
  return {
    async query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]) {
      const n = normalize(sql);
      if (
        n.startsWith('update public.factory_specs') &&
        n.includes("set status = 'approved_for_factory'")
      ) {
        return { rows: [] as T[] };
      }
      return nativeQuery(sql, params) as Promise<{ rows: T[]; rowCount?: number | null }>;
    },
  };
}

type BundleSeed = {
  factorySpecId: string;
  bomHeaderId: string;
  fgItemId: string;
};

async function seedBundle(ownerPool: pg.Pool): Promise<BundleSeed> {
  const fgItemId = randomUUID();
  const componentId = randomUUID();
  const bomHeaderId = randomUUID();
  const factorySpecId = randomUUID();
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const fgCode = `FG-${suffix}`;
  const rmCode = `RM-${suffix}`;

  await ownerPool.query(
    `insert into public.items (id, org_id, item_code, item_type, name, status, uom_base, created_by)
     values
       ($1, $2, $3, 'fg', 'C043 FG', 'active', 'kg', $6),
       ($4, $2, $5, 'rm', 'C043 RM', 'active', 'kg', $6)`,
    [fgItemId, orgId, fgCode, componentId, rmCode, userId],
  );
  await ownerPool.query(
    `insert into public.bom_headers (id, org_id, product_id, fa_code, origin_module, status, version, created_by_user)
     values ($1, $2, null, $3, 'technical', 'draft', 1, $4)`,
    [bomHeaderId, orgId, fgCode, userId],
  );
  await ownerPool.query(
    `insert into public.bom_lines (org_id, bom_header_id, line_no, component_code, item_id, quantity, uom, component_type)
     values ($1, $2, 1, $3, $4, 1.5, 'kg', 'RM')`,
    [orgId, bomHeaderId, rmCode, componentId],
  );
  await ownerPool.query(
    `insert into public.factory_specs (id, org_id, fg_item_id, spec_code, version, status, source, bom_header_id, bom_version, created_by)
     values ($1, $2, $3, $4, 1, 'in_review', 'technical', $5, 1, $6)`,
    [factorySpecId, orgId, fgItemId, `SPEC-${suffix}`, bomHeaderId, userId],
  );

  return { factorySpecId, bomHeaderId, fgItemId };
}

async function countRows(
  ownerPool: pg.Pool,
  sql: string,
  params: readonly unknown[],
): Promise<number> {
  const { rows } = await ownerPool.query<{ n: number }>(sql, params);
  return rows[0]?.n ?? 0;
}

runPg('release bundle post-sign rollback (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'C043 Rollback Tenant', 'eu', 'https://c043-rollback.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, slug, name, industry_code)
       values ($1, $2, $3, 'C043 Rollback Org', 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `c043-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.org_authorization_policies
         (org_id, policy_code, is_enabled, request_permissions, authorize_permissions,
          approver_role_codes, min_approvers, require_segregation_of_duties, requires_new_version,
          approval_gate_rule_code, settings_json, version)
       values
         ($1, 'technical_product_spec_approval', true, '{}'::text[],
          array['technical.product_spec.approve']::text[], array['quality_lead']::text[],
          1, true, true, 'technical_product_spec_approval_gate_v1',
          jsonb_build_object('require_dual_sign_off', true), 1)
       on conflict on constraint org_authorization_policies_org_code_unique do nothing`,
      [orgId],
    );
    await ownerPool.query(
      `insert into public.rule_definitions
         (org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to)
       values
         ($1, 'technical_product_spec_approval_gate_v1', 'gate', 'L1',
          jsonb_build_object('min_approvers', 1, 'requires_new_version', true),
          1, now(), null)
       on conflict (org_id, rule_code, version) do nothing`,
      [orgId],
    );
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
       values ($1, $2, 'c043-approver', false, 'c043-approver', 'C043 Approver', $3::jsonb, false, 30)
       on conflict (id) do nothing`,
      [roleId, orgId, JSON.stringify(APPROVE_PERMS)],
    );
    await ownerPool.query(
      `insert into public.role_permissions (role_id, permission)
       select $1, p.permission
         from unnest($2::text[]) as p(permission)
       on conflict (role_id, permission) do nothing`,
      [roleId, APPROVE_PERMS],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, display_name, name, role_id)
       values ($1, $2, $3, 'C043 Approver', 'C043 Approver', $4)
       on conflict (id) do nothing`,
      [userId, orgId, `c043-${userId}@example.test`, roleId],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1, $2, $3)
       on conflict (user_id, role_id) do nothing`,
      [userId, roleId, orgId],
    );
    const pinHash = await argon2.hash(PIN, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    await ownerPool.query(
      `insert into public.user_pins (user_id, pin_hash, attempts_count, locked_until, last_attempt_at)
       values ($1, $2, 0, null, null)
       on conflict (user_id) do update set pin_hash = excluded.pin_hash, attempts_count = 0, locked_until = null`,
      [userId, pinHash],
    );
  });

  afterAll(async () => {
    await ownerPool?.query(`delete from public.e_sign_log where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.audit_log where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.factory_specs where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.bom_lines where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.bom_headers where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.items where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.outbox_events where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.user_pins where user_id = $1`, [userId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.user_roles where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.role_permissions where role_id = $1`, [roleId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.users where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.roles where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool
      ?.query(`delete from public.rule_definitions where org_id = $1`, [orgId])
      .catch(() => undefined);
    await ownerPool
      ?.query(`delete from public.org_authorization_policies where org_id = $1`, [orgId])
      .catch(() => undefined);
    await ownerPool?.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    await ownerPool?.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await appPool?.end().catch(() => undefined);
    await ownerPool?.end().catch(() => undefined);
  });

  it('rolls back a real e_sign_log row when the factory-usable transition fails after signing', async () => {
    await ownerPool.query(
      `update public.org_authorization_policies
          set min_approvers = 1,
              settings_json = jsonb_build_object('require_dual_sign_off', false)
        where org_id = $1::uuid
          and policy_code = 'technical_product_spec_approval'`,
      [orgId],
    );

    const bundle = await seedBundle(ownerPool);
    const approveInput = {
      factorySpecId: bundle.factorySpecId,
      bomHeaderId: bundle.bomHeaderId,
      pin: PIN,
      reason: 'rollback probe',
    };

    const esignBefore = await countRows(
      ownerPool,
      `select count(*)::int as n from public.e_sign_log where org_id = $1::uuid and intent = $2`,
      [orgId, BUNDLE_APPROVE_INTENT],
    );
    const auditBefore = await countRows(
      ownerPool,
      `select count(*)::int as n from public.audit_log where org_id = $1::uuid and resource_id = $2::text`,
      [orgId, bundle.factorySpecId],
    );
    const outboxBefore = await countRows(
      ownerPool,
      `select count(*)::int as n from public.outbox_events where org_id = $1::uuid and aggregate_id = $2::text`,
      [orgId, bundle.factorySpecId],
    );

    await expect(
      withOrgTxn(appPool, ownerPool, async (client) =>
        approveReleaseBundle(
          { userId, orgId, client: wrapClientForPostSignSpecUpdateFailure(client) },
          approveInput,
        ),
      ),
    ).rejects.toBeInstanceOf(BundleApprovalRollbackError);

    const spec = await ownerPool.query<{ status: string }>(
      `select status from public.factory_specs where id = $1::uuid`,
      [bundle.factorySpecId],
    );
    const bom = await ownerPool.query<{ status: string }>(
      `select status from public.bom_headers where id = $1::uuid`,
      [bundle.bomHeaderId],
    );
    expect(spec.rows[0]?.status).toBe('in_review');
    expect(bom.rows[0]?.status).toBe('draft');

    const esignAfter = await countRows(
      ownerPool,
      `select count(*)::int as n from public.e_sign_log where org_id = $1::uuid and intent = $2`,
      [orgId, BUNDLE_APPROVE_INTENT],
    );
    const auditAfter = await countRows(
      ownerPool,
      `select count(*)::int as n from public.audit_log where org_id = $1::uuid and resource_id = $2::text`,
      [orgId, bundle.factorySpecId],
    );
    const outboxAfter = await countRows(
      ownerPool,
      `select count(*)::int as n from public.outbox_events where org_id = $1::uuid and aggregate_id = $2::text`,
      [orgId, bundle.factorySpecId],
    );

    expect(esignAfter).toBe(esignBefore);
    expect(auditAfter).toBe(auditBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });

  it('commits the first dual-sign signature and audit while leaving the bundle pending', async () => {
    await ownerPool.query(
      `update public.org_authorization_policies
          set min_approvers = 2,
              settings_json = jsonb_build_object('require_dual_sign_off', true)
        where org_id = $1::uuid
          and policy_code = 'technical_product_spec_approval'`,
      [orgId],
    );

    const bundle = await seedBundle(ownerPool);
    const approveInput = {
      factorySpecId: bundle.factorySpecId,
      bomHeaderId: bundle.bomHeaderId,
      pin: PIN,
      reason: 'first approver',
    };

    const result = await withOrgTxn(appPool, ownerPool, async (client) =>
      approveReleaseBundle({ userId, orgId, client: client as unknown as QueryClient }, approveInput),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        approvalStatus: 'pending',
        approvalsCollected: 1,
        approvalsRequired: 2,
        factorySpecStatus: 'in_review',
      },
    });

    const spec = await ownerPool.query<{ status: string }>(
      `select status from public.factory_specs where id = $1::uuid`,
      [bundle.factorySpecId],
    );
    expect(spec.rows[0]?.status).toBe('in_review');

    const esign = await countRows(
      ownerPool,
      `select count(*)::int as n from public.e_sign_log where org_id = $1::uuid and intent = $2`,
      [orgId, BUNDLE_APPROVE_INTENT],
    );
    expect(esign).toBeGreaterThanOrEqual(1);

    const pendingAudit = await countRows(
      ownerPool,
      `select count(*)::int as n
         from public.audit_log
        where org_id = $1::uuid
          and resource_id = $2::text
          and action = 'factory_spec.bundle_approval_recorded'`,
      [orgId, bundle.factorySpecId],
    );
    expect(pendingAudit).toBeGreaterThanOrEqual(1);

    const approvedEvents = await countRows(
      ownerPool,
      `select count(*)::int as n
         from public.outbox_events
        where org_id = $1::uuid
          and event_type = 'technical.factory_spec.approved'
          and aggregate_id = $2::text`,
      [orgId, bundle.factorySpecId],
    );
    expect(approvedEvents).toBe(0);
  });
});
