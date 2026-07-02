import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPin } from '@monopilot/auth/src/verify-pin.js';
import { getAppConnection, getOwnerConnection } from '@monopilot/db/test-utils/test-pool.js';
import type pg from 'pg';

import {
  dualSign,
  EPinFailedError,
  ESignPolicyError,
  EReplayError,
  ESignSoDError,
  hashESignSubject,
  signEvent,
} from '../index.js';

const databaseUrl = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

const dbRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../db');

const migrations = [
  '000-app-user-role.sql',
  '001-baseline.sql',
  '002-rls-baseline.sql',
  '004-audit.sql',
  '019-pins.sql',
  '026-pins-rls-org-scoped.sql',
  '054-audit-events-seq-grant.sql',
  '055-e-sign-log.sql',
  '275-signoff-policies.sql',
];

const tenantRowId = '00000000-0000-4000-b000-000000000124';
const orgId = '00000000-0000-4000-c000-000000000124';
const primaryUserId = '00000000-0000-4000-a000-000000000124';
const secondaryUserId = '00000000-0000-4000-a000-000000000125';
const fixtureRoleSlug = 't124.fixture.user';
const secondaryFixtureRoleSlug = 't124.fixture.secondary';
const primaryPin = '123456';
const secondaryPin = '654321';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`)
    .join(',')}}`;
}

function subjectHash(subject: unknown): string {
  return createHash('sha256').update(canonicalJson(subject), 'utf8').digest('hex');
}

describe('T-124 e-sign crypto contract', () => {
  it('hashESignSubject uses SHA-256 over canonical JSON with sorted object keys', () => {
    const left = { holdId: 'h-1', nested: { z: 1, a: 2 } };
    const right = { nested: { a: 2, z: 1 }, holdId: 'h-1' };

    expect(hashESignSubject(left)).toBe(subjectHash(right));
    expect(hashESignSubject(left)).toBe(
      '62e4a04950e32fb82ba0bf4594c355afb4e75ff33013a07586825bb96b5e00f2',
    );
  });

  it('hashESignSubject is pinned for non-ASCII multi-key subjects', () => {
    expect(
      hashESignSubject({
        ż: 'last',
        a: 'first',
        Ł: { z: 1, ą: 2 },
        Z: ['mix', { ś: true, s: false }],
      }),
    ).toBe('09dd6152b722dd0e37397599ec10185245b640bec547440f73207fe906aa7c45');
  });

  it('055 migration enforces org-scoped RLS and app_user append-only grants', () => {
    const migration = readFileSync(resolve(dbRoot, 'migrations/055-e-sign-log.sql'), 'utf8');

    expect(migration).toMatch(/\borg_id\b/i);
    expect(migration).not.toMatch(/\btenant_id\b/i);
    expect(migration).toMatch(/ALTER\s+TABLE\s+public\.e_sign_log\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(migration).toMatch(/ALTER\s+TABLE\s+public\.e_sign_log\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(migration).toMatch(/app\.current_org_id\s*\(\s*\)/i);
    expect(migration).not.toMatch(/current_setting\s*\(\s*['"]app\.tenant_id['"]/i);
    expect(migration).toMatch(/GRANT\s+SELECT,\s+INSERT\s+ON\s+public\.e_sign_log\s+TO\s+app_user/i);
    expect(migration).toMatch(/REVOKE\s+UPDATE,\s+DELETE\s+ON\s+public\.e_sign_log\s+FROM\s+app_user/i);
  });

  it('signEvent requires a caller-provided client with org context', async () => {
    await expect(
      signEvent({
        signerUserId: primaryUserId,
        pin: primaryPin,
        intent: 'qa.hold.release',
        subject: { holdId: 'h-client-required' },
      }),
    ).rejects.toThrow(/requires options\.client with active app\.current_org_id\(\) context/);
  });

  it('signEvent passes its transaction client into verifyPin', () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../sign.ts'), 'utf8');

    expect(source).toMatch(/verifyPin\(\s*parsed\.signerUserId,\s*parsed\.pin,\s*\{\s*client\s*\}\s*\)/);
  });

  it('dualSign requires a caller-provided client with org context', async () => {
    await expect(
      dualSign({
        primarySignerUserId: primaryUserId,
        primaryPin,
        secondarySignerUserId: secondaryUserId,
        secondaryPin,
        intent: 'prod.wo.release',
        subject: { workOrderId: 'wo-client-required' },
      }),
    ).rejects.toThrow(/requires options\.client with active app\.current_org_id\(\) context/);
  });

  it('does not enforce the allergen dual-sign policy for a production changeover signoff event', async () => {
    const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test.invalid';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const policyLookups: unknown[][] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('from public.signoff_policies')) {
          policyLookups.push(params ?? []);
          const requestedTypes = Array.isArray(params?.[0]) ? params[0] : [];
          return {
            rows: requestedTypes.includes('production.changeover.allergen')
              ? [
                  {
                    signoff_type: 'production.changeover.allergen',
                    required_signatures: 2,
                    first_signer_role_id: null,
                    second_signer_role_id: null,
                    allow_same_user: false,
                  },
                ]
              : [],
          };
        }
        if (sql.includes('select email from public.users')) {
          return { rows: [{ email: 'signer@test.invalid' }] };
        }
        if (sql.includes('select exists')) {
          return { rows: [{ exists: false }] };
        }
        if (sql.includes('select app.current_org_id() as org_id')) {
          return { rows: [{ org_id: orgId }] };
        }
        if (sql.includes('insert into public.e_sign_log')) {
          return {
            rows: [
              {
                signature_id: '00000000-0000-4000-e000-000000000124',
                created_at: new Date('2026-07-02T10:00:00.000Z'),
              },
            ],
          };
        }
        if (sql.includes('insert into public.audit_events')) {
          return { rows: [{ id: 124 }] };
        }
        return { rows: [] };
      }),
    } as unknown as pg.PoolClient;

    try {
      await expect(
        signEvent(
          {
            signerUserId: primaryUserId,
            pin: 'account-password',
            intent: 'production.changeover.signoff',
            subject: { changeoverId: 'co-1' },
            nonce: 'n-changeover-policy-fallback',
          },
          { client },
        ),
      ).resolves.toMatchObject({
        signerUserId: primaryUserId,
        intent: 'production.changeover.signoff',
      });
    } finally {
      vi.unstubAllGlobals();
      if (originalSupabaseUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
      }
      if (originalSupabaseAnonKey === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
      }
    }

    expect(policyLookups).toEqual([[['production.changeover.signoff']]]);
  });
});

