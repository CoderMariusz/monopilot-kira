/**
 * T-013 — SCIM 2.0 /Users (and /Groups) endpoints — RED-phase integration tests
 *
 * Security-critical surface:
 *  - argon2id bearer-token verification against tenant_idp_config.scim_token_hash
 *  - Cross-tenant isolation (token issued for org A MUST NOT mutate org B)
 *  - Soft-delete via PATCH active=false → users.deleted_at + audit_events
 *
 * RED status:
 *  - Imports `../../app/api/scim/v2/Users/route` and `../../lib/scim/middleware`
 *    which do NOT exist yet.  GREEN implementer creates them per task scope_files.
 *  - `users.deleted_at` column does not exist in 001-baseline.sql; GREEN implementer
 *    must add it via the assigned migration (per STATUS.md migration-ordering lock,
 *    NOT chosen here).  Tests assert column existence and behaviour against that
 *    GREEN-phase migration.
 *  - All tests are intentionally failing until GREEN implements:
 *      a) `apps/web/app/api/scim/v2/Users/route.ts` (POST/GET)
 *      b) `apps/web/app/api/scim/v2/Users/[id]/route.ts` (PATCH)
 *      c) `apps/web/lib/scim/middleware.ts` (bearer-token verify + org-context wiring)
 *      d) migration adding `users.deleted_at timestamptz` (nullable)
 *
 * Mutation experiments documented in T-013.md (one per AC) — each test catches the
 * specified mutation.
 *
 * Test infra:
 *  - `getOwnerConnection()` for DDL/seed/teardown and BYPASSRLS read-back.
 *  - `getAppConnection()` for runtime queries the route handler will make under RLS.
 *  - Live Postgres required (DATABASE_URL).  Tests skip cleanly in offline CI.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

// ─── Imports that WILL FAIL until GREEN implements them ─────────────────────────
// These import paths match the scope_files listed in T-013.json.
// They are intentionally unresolvable in RED phase.
import { POST as scimUsersPOST, GET as scimUsersGET } from '../../app/api/scim/v2/Users/route';
import { PATCH as scimUserPATCH } from '../../app/api/scim/v2/Users/[id]/route';

const databaseUrl = process.env.DATABASE_URL;
const runIfDb = databaseUrl ? it : it.skip;

// Argon2id parameters per T-016 / project pattern (m=64MiB, t=3, p=1).
const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Shared seed: two tenants, two orgs, one user-of-record per org, two SCIM tokens.
// ═══════════════════════════════════════════════════════════════════════════════

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

// Plaintext SCIM tokens — NEVER stored in DB.
const SCIM_TOKEN_A = 'scim_a_' + randomUUID().replace(/-/g, '');
const SCIM_TOKEN_B = 'scim_b_' + randomUUID().replace(/-/g, '');
const INVALID_TOKEN = 'scim_invalid_' + randomUUID().replace(/-/g, '');

let ownerPool: import('pg').Pool;
let appPool: import('pg').Pool;

beforeAll(async () => {
  if (!databaseUrl) return;

  const { getOwnerConnection, getAppConnection } = await import(
    '../../../../packages/db/test-utils/test-pool'
  );
  ownerPool = getOwnerConnection();
  appPool = getAppConnection();

  // Hash both tokens with argon2id.  Hashes are persisted into
  // tenant_idp_config.scim_token_hash (added by migration 016 — see T-060).
  const hashA = await argon2.hash(SCIM_TOKEN_A, ARGON2_OPTS);
  const hashB = await argon2.hash(SCIM_TOKEN_B, ARGON2_OPTS);

  // Idempotent seed: two tenants, two orgs.
  await ownerPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-013 Tenant A', 'eu', 'https://t013-a.test.invalid'),
            ($2, 'T-013 Tenant B', 'eu', 'https://t013-b.test.invalid')
     on conflict (id) do nothing`,
    [TENANT_A, TENANT_B],
  );

  await ownerPool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'T-013 Org A', 'generic'),
            ($3, $4, 'T-013 Org B', 'generic')
     on conflict (id) do nothing`,
    [ORG_A, TENANT_A, ORG_B, TENANT_B],
  );

  // Persist argon2id-hashed SCIM tokens + last_four onto tenant_idp_config
  // (row was created by 005-tenant-idp-config.sql AFTER INSERT trigger).
  await ownerPool.query(
    `update public.tenant_idp_config
        set scim_token_hash = $2,
            scim_token_last_four = $3
      where tenant_id = $1`,
    [TENANT_A, hashA, SCIM_TOKEN_A.slice(-4)],
  );
  await ownerPool.query(
    `update public.tenant_idp_config
        set scim_token_hash = $2,
            scim_token_last_four = $3
      where tenant_id = $1`,
    [TENANT_B, hashB, SCIM_TOKEN_B.slice(-4)],
  );
});

afterAll(async () => {
  if (!databaseUrl) return;

  // Clean up everything the tests created — FK-safe order.
  await ownerPool.query(
    `delete from public.audit_events where org_id in ($1, $2)`,
    [ORG_A, ORG_B],
  );
  await ownerPool.query(
    `delete from public.users where org_id in ($1, $2)`,
    [ORG_A, ORG_B],
  );
  await ownerPool.query(
    `update public.tenant_idp_config set scim_token_hash = null, scim_token_last_four = null where tenant_id in ($1, $2)`,
    [TENANT_A, TENANT_B],
  );
  await ownerPool.query(`delete from public.organizations where id in ($1, $2)`, [ORG_A, ORG_B]);
  await ownerPool.query(`delete from public.tenants where id in ($1, $2)`, [TENANT_A, TENANT_B]);

  await ownerPool.end();
  await appPool.end();
});

// Helper: build a Next.js Request for a SCIM route.  The route handlers under test
// accept the standard fetch `Request` type (see app/api/internal/flags/route.ts pattern).
function scimRequest(opts: {
  url: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  token: string | null;
  body?: unknown;
}): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/scim+json',
  };
  if (opts.token !== null) {
    headers['authorization'] = `Bearer ${opts.token}`;
  }
  return new Request(opts.url, {
    method: opts.method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('AC1: SCIM bearer (argon2id-verified for org A) creates user in org A only', () => {
  // AC1 — "Given a SCIM bearer token whose argon2id hash matches
  //        tenant_idp_config.scim_token_hash for org A, when POST /scim/v2/Users
  //        runs, then a user is created in org A AND SELECT scoped to org B
  //        returns zero rows."
  //
  // Mutation matrix (each must hold):
  //  M1.1 (cross-tenant leak): if implementer uses BYPASSRLS pool for the POST INSERT,
  //       the user could land in either org based on body — test catches by reading
  //       org B via getAppConnection AFTER set_org_context(token_for_B, ORG_B) → 0 rows.
  //  M1.2 (token byte-flip): tweaking one byte of token plaintext → argon2.verify
  //       returns false → 401 (covered by AC2 negative test).
  //  M1.3 (RLS bypass attempt): if route uses owner pool, AC1 still passes for org B
  //       (owner sees everything) — test mitigates by SELECTing through getAppConnection
  //       with org_B context → RLS scopes the read → mutated impl that put user into
  //       org B would show as a non-zero row count.

  runIfDb(
    'POST /scim/v2/Users with token-A creates user in org A',
    async () => {
      const externalId = 'ac1-user-' + randomUUID();
      const userName = `ac1.${externalId}@example.com`;

      const req = scimRequest({
        url: 'https://web.test/scim/v2/Users',
        method: 'POST',
        token: SCIM_TOKEN_A,
        body: {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName,
          externalId,
          name: { givenName: 'AC1', familyName: 'User' },
          active: true,
        },
      });

      const res = await scimUsersPOST(req);
      // SCIM spec: 201 Created on POST /Users success.
      expect(res.status).toBe(201);

      // Read back via OWNER pool (bypasses RLS) — proves the row exists in org A.
      const ownerRead = await ownerPool.query(
        `select id, org_id, email, deleted_at from public.users where email = $1`,
        [userName],
      );
      expect(ownerRead.rowCount).toBe(1);
      expect(ownerRead.rows[0].org_id).toBe(ORG_A);
      expect(ownerRead.rows[0].deleted_at).toBeNull();
    },
  );

  runIfDb(
    'after POST with token-A, SELECT scoped to org B returns 0 rows (RLS isolation)',
    async () => {
      // Seed a fresh user for this test
      const externalId = 'ac1-iso-' + randomUUID();
      const userName = `ac1iso.${externalId}@example.com`;

      const req = scimRequest({
        url: 'https://web.test/scim/v2/Users',
        method: 'POST',
        token: SCIM_TOKEN_A,
        body: {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName,
          externalId,
          active: true,
        },
      });
      const res = await scimUsersPOST(req);
      expect(res.status).toBe(201);

      // Now register a session_org_context for ORG_B and read the users table
      // through getAppConnection — RLS must scope the SELECT to org B and return 0.
      const sessionTokenB = randomUUID();
      await ownerPool.query(
        `insert into app.session_org_contexts (session_token, org_id)
         values ($1, $2) on conflict (session_token) do nothing`,
        [sessionTokenB, ORG_B],
      );

      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`select app.set_org_context($1, $2)`, [sessionTokenB, ORG_B]);

        const isolated = await client.query(
          `select count(*)::int as n from public.users where email = $1`,
          [userName],
        );
        // CRITICAL: row created via token-A landed in org A; org-B context must see 0.
        // Mutation: agent uses owner pool for this read → row visible → fails this assertion.
        expect(isolated.rows[0].n).toBe(0);

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      await ownerPool.query(
        `delete from app.session_org_contexts where session_token = $1`,
        [sessionTokenB],
      );
    },
  );

  runIfDb(
    'GET /scim/v2/Users with token-A lists ONLY org-A users (cross-tenant SELECT guard)',
    async () => {
      // Pre-seed a user in org B directly (bypasses SCIM) to prove that GET /Users
      // with token-A does NOT leak it.
      const orgBUserId = randomUUID();
      const orgBEmail = `orgb.${orgBUserId}@example.com`;
      await ownerPool.query(
        `insert into public.users (id, org_id, email, display_name)
         values ($1, $2, $3, 'Org B Direct')`,
        [orgBUserId, ORG_B, orgBEmail],
      );

      const req = scimRequest({
        url: 'https://web.test/scim/v2/Users',
        method: 'GET',
        token: SCIM_TOKEN_A,
      });
      const res = await scimUsersGET(req);
      expect(res.status).toBe(200);

      const body = (await res.json()) as { Resources?: Array<{ userName?: string }> };
      const emails = (body.Resources ?? []).map((r) => r.userName);
      // Mutation: route uses owner pool / no RLS → org-B email leaks into list.
      expect(emails).not.toContain(orgBEmail);

      await ownerPool.query(`delete from public.users where id = $1`, [orgBUserId]);
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('AC2: invalid bearer token → 401 in <10ms + audit_events retention=security', () => {
  // AC2 — "Given an invalid bearer token, when any SCIM route is called, then
  //        it returns 401 in <10ms (argon2 verify path) AND writes an audit_events
  //        row with retention_class='security'."
  //
  // Mutation matrix:
  //  M2.1 (timing): argon2.verify on a malformed/short hash returns false fast
  //       (no expensive KDF call when format invalid).  10ms covers cold-cache
  //       JIT.  A bcrypt fallback would exceed the bound on first call.
  //       NB: 10ms is per-call wall-clock with the test running in a warmed
  //       Node process; the threshold pins the verify-path budget, not the
  //       process bootstrap.
  //  M2.2 (audit retention flip): assertion is exact-match
  //       `retention_class === 'security'` — flip to 'operational' fails.
  //  M2.3 (no-audit-on-401): if implementer omits the audit insert, count is 0
  //       and test fails.

  runIfDb(
    'POST /scim/v2/Users with invalid token returns 401',
    async () => {
      const req = scimRequest({
        url: 'https://web.test/scim/v2/Users',
        method: 'POST',
        token: INVALID_TOKEN,
        body: { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'x@y.z' },
      });
      const res = await scimUsersPOST(req);
      // Mutation: agent returns 403 or 500 instead of 401 → fails (exact match).
      expect(res.status).toBe(401);
    },
  );

  runIfDb(
    'GET /scim/v2/Users with missing Authorization header returns 401',
    async () => {
      const req = scimRequest({
        url: 'https://web.test/scim/v2/Users',
        method: 'GET',
        token: null,
      });
      const res = await scimUsersGET(req);
      expect(res.status).toBe(401);
    },
  );

  runIfDb(
    'verify path completes in <10ms for invalid token (argon2 fast-fail)',
    async () => {
      // Warm-up: first call may JIT-compile argon2 native code.  Discard timing
      // of the first call by running it twice; only assert on the second.
      for (let i = 0; i < 2; i++) {
        const req = scimRequest({
          url: 'https://web.test/scim/v2/Users',
          method: 'GET',
          token: INVALID_TOKEN,
        });
        const t0 = process.hrtime.bigint();
        const res = await scimUsersGET(req);
        const elapsedMs = Number(process.hrtime.bigint() - t0) / 1_000_000;
        expect(res.status).toBe(401);
        if (i === 1) {
          // Mutation: agent uses bcrypt with cost=12 → first call ~150ms+ on warm cache.
          // Mutation: agent forgets to early-reject malformed hashes → real argon2.verify
          //           triggered against EVERY tenant_idp_config row → O(N) full hashes.
          expect(elapsedMs).toBeLessThan(10);
        }
      }
    },
  );

  runIfDb(
    'invalid token writes audit_events row with retention_class=security (exact match)',
    async () => {
      // Snapshot pre-call audit row count for deterministic delta.
      const requestId = randomUUID();
      const req = new Request('https://web.test/scim/v2/Users', {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${INVALID_TOKEN}`,
          'content-type': 'application/scim+json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({ schemas: [], userName: 'will@reject.com' }),
      });
      const res = await scimUsersPOST(req);
      expect(res.status).toBe(401);

      // Read audit_events via owner pool (RLS-bypass) — there is no org context for
      // a rejected token, so the audit row is org-agnostic but still recorded.
      const audit = await ownerPool.query(
        `select retention_class, action, actor_type
           from public.audit_events
          where request_id = $1
          order by occurred_at desc
          limit 1`,
        [requestId],
      );
      // Mutation: agent skips audit write on 401 → rowCount=0 → fails.
      expect(audit.rowCount).toBe(1);
      // Mutation: agent uses retention_class='operational' → exact-match fails.
      expect(audit.rows[0].retention_class).toBe('security');
      // Mutation: agent uses actor_type='user' (wrong) → fails.
      expect(audit.rows[0].actor_type).toBe('scim');
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('AC3: PATCH active=false → users.deleted_at set + user.deactivated_via_scim audit', () => {
  // AC3 — "Given a PATCH active=false arrives, when processed, then
  //        users.deleted_at is set AND audit_events row with
  //        action='user.deactivated_via_scim' is written."
  //
  // Mutation matrix:
  //  M3.1 (hard-delete): if agent does DELETE FROM users WHERE id=$1, the row is
  //       gone and the SELECT returns 0 — test asserts row STILL EXISTS with
  //       deleted_at IS NOT NULL.
  //  M3.2 (no-op): if agent only writes audit and doesn't update deleted_at,
  //       deleted_at is null → fails.
  //  M3.3 (wrong audit action): exact-match `action === 'user.deactivated_via_scim'`
  //       — `'user.deleted'` or `'user.deactivated'` fail.
  //  M3.4 (audit retention flip on AC3): retention_class is left to the standard
  //       audit policy (caller-defined; not asserted here — AC3 spec does not pin
  //       a retention class for this action).

  runIfDb(
    'PATCH active=false sets deleted_at on the user row (soft-delete, NOT hard delete)',
    async () => {
      // Seed a user via the SCIM POST path (proves end-to-end), then deactivate it.
      const externalId = 'ac3-user-' + randomUUID();
      const userName = `ac3.${externalId}@example.com`;

      const createReq = scimRequest({
        url: 'https://web.test/scim/v2/Users',
        method: 'POST',
        token: SCIM_TOKEN_A,
        body: {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName,
          externalId,
          active: true,
        },
      });
      const createRes = await scimUsersPOST(createReq);
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as { id?: string };
      expect(typeof created.id).toBe('string');
      const userId = created.id as string;

      const patchReq = new Request(`https://web.test/scim/v2/Users/${userId}`, {
        method: 'PATCH',
        headers: {
          'authorization': `Bearer ${SCIM_TOKEN_A}`,
          'content-type': 'application/scim+json',
        },
        body: JSON.stringify({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [{ op: 'replace', path: 'active', value: false }],
        }),
      });
      const patchRes = await scimUserPATCH(patchReq, { params: Promise.resolve({ id: userId }) });
      expect(patchRes.status).toBe(200);

      // Read back via OWNER pool to bypass RLS and prove the row STILL EXISTS.
      const after = await ownerPool.query(
        `select id, deleted_at from public.users where id = $1`,
        [userId],
      );
      // Mutation M3.1 (hard delete): rowCount would be 0 — fail.
      expect(after.rowCount).toBe(1);
      // Mutation M3.2 (no-op): deleted_at would still be null — fail.
      expect(after.rows[0].deleted_at).not.toBeNull();
      expect(after.rows[0].deleted_at).toBeInstanceOf(Date);
    },
  );

  runIfDb(
    'PATCH active=false writes audit row with action=user.deactivated_via_scim (exact)',
    async () => {
      const externalId = 'ac3-audit-' + randomUUID();
      const userName = `ac3audit.${externalId}@example.com`;
      const requestId = randomUUID();

      // Seed the user
      const createReq = scimRequest({
        url: 'https://web.test/scim/v2/Users',
        method: 'POST',
        token: SCIM_TOKEN_A,
        body: {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName,
          externalId,
          active: true,
        },
      });
      const createRes = await scimUsersPOST(createReq);
      const created = (await createRes.json()) as { id?: string };
      const userId = created.id as string;

      // Deactivate with a known request-id so we can pin the audit row deterministically.
      const patchReq = new Request(`https://web.test/scim/v2/Users/${userId}`, {
        method: 'PATCH',
        headers: {
          'authorization': `Bearer ${SCIM_TOKEN_A}`,
          'content-type': 'application/scim+json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [{ op: 'replace', path: 'active', value: false }],
        }),
      });
      const patchRes = await scimUserPATCH(patchReq, { params: Promise.resolve({ id: userId }) });
      expect(patchRes.status).toBe(200);

      const audit = await ownerPool.query(
        `select action, actor_type, resource_type, resource_id, org_id
           from public.audit_events
          where request_id = $1
          order by occurred_at desc
          limit 1`,
        [requestId],
      );
      expect(audit.rowCount).toBe(1);
      // Mutation M3.3: 'user.deleted' or 'user.deactivated' would fail this exact match.
      expect(audit.rows[0].action).toBe('user.deactivated_via_scim');
      expect(audit.rows[0].actor_type).toBe('scim');
      expect(audit.rows[0].resource_type).toBe('User');
      expect(audit.rows[0].resource_id).toBe(userId);
      // Audit row must be scoped to the correct org (org A), not org B.
      expect(audit.rows[0].org_id).toBe(ORG_A);
    },
  );

  runIfDb(
    'PATCH active=false on a user in another org via token-A is rejected (cross-tenant)',
    async () => {
      // Pre-seed a user in ORG_B directly.
      const orgBUserId = randomUUID();
      await ownerPool.query(
        `insert into public.users (id, org_id, email, display_name)
         values ($1, $2, $3, 'Org B Cross-Tenant Patch Target')`,
        [orgBUserId, ORG_B, `cross.${orgBUserId}@example.com`],
      );

      const patchReq = new Request(`https://web.test/scim/v2/Users/${orgBUserId}`, {
        method: 'PATCH',
        headers: {
          'authorization': `Bearer ${SCIM_TOKEN_A}`, // token for ORG_A
          'content-type': 'application/scim+json',
        },
        body: JSON.stringify({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [{ op: 'replace', path: 'active', value: false }],
        }),
      });
      const patchRes = await scimUserPATCH(patchReq, {
        params: Promise.resolve({ id: orgBUserId }),
      });

      // Either 404 (RLS-scoped lookup returns nothing) or 403 — but NOT 200.
      // Mutation: route ignores org scoping → returns 200 → fails.
      expect([403, 404]).toContain(patchRes.status);

      // CRITICAL: org-B user must remain undeleted.
      const after = await ownerPool.query(
        `select deleted_at from public.users where id = $1`,
        [orgBUserId],
      );
      expect(after.rowCount).toBe(1);
      expect(after.rows[0].deleted_at).toBeNull();

      await ownerPool.query(`delete from public.users where id = $1`, [orgBUserId]);
    },
  );
});
