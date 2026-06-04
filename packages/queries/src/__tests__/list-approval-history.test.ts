/**
 * T-110 — listApprovalHistory REAL DB integration.
 *
 * Proves (against a real Postgres clone, app_user + RLS):
 *   - a project with one approved (e-signed) and one rejected gate approval
 *     returns BOTH rows ordered DESC by created_at.
 *   - approver display name + role resolve from public.users / public.roles.
 *   - eSigned + esignHash are derived from the real esigned_at/esign_hash cols;
 *     a non-e-signed row carries eSigned=false and a null hash (red line: never
 *     fabricate an e-signature).
 *   - rejection_reason is surfaced as notes for rejected entries.
 *   - rows for OTHER projects / other orgs are NOT returned (RLS red lines).
 *
 * Requires DATABASE_URL (the T-110 clone). Skips when unset.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const run = databaseUrl ? describe : describe.skip;

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  userAId: randomUUID(),
  userBId: randomUUID(),
  roleAId: randomUUID(),
  roleBId: randomUUID(),
  projectAId: randomUUID(),
  otherProjectAId: randomUUID(),
  projectBId: randomUUID(),
  apApprovedId: randomUUID(),
  apRejectedId: randomUUID(),
  apOtherId: randomUUID(),
  apCrossOrgId: randomUUID(),
};

let owner: pg.Pool;
let app: pg.Pool;

function appUserConnectionString(): string {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const url = new URL(databaseUrl);
  url.username = 'app_user';
  url.password = appUserPassword;
  return url.toString();
}

async function ensureAppUser(): Promise<void> {
  await owner.query(`
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
}

async function seedIdentities(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-110 Approval Tenant', 'eu', 'https://t110-approval.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values
       ($1, $2, $3, 'T-110 Approval Org A', 'fmcg'),
       ($4, $2, $5, 'T-110 Approval Org B', 'fmcg')
     on conflict (id) do nothing`,
    [
      seed.orgAId,
      seed.tenantId,
      `t110-a-${seed.orgAId.slice(0, 8)}`,
      seed.orgBId,
      `t110-b-${seed.orgBId.slice(0, 8)}`,
    ],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, $5, false, $5, 'NPD Lead', '[]'::jsonb, false, 10),
       ($3, $4, $6, false, $6, 'NPD Manager', '[]'::jsonb, false, 10)
     on conflict (id) do nothing`,
    [
      seed.roleAId,
      seed.orgAId,
      seed.roleBId,
      seed.orgBId,
      `t110_a_${seed.roleAId.slice(0, 8)}`,
      `t110_b_${seed.roleBId.slice(0, 8)}`,
    ],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'J. Lewis', 'J. Lewis', $4),
       ($5, $6, $7, 'K. Walker', 'K. Walker', $8)
     on conflict (id) do nothing`,
    [
      seed.userAId,
      seed.orgAId,
      `t110-a-${seed.userAId}@example.test`,
      seed.roleAId,
      seed.userBId,
      seed.orgBId,
      `t110-b-${seed.userBId}@example.test`,
      seed.roleBId,
    ],
  );
  // user_roles join (role resolution path used by the query).
  await owner.query(
    `insert into public.user_roles (org_id, user_id, role_id)
     values ($1, $2, $3), ($4, $5, $6)
     on conflict do nothing`,
    [seed.orgAId, seed.userAId, seed.roleAId, seed.orgBId, seed.userBId, seed.roleBId],
  );
  // Projects: target + a different project in org A, and a cross-org project.
  await owner.query(
    `insert into public.npd_projects (id, org_id, code, name, type)
     values
       ($1, $2, $3, 'T-110 Target Project', 'new_product'),
       ($4, $2, $5, 'T-110 Other Project', 'new_product'),
       ($6, $7, $8, 'T-110 Cross-Org Project', 'new_product')
     on conflict (id) do nothing`,
    [
      seed.projectAId,
      seed.orgAId,
      `T110-P-${seed.projectAId.slice(0, 8)}`,
      seed.otherProjectAId,
      `T110-O-${seed.otherProjectAId.slice(0, 8)}`,
      seed.projectBId,
      seed.orgBId,
      `T110-X-${seed.projectBId.slice(0, 8)}`,
    ],
  );
}

async function seedApproval(args: {
  id: string;
  orgId: string;
  projectId: string;
  approverUserId: string;
  gateCode: string;
  decision: 'approved' | 'rejected';
  notes: string | null;
  rejectionReason: string | null;
  createdAt: string;
  esignedAt: string | null;
  esignHash: string | null;
}): Promise<void> {
  await owner.query(
    `insert into public.gate_approvals
       (id, org_id, project_id, gate_code, decision, approver_user_id, notes, rejection_reason, created_at, esigned_at, esign_hash)
     values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid, $7, $8, $9::timestamptz, $10::timestamptz, $11)`,
    [
      args.id,
      args.orgId,
      args.projectId,
      args.gateCode,
      args.decision,
      args.approverUserId,
      args.notes,
      args.rejectionReason,
      args.createdAt,
      args.esignedAt,
      args.esignHash,
    ],
  );
}

async function withAppOrg<T>(orgId: string, action: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const sessionToken = randomUUID();
  await owner.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1::uuid, $2::uuid)`,
    [sessionToken, orgId],
  );

  const client = await app.connect();
  try {
    await client.query('begin');
    await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [sessionToken, orgId]);
    const result = await action(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await owner
      .query(`delete from app.session_org_contexts where session_token = $1::uuid`, [sessionToken])
      .catch(() => undefined);
  }
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.gate_approvals where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.npd_projects where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.user_roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.users where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.organizations where id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

run('listApprovalHistory — REAL DB integration (T-110)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/cleanup; assertions use app_user RLS
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- direct app_user pool proves non-vacuous RLS behavior
    app = new pg.Pool({ connectionString: appUserConnectionString() });
    await seedIdentities();

    // Org A · target project: rejected (older) then approved+e-signed (newer).
    await seedApproval({
      id: seed.apRejectedId,
      orgId: seed.orgAId,
      projectId: seed.projectAId,
      approverUserId: seed.userAId,
      gateCode: 'G0',
      decision: 'rejected',
      notes: null,
      rejectionReason: 'Market opportunity not yet validated by commercial team.',
      createdAt: '2025-10-06T09:00:00Z',
      esignedAt: null,
      esignHash: null,
    });
    await seedApproval({
      id: seed.apApprovedId,
      orgId: seed.orgAId,
      projectId: seed.projectAId,
      approverUserId: seed.userAId,
      gateCode: 'G1',
      decision: 'approved',
      notes: 'Technical feasibility confirmed. Proceed to business case.',
      rejectionReason: null,
      createdAt: '2025-10-28T10:30:00Z',
      esignedAt: '2025-10-28T10:30:00Z',
      esignHash: 'SHA256:a8f3b2c9012deadbeef',
    });

    // Org A · a DIFFERENT project — must NOT appear in target's history.
    await seedApproval({
      id: seed.apOtherId,
      orgId: seed.orgAId,
      projectId: seed.otherProjectAId,
      approverUserId: seed.userAId,
      gateCode: 'G0',
      decision: 'approved',
      notes: 'Other project approval.',
      rejectionReason: null,
      createdAt: '2025-11-01T12:00:00Z',
      esignedAt: null,
      esignHash: null,
    });

    // Org B · cross-org approval — must NOT appear under Org A RLS.
    await seedApproval({
      id: seed.apCrossOrgId,
      orgId: seed.orgBId,
      projectId: seed.projectBId,
      approverUserId: seed.userBId,
      gateCode: 'G0',
      decision: 'approved',
      notes: 'Cross-org approval.',
      rejectionReason: null,
      createdAt: '2025-11-02T13:00:00Z',
      esignedAt: null,
      esignHash: null,
    });
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await app.end();
    await owner.end();
  });

  it('returns both gate approvals for the project ordered DESC by created_at', async () => {
    const { listApprovalHistory } = await import('../list-approval-history.js');
    await withAppOrg(seed.orgAId, async (client) => {
      const rows = await listApprovalHistory(seed.projectAId, { client });
      expect(rows.map((r) => r.gate)).toEqual(['G1', 'G0']);
      expect(rows.map((r) => r.result)).toEqual(['approved', 'rejected']);
      // Monotonic non-increasing timestamps.
      for (let i = 1; i < rows.length; i += 1) {
        expect(Date.parse(rows[i - 1]!.date)).toBeGreaterThanOrEqual(Date.parse(rows[i]!.date));
      }
    });
  });

  it('resolves approver display name + role, and surfaces rejection_reason as notes', async () => {
    const { listApprovalHistory } = await import('../list-approval-history.js');
    await withAppOrg(seed.orgAId, async (client) => {
      const rows = await listApprovalHistory(seed.projectAId, { client });
      const approved = rows.find((r) => r.gate === 'G1')!;
      expect(approved.approver).toBe('J. Lewis');
      expect(approved.role).toBe('NPD Lead');
      expect(approved.notes).toBe('Technical feasibility confirmed. Proceed to business case.');

      const rejected = rows.find((r) => r.gate === 'G0')!;
      expect(rejected.notes).toBe('Market opportunity not yet validated by commercial team.');
    });
  });

  it('derives eSigned + hash from real columns; never fabricates a signature', async () => {
    const { listApprovalHistory } = await import('../list-approval-history.js');
    await withAppOrg(seed.orgAId, async (client) => {
      const rows = await listApprovalHistory(seed.projectAId, { client });
      const approved = rows.find((r) => r.gate === 'G1')!;
      expect(approved.eSigned).toBe(true);
      expect(approved.eSignHash).toBe('SHA256:a8f3b2c9012deadbeef');
      expect(approved.eSignedAt).toBe('2025-10-28T10:30:00.000Z');

      const rejected = rows.find((r) => r.gate === 'G0')!;
      expect(rejected.eSigned).toBe(false);
      expect(rejected.eSignHash).toBeNull();
      expect(rejected.eSignedAt).toBeNull();
    });
  });

  it('red lines: never includes other projects and respects org RLS scope', async () => {
    const { listApprovalHistory } = await import('../list-approval-history.js');
    await withAppOrg(seed.orgAId, async (client) => {
      // Same-org, different project is isolated.
      const other = await listApprovalHistory(seed.otherProjectAId, { client });
      expect(other.map((r) => r.gate)).toEqual(['G0']);
      // Target project does not leak the other project's row.
      const rows = await listApprovalHistory(seed.projectAId, { client });
      expect(rows.some((r) => r.notes === 'Other project approval.')).toBe(false);
      // Cross-org project is invisible under Org A RLS.
      const crossOrg = await listApprovalHistory(seed.projectBId, { client });
      expect(crossOrg).toHaveLength(0);
    });
  });
});
