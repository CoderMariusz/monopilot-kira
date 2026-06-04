/**
 * T-027 RED — listFaHistory REAL DB integration.
 *
 * Proves (against a real Postgres clone, app_user + RLS):
 *   AC2: a FA with one fa.created and one fa.dept_closed outbox event returns
 *        BOTH rows ordered DESC by event time.
 *   - audit_events rows for the same FA are folded into the same timeline.
 *   - rows for OTHER FAs / other orgs are NOT returned (red lines #2/#3).
 *
 * Requires DATABASE_URL (the T-027 clone). Skips when unset.
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
  faCode: `T027-FA-${randomUUID().slice(0, 8)}`,
  otherFaCode: `T027-OTHER-${randomUUID().slice(0, 8)}`,
  crossOrgFaCode: `T027-XORG-${randomUUID().slice(0, 8)}`,
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
     values ($1, 'T-027 History Tenant', 'eu', 'https://t027-history.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values
       ($1, $2, $3, 'T-027 History Org A', 'fmcg'),
       ($4, $2, $5, 'T-027 History Org B', 'fmcg')
     on conflict (id) do nothing`,
    [
      seed.orgAId,
      seed.tenantId,
      `t027-a-${seed.orgAId.slice(0, 8)}`,
      seed.orgBId,
      `t027-b-${seed.orgBId.slice(0, 8)}`,
    ],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, $5, false, $5, 'T-027 History A', '[]'::jsonb, false, 10),
       ($3, $4, $6, false, $6, 'T-027 History B', '[]'::jsonb, false, 10)
     on conflict (id) do nothing`,
    [
      seed.roleAId,
      seed.orgAId,
      seed.roleBId,
      seed.orgBId,
      `t027_a_${seed.roleAId.slice(0, 8)}`,
      `t027_b_${seed.roleBId.slice(0, 8)}`,
    ],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'Ada History', 'Ada History', $4),
       ($5, $6, $7, 'Bob History', 'Bob History', $8)
     on conflict (id) do nothing`,
    [
      seed.userAId,
      seed.orgAId,
      `t027-a-${seed.userAId}@example.test`,
      seed.roleAId,
      seed.userBId,
      seed.orgBId,
      `t027-b-${seed.userBId}@example.test`,
      seed.roleBId,
    ],
  );
}

async function seedOutboxEvent(
  orgId: string,
  actorUserId: string,
  faCode: string,
  eventType: string,
  createdAt: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await owner.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, created_at, app_version)
     values ($1::uuid, $2, 'fa', $3, $4::jsonb, $5::timestamptz, 't027-history-test')`,
    [orgId, eventType, faCode, JSON.stringify({ actor_user_id: actorUserId, ...payload }), createdAt],
  );
}

async function seedAuditEvent(
  orgId: string,
  actorUserId: string,
  faCode: string,
  action: string,
  occurredAt: string,
): Promise<void> {
  await owner.query(
    `insert into public.audit_events
       (org_id, occurred_at, actor_user_id, actor_type, action, resource_type, resource_id, after_state, request_id)
     values ($1::uuid, $2::timestamptz, $3::uuid, 'user', $4, 'fa', $5, $6::jsonb, gen_random_uuid())`,
    [orgId, occurredAt, actorUserId, action, faCode, JSON.stringify({ note: 'audit row' })],
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
  await owner.query(`delete from public.outbox_events where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.audit_events where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.users where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.organizations where id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

run('listFaHistory — REAL DB integration (T-027)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/cleanup; assertions use app_user RLS
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- direct app_user pool proves non-vacuous RLS behavior
    app = new pg.Pool({ connectionString: appUserConnectionString() });
    await seedIdentities();

    // Org A · target FA: created (older) then dept_closed (newer) outbox events.
    await seedOutboxEvent(seed.orgAId, seed.userAId, seed.faCode, 'fa.created', '2026-01-01T09:00:00Z', {
      product_code: seed.faCode,
      product_name: 'T-027 FA',
    });
    await seedOutboxEvent(seed.orgAId, seed.userAId, seed.faCode, 'fa.dept_closed', '2026-01-02T10:00:00Z', {
      dept: 'Core',
    });
    // Org A · same FA: an audit_events row (folded into the same timeline).
    await seedAuditEvent(seed.orgAId, seed.userAId, seed.faCode, 'fa.field_edit', '2026-01-03T11:00:00Z');

    // Org A · a DIFFERENT FA — must NOT appear in target's history.
    await seedOutboxEvent(seed.orgAId, seed.userAId, seed.otherFaCode, 'fa.created', '2026-01-04T12:00:00Z', {});

    // Org B · cross-org FA — must NOT appear under Org A RLS.
    await seedOutboxEvent(seed.orgBId, seed.userBId, seed.crossOrgFaCode, 'fa.created', '2026-01-05T13:00:00Z', {});
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await app.end();
    await owner.end();
  });

  it('AC2: returns fa.created + fa.dept_closed for the FA ordered DESC by event time', async () => {
    const { listFaHistory } = await import('../list-fa-history.js');
    await withAppOrg(seed.orgAId, async (client) => {
      const rows = await listFaHistory(seed.faCode, { client });
      const types = rows.map((r) => r.eventType);
      expect(types).toContain('fa.created');
      expect(types).toContain('fa.dept_closed');

      // DESC by occurredAt: audit field_edit (Jan 3) > dept_closed (Jan 2) > created (Jan 1).
      const idxEdit = types.indexOf('fa.field_edit');
      const idxClosed = types.indexOf('fa.dept_closed');
      const idxCreated = types.indexOf('fa.created');
      expect(idxEdit).toBeGreaterThanOrEqual(0);
      expect(idxEdit).toBeLessThan(idxClosed);
      expect(idxClosed).toBeLessThan(idxCreated);

      // Monotonic non-increasing timestamps.
      for (let i = 1; i < rows.length; i += 1) {
        expect(Date.parse(rows[i - 1]!.occurredAt)).toBeGreaterThanOrEqual(Date.parse(rows[i]!.occurredAt));
      }
    });
  });

  it('resolves the actor display name and union sources for the FA timeline', async () => {
    const { listFaHistory } = await import('../list-fa-history.js');
    await withAppOrg(seed.orgAId, async (client) => {
      const rows = await listFaHistory(seed.faCode, { client });
      const created = rows.find((r) => r.eventType === 'fa.created');
      expect(created?.actorName).toBe('Ada History');
      expect(created?.source).toBe('outbox');
      const edit = rows.find((r) => r.eventType === 'fa.field_edit');
      expect(edit?.source).toBe('audit');
      expect(edit?.actorName).toBe('Ada History');
    });
  });

  it('red lines: never includes other FAs and respects org RLS scope', async () => {
    const { listFaHistory } = await import('../list-fa-history.js');
    // Same-org, different FA is excluded.
    await withAppOrg(seed.orgAId, async (client) => {
      const rows = await listFaHistory(seed.faCode, { client });
      expect(rows.every((r) => !JSON.stringify(r.payload ?? {}).includes(seed.otherFaCode))).toBe(true);
      const other = await listFaHistory(seed.otherFaCode, { client });
      expect(other.map((r) => r.eventType)).toEqual(['fa.created']);
    });
    // Cross-org FA is invisible under Org A RLS.
    await withAppOrg(seed.orgAId, async (client) => {
      const crossOrg = await listFaHistory(seed.crossOrgFaCode, { client });
      expect(crossOrg).toHaveLength(0);
    });
  });
});