async function runWithOrgContext<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>) {
  const sessionToken = randomUUID();
  await ownerConn.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1::uuid, $2::uuid)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await ownerConn.query(`delete from app.session_org_contexts where session_token = $1::uuid`, [
      sessionToken,
    ]);
  }
}

let ownerConn: pg.Pool;
let appConn: pg.Pool;

beforeAll(async () => {
  if (!databaseUrl) return;
  ownerConn = getOwnerConnection();
  appConn = getAppConnection();

  for (const migration of migrations) {
    await ownerConn.query(readFileSync(resolve(dbRoot, 'migrations', migration), 'utf8'));
  }

  await ownerConn.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1::uuid, 'T124 Tenant', 'us', 'https://t124.test.invalid')
     on conflict (id) do nothing`,
    [tenantRowId],
  );
  await ownerConn.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1::uuid, $2::uuid, 'T124 Org', 'generic')
     on conflict (id) do nothing`,
    [orgId, tenantRowId],
  );
  const role = await ownerConn.query<{ id: string }>(
    `insert into public.roles (org_id, slug, system, code, name, permissions, is_system)
     values ($1::uuid, $2, false, $2, 'T-124 Fixture User', '[]'::jsonb, false)
     on conflict (org_id, slug) do update
        set system = excluded.system,
            code = excluded.code,
            name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
     returning id`,
    [orgId, fixtureRoleSlug],
  );
  const secondaryRole = await ownerConn.query<{ id: string }>(
    `insert into public.roles (org_id, slug, system, code, name, permissions, is_system)
     values ($1::uuid, $2, false, $2, 'T-124 Fixture Secondary', '[]'::jsonb, false)
     on conflict (org_id, slug) do update
        set system = excluded.system,
            code = excluded.code,
            name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
     returning id`,
    [orgId, secondaryFixtureRoleSlug],
  );
  await ownerConn.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values
       ($1::uuid, $3::uuid, 'primary.t124@test.invalid', 'T-124 Primary', $4::uuid),
       ($2::uuid, $3::uuid, 'secondary.t124@test.invalid', 'T-124 Secondary', $5::uuid)
     on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id`,
    [primaryUserId, secondaryUserId, orgId, role.rows[0]!.id, secondaryRole.rows[0]!.id],
  );
  await ownerConn.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1::uuid, $2::uuid, $4::uuid), ($3::uuid, $5::uuid, $4::uuid)
     on conflict (user_id, role_id) do update set org_id = excluded.org_id`,
    [primaryUserId, role.rows[0]!.id, secondaryUserId, orgId, secondaryRole.rows[0]!.id],
  );

  await setPin(primaryUserId, primaryPin);
  await setPin(secondaryUserId, secondaryPin);
});

