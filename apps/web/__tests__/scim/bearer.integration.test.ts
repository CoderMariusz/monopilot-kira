/**
 * T-034 — SCIM bearer verification (scim_tokens bridge) — REAL integration test.
 *
 * Why this file exists:
 *   apps/web/app/api/scim/scim.test.ts mocks `verifyScimBearer` entirely, so the
 *   actual argon2 bearer-auth path + the scim_tokens ↔ tenant_idp_config UNION ALL
 *   bridge in apps/web/lib/scim/middleware.ts was never exercised by a test. This
 *   suite removes that blind spot by driving the REAL middleware (no mock of the
 *   thing under test) against a live Postgres.
 *
 * What it covers:
 *   AC1 — a valid scim_tokens bearer (argon2id-hashed) authenticates: verifyScimBearer
 *         resolves { orgId, tenantId, sessionToken } for the owning org, and the
 *         session token it registers is usable by app.set_org_context().
 *   AC2 — a wrong bearer (argon2.verify fails) → null → the route returns 401.
 *   AC3 — a revoked scim_token (revoked_at set) → null → 401 (the UNION ALL branch
 *         filters `revoked_at is null`).
 *   AC4 — a missing/malformed Authorization header → null → 401.
 *
 * Guard: requires DATABASE_URL (same mechanism as users.integration.test.ts and the
 * packages/db *.integration.test.ts suites). Skips cleanly when the DB is offline.
 *
 * Run:
 *   pnpm db:up   # ensure a migrated local Postgres is up
 *   DATABASE_URL=postgres://… pnpm exec vitest run apps/web/__tests__/scim/bearer.integration.test.ts
 *
 * The bearer-auth path uses the OWNER pool (DATABASE_URL_OWNER ?? DATABASE_URL); the
 * route's data plane uses the app_user pool. Both are honoured by the real middleware.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';

import { verifyScimBearer, scimUnauthorized } from '../../lib/scim/middleware';

const databaseUrl = process.env.DATABASE_URL;
const runIfDb = databaseUrl ? it : it.skip;

// Argon2id parameters per project pattern (m=64MiB, t=3, p=1).
const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

const TENANT = randomUUID();
const ORG = randomUUID();

// Plaintext SCIM tokens — NEVER stored. Token model: scim_<random>.
const VALID_TOKEN = 'scim_t034_' + randomUUID().replace(/-/g, '');
const REVOKED_TOKEN = 'scim_t034rev_' + randomUUID().replace(/-/g, '');
const WRONG_TOKEN = 'scim_t034wrong_' + randomUUID().replace(/-/g, '');

const VALID_TOKEN_ID = randomUUID();
const REVOKED_TOKEN_ID = randomUUID();

let ownerPool: pg.Pool;
let appPool: pg.Pool;

function bearerRequest(token: string | null): Request {
  const headers: Record<string, string> = { 'content-type': 'application/scim+json' };
  if (token !== null) headers['authorization'] = `Bearer ${token}`;
  return new Request('https://web.test/api/scim/v2/Users', { method: 'GET', headers });
}

beforeAll(async () => {
  if (!databaseUrl) return;

  const { getOwnerConnection, getAppConnection } = await import(
    '../../../../packages/db/test-utils/test-pool.js'
  );
  ownerPool = getOwnerConnection();
  appPool = getAppConnection();

  const validHash = await argon2.hash(VALID_TOKEN, ARGON2_OPTS);
  const revokedHash = await argon2.hash(REVOKED_TOKEN, ARGON2_OPTS);

  // Idempotent seed: tenant + org.
  await ownerPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-034 Tenant', 'eu', 'https://t034.test.invalid')
     on conflict (id) do nothing`,
    [TENANT],
  );
  await ownerPool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'T-034 Org', 'generic')
     on conflict (id) do nothing`,
    [ORG, TENANT],
  );

  // Ensure the legacy tenant_idp_config row (auto-created by the 005 AFTER-INSERT
  // trigger) does NOT carry a colliding last_four — keep the bridge branches clean.
  await ownerPool.query(
    `update public.tenant_idp_config
        set scim_token_hash = null, scim_token_last_four = null
      where tenant_id = $1`,
    [TENANT],
  );

  // Seed an ACTIVE scim_tokens row (the bridge's second UNION ALL branch).
  await ownerPool.query(
    `insert into public.scim_tokens (id, org_id, label, scim_token_hash, scim_token_last_four)
     values ($1, $2, 'T-034 Active', $3, $4)
     on conflict (id) do nothing`,
    [VALID_TOKEN_ID, ORG, validHash, VALID_TOKEN.slice(-4)],
  );

  // Seed a REVOKED scim_tokens row — must NOT authenticate.
  await ownerPool.query(
    `insert into public.scim_tokens (id, org_id, label, scim_token_hash, scim_token_last_four, revoked_at)
     values ($1, $2, 'T-034 Revoked', $3, $4, now())
     on conflict (id) do nothing`,
    [REVOKED_TOKEN_ID, ORG, revokedHash, REVOKED_TOKEN.slice(-4)],
  );
});

afterAll(async () => {
  if (!databaseUrl) return;

  await ownerPool
    .query(`delete from public.scim_tokens where id in ($1, $2)`, [VALID_TOKEN_ID, REVOKED_TOKEN_ID])
    .catch(() => undefined);
  // verifyScimBearer registers a fresh app.session_org_contexts row on success; clear any for this org.
  await ownerPool.query(`delete from app.session_org_contexts where org_id = $1`, [ORG]).catch(() => undefined);
  await ownerPool.query(`delete from public.organizations where id = $1`, [ORG]).catch(() => undefined);
  await ownerPool.query(`delete from public.tenants where id = $1`, [TENANT]).catch(() => undefined);

  await appPool?.end();
  await ownerPool?.end();
});

describe('T-034: verifyScimBearer against the scim_tokens bridge (real middleware)', () => {
  runIfDb('AC1: a valid scim_tokens bearer authenticates and resolves the owning org', async () => {
    const ctx = await verifyScimBearer(bearerRequest(VALID_TOKEN));

    expect(ctx, 'a valid argon2-hashed scim_tokens bearer must authenticate').not.toBeNull();
    expect(ctx!.orgId).toBe(ORG);
    expect(ctx!.tenantId).toBe(TENANT);
    expect(ctx!.sessionToken, 'verifyScimBearer must register a fresh session token').toMatch(
      /^[0-9a-f-]{36}$/i,
    );

    // The session token it registered must be accepted by app.set_org_context as app_user.
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1, $2)', [ctx!.sessionToken, ctx!.orgId]);
      const who = await client.query<{ org: string }>('select app.current_org_id()::text as org');
      await client.query('rollback');
      expect(who.rows[0]?.org).toBe(ORG);
    } finally {
      client.release();
    }
  });

  runIfDb('AC2: a wrong bearer (argon2 verify fails) → null → route 401', async () => {
    const ctx = await verifyScimBearer(bearerRequest(WRONG_TOKEN));
    expect(ctx, 'an unknown bearer must NOT authenticate').toBeNull();

    // The route maps null → scimUnauthorized() (401).
    const res = ctx ? new Response(null, { status: 200 }) : scimUnauthorized();
    expect(res.status).toBe(401);
  });

  runIfDb('AC3: a revoked scim_token → null → route 401 (UNION ALL filters revoked_at)', async () => {
    const ctx = await verifyScimBearer(bearerRequest(REVOKED_TOKEN));
    expect(ctx, 'a revoked scim_token must NOT authenticate').toBeNull();
    const res = ctx ? new Response(null, { status: 200 }) : scimUnauthorized();
    expect(res.status).toBe(401);
  });

  runIfDb('AC4: a missing/malformed Authorization header → null → route 401', async () => {
    const ctxMissing = await verifyScimBearer(bearerRequest(null));
    expect(ctxMissing).toBeNull();

    const ctxMalformed = await verifyScimBearer(
      new Request('https://web.test/api/scim/v2/Users', {
        method: 'GET',
        headers: { authorization: 'Bearer x' }, // shorter than MIN_TOKEN_LEN
      }),
    );
    expect(ctxMalformed).toBeNull();

    expect(scimUnauthorized().status).toBe(401);
  });
});
