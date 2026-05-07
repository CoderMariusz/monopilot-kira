/**
 * T-013 — SCIM bearer-token verification + per-request org-context wiring.
 *
 * Red lines (mirrored from T-013.md):
 *  - argon2id only — never store / verify against plaintext
 *  - <10ms verify path even on miss → uses the scim_token_last_four index
 *    instead of scanning every tenant row
 *  - Cross-tenant ambiguity guard → if multiple tenants happen to share the
 *    same last_four AND argon2.verify succeeds against >1 hash, REJECT (401);
 *    NEVER pick a tenant arbitrarily
 *  - Audit on 401 with retention_class='security', actor_type='scim'
 *  - On success, set non-spoofable org context via app.set_org_context()
 *    inside a service-role txn that the caller continues to use
 */

import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import pg from 'pg';

const { Pool } = pg;

// ─── pg.Pool factories ─────────────────────────────────────────────────────────
// We deliberately do not import @monopilot/db here — middleware lives inside
// apps/web (no workspace dep needed) and the DB role split must be honoured:
//   - ownerPool : control-plane lookups + audit + session_org_contexts wiring
//   - appPool   : runtime data plane (RLS-scoped via app.set_org_context)
//
// In tests the same DATABASE_URL is reused with a username rewrite to app_user
// for the app pool — identical to packages/db/src/clients.ts behaviour.

let ownerPool: pg.Pool | null = null;
let appPool: pg.Pool | null = null;

function getOwnerPool(): pg.Pool {
  if (ownerPool) return ownerPool;
  const cs = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('SCIM middleware requires DATABASE_URL_OWNER or DATABASE_URL');
  ownerPool = new Pool({ connectionString: cs });
  return ownerPool;
}

function getAppPool(): pg.Pool {
  if (appPool) return appPool;
  const cs = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('SCIM middleware requires DATABASE_URL_APP or DATABASE_URL');
  const url = new URL(cs);
  if (!process.env.DATABASE_URL_APP) {
    url.username = 'app_user';
    url.password = process.env.APP_USER_PASSWORD ?? 'app_user_test_password';
  }
  appPool = new Pool({ connectionString: url.toString() });
  return appPool;
}

// ─── Bearer extraction ─────────────────────────────────────────────────────────

const BEARER_RE = /^Bearer\s+(\S+)$/i;
// Minimum sane token length for a SCIM bearer ("scim_a_" + UUID-no-dashes ≥ ~30).
// We deliberately reject anything shorter than 8 characters as malformed before
// hitting argon2 — preserves <10ms budget on garbage input.
const MIN_TOKEN_LEN = 8;

function extractBearer(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (!auth) return null;
  const m = auth.match(BEARER_RE);
  if (!m) return null;
  const token = m[1];
  if (token.length < MIN_TOKEN_LEN) return null;
  return token;
}

// ─── Audit on failure (retention_class='security') ─────────────────────────────

async function auditInvalidToken(request: Request, reason: string): Promise<void> {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  // org_id is NOT NULL on audit_events — we use the all-zero UUID sentinel for
  // org-agnostic security events (token rejected before we know which org the
  // attacker was targeting). This is consistent with T-009 audit_events shape.
  const ORG_AGNOSTIC = '00000000-0000-0000-0000-000000000000';
  try {
    const pool = getOwnerPool();
    await pool.query(
      `insert into public.audit_events (
         org_id, actor_user_id, actor_type, action, resource_type, resource_id,
         request_id, retention_class, after_state
       ) values ($1, null, 'scim', 'scim.invalid_token', 'Auth', 'bearer',
                 $2::uuid, 'security', $3::jsonb)`,
      [ORG_AGNOSTIC, requestId, JSON.stringify({ reason })],
    );
  } catch {
    // Audit failure must NOT mask the 401. Swallow — operator alerting is
    // out-of-scope for this middleware (covered by T-009 retention worker).
  }
}

// ─── Verified-context shape ────────────────────────────────────────────────────

export interface ScimContext {
  tenantId: string;
  orgId: string;
  /** Fresh per-request session token registered in app.session_org_contexts. */
  sessionToken: string;
}

/**
 * Verify a SCIM bearer token and resolve its tenant/org.
 *
 * Returns null on any failure (caller should respond 401). Side-effect on
 * success: registers a fresh row in app.session_org_contexts so that the
 * route handler can call app.set_org_context() inside an app_user txn.
 *
 * Performance contract: when no tenant_idp_config row matches the bearer's
 * last-4-chars filter, this returns in O(1) without any argon2 work — well
 * inside the 10ms budget.
 */