afterAll(async () => {
  if (!ownerConn) return;
  await ownerConn.query(`delete from public.e_sign_log where org_id = $1::uuid`, [orgId]);
  await ownerConn.query(`delete from public.audit_events where org_id = $1::uuid`, [orgId]);
  await ownerConn.query(`delete from public.signoff_policies where org_id = $1::uuid`, [orgId]);
  await ownerConn.query(`delete from public.user_pins where user_id in ($1::uuid, $2::uuid)`, [
    primaryUserId,
    secondaryUserId,
  ]);
  await ownerConn.query(`delete from public.user_roles where org_id = $1::uuid`, [orgId]);
  await ownerConn.query(`delete from public.users where id in ($1::uuid, $2::uuid)`, [
    primaryUserId,
    secondaryUserId,
  ]);
  await ownerConn.query(`delete from public.roles where org_id = $1::uuid and slug = any($2::text[])`, [
    orgId,
    [fixtureRoleSlug, secondaryFixtureRoleSlug],
  ]);
  await ownerConn.query(`delete from public.organizations where id = $1::uuid`, [orgId]);
  await ownerConn.query(`delete from public.tenants where id = $1::uuid`, [tenantRowId]);
  await appConn?.end();
  await ownerConn.end();
});

beforeEach(async () => {
  if (!ownerConn) return;
  await ownerConn.query(`delete from public.e_sign_log where org_id = $1::uuid`, [orgId]);
  await ownerConn.query(`delete from public.audit_events where org_id = $1::uuid`, [orgId]);
  await ownerConn.query(`delete from public.signoff_policies where org_id = $1::uuid`, [orgId]);
});

runIntegrationSuite('T-124 e-sign primitive', () => {
  it('signEvent returns a receipt, records e_sign_log, and writes security audit', async () => {
    const subject = { holdId: 'h-1' };
    const requestId = '00000000-0000-4000-d000-000000000124';

    const receipt = await runWithOrgContext(appConn, (client) =>
      signEvent(
        {
          signerUserId: primaryUserId,
          pin: primaryPin,
          intent: 'qa.hold.release',
          subject,
          nonce: 'n-1',
          reason: 'ok',
        },
        { client, requestId },
      ),
    );

    expect(receipt.signerUserId).toBe(primaryUserId);
    expect(receipt.intent).toBe('qa.hold.release');
    expect(receipt.subjectHash).toBe(subjectHash(subject));
    expect(receipt.nonce).toBe('n-1');
    expect(receipt.auditEventId).toEqual(expect.any(Number));

    const log = await ownerConn.query<{ subject_hash: string; reason: string | null }>(
      `select subject_hash, reason
       from public.e_sign_log
       where signature_id = $1::uuid`,
      [receipt.signatureId],
    );
    expect(log.rows).toEqual([{ subject_hash: subjectHash(subject), reason: 'ok' }]);

    const audit = await ownerConn.query<{
      action: string;
      retention_class: string;
      request_id: string;
      after_state: { intent: string; subjectHash: string; nonce: string };
    }>(
      `select action, retention_class, request_id, after_state
       from public.audit_events
       where id = $1`,
      [receipt.auditEventId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].action).toBe('e_sign.recorded');
    expect(audit.rows[0].retention_class).toBe('security');
    expect(audit.rows[0].request_id).toBe(requestId);
    expect(audit.rows[0].after_state).toMatchObject({
      intent: 'qa.hold.release',
      subjectHash: subjectHash(subject),
      nonce: 'n-1',
    });
  });

  it('rejects replay of the same signer, intent, subject hash, and nonce without extra rows', async () => {
    const input = {
      signerUserId: primaryUserId,
      pin: primaryPin,
      intent: 'qa.hold.release' as const,
      subject: { holdId: 'h-1' },
      nonce: 'n-replay',
      reason: 'first',
    };

    await runWithOrgContext(appConn, (client) => signEvent(input, { client }));

    await expect(
      runWithOrgContext(appConn, (client) => signEvent(input, { client })),
    ).rejects.toBeInstanceOf(EReplayError);

    const rows = await ownerConn.query<{ log_count: number; audit_count: number }>(
      `select
         (select count(*)::int from public.e_sign_log where org_id = $1::uuid) as log_count,
         (select count(*)::int from public.audit_events where org_id = $1::uuid) as audit_count`,
      [orgId],
    );
    expect(rows.rows[0]).toEqual({ log_count: 1, audit_count: 1 });
  });

  it('rejects wrong PIN without e_sign_log or audit_events rows', async () => {
    await expect(
      runWithOrgContext(appConn, (client) =>
        signEvent(
          {
            signerUserId: primaryUserId,
            pin: '000000',
            intent: 'qa.hold.release',
            subject: { holdId: 'h-1' },
            nonce: 'n-wrong-pin',
            reason: 'bad',
          },
          { client },
        ),
      ),
    ).rejects.toBeInstanceOf(EPinFailedError);

    const rows = await ownerConn.query<{ log_count: number; audit_count: number }>(
      `select
         (select count(*)::int from public.e_sign_log where org_id = $1::uuid) as log_count,
         (select count(*)::int from public.audit_events where org_id = $1::uuid) as audit_count`,
      [orgId],
    );
    expect(rows.rows[0]).toEqual({ log_count: 0, audit_count: 0 });
  });

  it('dualSign rejects the same signer before any DB write', async () => {
    await expect(
      runWithOrgContext(appConn, (client) =>
        dualSign(
          {
            primarySignerUserId: primaryUserId,
            primaryPin,
            secondarySignerUserId: primaryUserId,
            secondaryPin: primaryPin,
            intent: 'prod.wo.release',
            subject: { workOrderId: 'wo-1' },
            primaryNonce: 'n-primary-sod',
            secondaryNonce: 'n-secondary-sod',
            reason: 'release',
          },
          { client },
        ),
      ),
    ).rejects.toBeInstanceOf(ESignSoDError);

    const rows = await ownerConn.query<{ log_count: number; audit_count: number }>(
      `select
         (select count(*)::int from public.e_sign_log where org_id = $1::uuid) as log_count,
         (select count(*)::int from public.audit_events where org_id = $1::uuid) as audit_count`,
      [orgId],
    );
    expect(rows.rows[0]).toEqual({ log_count: 0, audit_count: 0 });
  });

  it('dualSign rejects the same signer with different UUID casing before any DB write', async () => {
    await expect(
      runWithOrgContext(appConn, (client) =>
        dualSign(
          {
            primarySignerUserId: primaryUserId.toUpperCase(),
            primaryPin,
            secondarySignerUserId: primaryUserId,
            secondaryPin: primaryPin,
            intent: 'prod.wo.release',
            subject: { workOrderId: 'wo-case-sod' },
            primaryNonce: 'n-primary-case-sod',
            secondaryNonce: 'n-secondary-case-sod',
            reason: 'release',
          },
          { client },
        ),
      ),
    ).rejects.toBeInstanceOf(ESignSoDError);

    const rows = await ownerConn.query<{ log_count: number; audit_count: number }>(
      `select
         (select count(*)::int from public.e_sign_log where org_id = $1::uuid) as log_count,
         (select count(*)::int from public.audit_events where org_id = $1::uuid) as audit_count`,
      [orgId],
    );
    expect(rows.rows[0]).toEqual({ log_count: 0, audit_count: 0 });
  });

  it('dualSign records two distinct signatures and two audit events', async () => {
    const result = await runWithOrgContext(appConn, (client) =>
      dualSign(
        {
          primarySignerUserId: primaryUserId,
          primaryPin,
          secondarySignerUserId: secondaryUserId,
          secondaryPin,
          intent: 'prod.wo.release',
          subject: { workOrderId: 'wo-1' },
          primaryNonce: 'n-primary-happy',
          secondaryNonce: 'n-secondary-happy',
          reason: 'release',
        },
        { client },
      ),
    );

    expect(result.primary.signerUserId).toBe(primaryUserId);
    expect(result.secondary.signerUserId).toBe(secondaryUserId);
    expect(result.primary.signatureId).not.toBe(result.secondary.signatureId);

    const rows = await ownerConn.query<{ log_count: number; audit_count: number }>(
      `select
         (select count(*)::int from public.e_sign_log where org_id = $1::uuid) as log_count,
         (select count(*)::int from public.audit_events where org_id = $1::uuid) as audit_count`,
      [orgId],
    );
    expect(rows.rows[0]).toEqual({ log_count: 2, audit_count: 2 });
  });

  it('dualSign rolls back primary signature when secondary PIN fails', async () => {
    await expect(
      runWithOrgContext(appConn, (client) =>
        dualSign(
          {
            primarySignerUserId: primaryUserId,
            primaryPin,
            secondarySignerUserId: secondaryUserId,
            secondaryPin: '000000',
            intent: 'prod.wo.release',
            subject: { workOrderId: 'wo-rollback' },
            primaryNonce: 'n-primary-rollback',
            secondaryNonce: 'n-secondary-rollback',
            reason: 'release',
          },
          { client },
        ),
      ),
    ).rejects.toBeInstanceOf(EPinFailedError);

    const rows = await ownerConn.query<{ log_count: number; audit_count: number }>(
      `select
         (select count(*)::int from public.e_sign_log where org_id = $1::uuid) as log_count,
         (select count(*)::int from public.audit_events where org_id = $1::uuid) as audit_count`,
      [orgId],
    );
    expect(rows.rows[0]).toEqual({ log_count: 0, audit_count: 0 });
  });

  it('signoff_policies enforce dual path, signer roles, and same-user rejection', async () => {
    const roles = await ownerConn.query<{ id: string; slug: string }>(
      `select id::text, slug from public.roles where org_id = $1::uuid and slug = any($2::text[])`,
      [orgId, [fixtureRoleSlug, secondaryFixtureRoleSlug]],
    );
    const primaryRoleId = roles.rows.find((row) => row.slug === fixtureRoleSlug)?.id;
    const secondaryRoleId = roles.rows.find((row) => row.slug === secondaryFixtureRoleSlug)?.id;
    if (!primaryRoleId || !secondaryRoleId) throw new Error('missing fixture roles');

    await ownerConn.query(
      `insert into public.signoff_policies (
         org_id, signoff_type, required_signatures, first_signer_role_id,
         second_signer_role_id, allow_same_user, is_active
       )
       values ($1::uuid, 'qa.hold.release', 2, $2::uuid, $3::uuid, false, true)
       on conflict (org_id, signoff_type) do update
          set required_signatures = excluded.required_signatures,
              first_signer_role_id = excluded.first_signer_role_id,
              second_signer_role_id = excluded.second_signer_role_id,
              allow_same_user = excluded.allow_same_user,
              is_active = excluded.is_active`,
      [orgId, primaryRoleId, secondaryRoleId],
    );

    await expect(
      runWithOrgContext(appConn, (client) =>
        signEvent(
          {
            signerUserId: primaryUserId,
            pin: primaryPin,
            intent: 'qa.hold.release',
            subject: { holdId: 'policy-single' },
          },
          { client },
        ),
      ),
    ).rejects.toMatchObject({ code: 'second_signature_required' });

    await expect(
      runWithOrgContext(appConn, (client) =>
        dualSign(
          {
            primarySignerUserId: secondaryUserId,
            primaryPin: secondaryPin,
            secondarySignerUserId: primaryUserId,
            secondaryPin: primaryPin,
            intent: 'qa.hold.release',
            subject: { holdId: 'policy-role' },
          },
          { client },
        ),
      ),
    ).rejects.toBeInstanceOf(ESignPolicyError);

    await expect(
      runWithOrgContext(appConn, (client) =>
        dualSign(
          {
            primarySignerUserId: primaryUserId,
            primaryPin,
            secondarySignerUserId: primaryUserId,
            secondaryPin: primaryPin,
            intent: 'qa.hold.release',
            subject: { holdId: 'policy-same-user' },
          },
          { client },
        ),
      ),
    ).rejects.toBeInstanceOf(ESignSoDError);

    const result = await runWithOrgContext(appConn, (client) =>
      dualSign(
        {
          primarySignerUserId: primaryUserId,
          primaryPin,
          secondarySignerUserId: secondaryUserId,
          secondaryPin,
          intent: 'qa.hold.release',
          subject: { holdId: 'policy-happy' },
        },
        { client },
      ),
    );
    expect(result.primary.signerUserId).toBe(primaryUserId);
    expect(result.secondary.signerUserId).toBe(secondaryUserId);
  });
});