export async function verifyScimBearer(request: Request): Promise<ScimContext | null> {
  const token = extractBearer(request);
  if (!token) {
    await auditInvalidToken(request, 'missing_or_malformed_bearer');
    return null;
  }

  const lastFour = token.slice(-4);
  const owner = getOwnerPool();

  // CONTROL PLANE: pre-session SCIM bearer auth requires a raw lookup by
  // scim_token_last_four to find the candidate tenant(s). Uses the owner pool
  // because app.current_org_id() is not yet set — the SCIM caller is
  // authenticated by the bearer itself, and the org context is established
  // immediately after a successful argon2 verify (set_org_context inside an
  // app_user txn — see withScimOrgContext below). Read is bounded to
  // {tenant_id, scim_token_hash}; the cross-tenant ambiguity guard at L160-167
  // ensures a colliding last_four cannot leak a tenant identity.
  //
  // Index lookup on tenant_idp_config_scim_last_four_idx — typically 0 or 1
  // rows. argon2.verify only runs against this filtered set, preserving the
  // <10ms budget for invalid tokens.
  const candidates = await owner.query<{
    tenant_id: string;
    scim_token_hash: string | null;
  }>(
    `select tenant_id, scim_token_hash
       from public.tenant_idp_config
      where scim_token_last_four = $1
        and scim_token_hash is not null`,
    [lastFour],
  );

  if (candidates.rowCount === 0) {
    await auditInvalidToken(request, 'no_matching_last_four');
    return null;
  }

  // Cross-tenant ambiguity guard (red line): collect ALL hashes that verify.
  // If >1 → REJECT — never pick arbitrarily.
  const verified: string[] = [];
  for (const row of candidates.rows) {
    if (!row.scim_token_hash) continue;
    let ok = false;
    try {
      ok = await argon2.verify(row.scim_token_hash, token);
    } catch {
      ok = false;
    }
    if (ok) verified.push(row.tenant_id);
  }

  if (verified.length === 0) {
    await auditInvalidToken(request, 'argon2_verify_failed');
    return null;
  }
  if (verified.length > 1) {
    await auditInvalidToken(request, 'cross_tenant_ambiguity');
    return null;
  }

  const tenantId = verified[0];

  // Resolve the single org_id for this tenant (SCIM contract: token identifies
  // a single org per the T-013 RED notes).
  const orgRows = await owner.query<{ id: string }>(
    `select id from public.organizations where tenant_id = $1 limit 2`,
    [tenantId],
  );
  if (orgRows.rowCount !== 1) {
    // Either zero (misconfiguration) or multiple orgs — refuse to guess.
    await auditInvalidToken(request, 'tenant_org_resolution_failed');
    return null;
  }
  const orgId = orgRows.rows[0].id;

  // Register a fresh session token so the route can call set_org_context()
  // safely as app_user (the function rejects an unknown token w/ 28000).
  const sessionToken = randomUUID();
  await owner.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)`,
    [sessionToken, orgId],
  );

  return { tenantId, orgId, sessionToken };
}

/**
 * Run a callback inside an app_user transaction with set_org_context applied.
 * Cleans up the session_org_contexts row on completion.
 */
export async function withScimOrgContext<T>(
  ctx: ScimContext,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const app = getAppPool();
  const client = await app.connect();
  try {
    await client.query('begin');
    await client.query(`select app.set_org_context($1, $2)`, [ctx.sessionToken, ctx.orgId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    try {
      await client.query('rollback');
    } catch {
      /* noop */
    }
    throw err;
  } finally {
    client.release();
    // Best-effort cleanup of the session_org_contexts row.
    try {
      await getOwnerPool().query(
        `delete from app.session_org_contexts where session_token = $1`,
        [ctx.sessionToken],
      );
    } catch {
      /* noop */
    }
  }
}

/**
 * Standard 401 response with the audit row already written by verifyScimBearer.
 */
export function scimUnauthorized(): Response {
  return new Response(
    JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'Invalid or missing bearer token',
    }),
    { status: 401, headers: { 'content-type': 'application/scim+json' } },
  );
}

/** Owner-pool accessor for routes that need to write security audit rows. */
export function getScimOwnerPool(): pg.Pool {
  return getOwnerPool();
}
