/**
 * T-014 — RBAC enforcement library: grantRole implementation
 *
 * Security design decisions (per notes/T-014.md GREEN section):
 * - Legacy aliases (fa.*, brief.convert_to_fa) are REJECTED outright with 'legacy_alias'
 *   (not normalized-and-persisted) — fail-safe over convenience.
 * - SoD check: if TARGET holds a role in a SOD_EXCLUSIVE_PAIR with the requested roleSlug,
 *   dual-control approval is required. This checks whether the TARGET would hold conflicting
 *   roles (AC1: "a user holding org.access.admin cannot receive org.schema.admin").
 * - Self-approval: approverUserId === actorUserId is hard-rejected at token generation AND
 *   at grant time (even if a forged token slips through, the decoded approver is checked).
 * - All DB operations are in a single transaction (rollback on any failure).
 * - HMAC key is REQUIRED in production (NODE_ENV==='production' && !VITEST). Falls back to a
 *   test-only sentinel in non-production environments only.
 * - Uses owner connection (BYPASSRLS) because grantRole is a privileged operation that
 *   manages org roles and must write audit_events across org contexts. The app_user role
 *   cannot access app.session_org_contexts directly.
 * - Actor and target org membership are validated before any DB writes to prevent
 *   horizontal privilege escalation (cross-org grant attacks).
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getOwnerConnection } from '../../db/src/clients.js';
import { LegacyPermissionAlias, SOD_EXCLUSIVE_PAIRS } from './permissions.enum.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface GrantRoleInput {
  actorUserId: string;
  targetUserId: string;
  orgId: string;
  roleSlug: string;
  approvalToken?: string;
}

export type GrantRoleError = 'sod_violation' | 'self_approval' | 'invalid_token' | 'legacy_alias';

export interface GrantRoleResult {
  success: boolean;
  error?: GrantRoleError;
}

export interface GenerateApprovalTokenInput {
  actorUserId: string;
  approverUserId: string; // must differ from actorUserId
  orgId: string;
  targetUserId: string;
  roleSlug: string;
}

// ─── HMAC helpers ─────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getHmacKey(): string {
  const key = process.env.RBAC_APPROVAL_HMAC_KEY;
  if (!key) {
    // Production guard: mirrors getAppConnection() env-guard pattern in packages/db/src/clients.ts.
    // VITEST guard allows CI test runs that set NODE_ENV=production.
    if (process.env.NODE_ENV === 'production' && !process.env.VITEST) {
      throw new Error('RBAC_APPROVAL_HMAC_KEY env var is required in production');
    }
    return 'test-only-hmac-key-DO-NOT-USE-IN-PROD';
  }
  return key;
}

function computeHmac(payload: string): string {
  return createHmac('sha256', getHmacKey()).update(payload).digest('hex');
}

interface TokenPayload {
  actorUserId: string;
  approverUserId: string;
  orgId: string;
  targetUserId: string;
  roleSlug: string;
  exp: number;
  /**
   * FT-011 — single-use token id. Generated at issuance and recorded in
   * public.consumed_approval_tokens on first successful verification inside
   * grantRole's transaction. Subsequent attempts to replay the same token
   * fail with `invalid_token` even though the HMAC signature still matches.
   */
  jti: string;
}

// ─── generateApprovalToken ────────────────────────────────────────────────────

export async function generateApprovalToken(input: GenerateApprovalTokenInput): Promise<string> {
  const { actorUserId, approverUserId, orgId, targetUserId, roleSlug } = input;

  // Red line: self-approval is forbidden at token generation time
  if (actorUserId === approverUserId) {
    throw new Error(
      'self-approval not permitted: actor cannot approve their own role grant',
    );
  }

  const payload: TokenPayload = {
    actorUserId,
    approverUserId,
    orgId,
    targetUserId,
    roleSlug,
    exp: Date.now() + TOKEN_TTL_MS,
    // FT-011 — fresh UUID per token; recorded in consumed_approval_tokens
    // on first use to prevent replay even within the 5-minute TTL window.
    jti: randomUUID(),
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson).toString('base64url');
  const signature = computeHmac(payloadB64);

  return `${payloadB64}.${signature}`;
}

// ─── verifyApprovalToken ──────────────────────────────────────────────────────

type TokenVerifyResult =
  | { valid: true; payload: TokenPayload }
  | { valid: false; error: 'invalid_token' | 'self_approval' };

function verifyApprovalToken(
  token: string,
  actorUserId: string,
): TokenVerifyResult {
  try {
    const dotIdx = token.lastIndexOf('.');
    if (dotIdx < 0) return { valid: false, error: 'invalid_token' };

    const payloadB64 = token.slice(0, dotIdx);
    const signature = token.slice(dotIdx + 1);

    const expectedSig = computeHmac(payloadB64);
    // T-062 hardening: constant-time comparison to defeat timing oracles.
    // crypto.timingSafeEqual requires equal-length buffers — check first to
    // avoid the RangeError it throws on length mismatch.
    const presented = Buffer.from(signature, 'hex');
    const expected = Buffer.from(expectedSig, 'hex');
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      return { valid: false, error: 'invalid_token' };
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as TokenPayload;

    // Check TTL
    if (Date.now() > payload.exp) return { valid: false, error: 'invalid_token' };

    // Red line: approverUserId must differ from actorUserId
    if (payload.approverUserId === actorUserId) {
      return { valid: false, error: 'self_approval' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'invalid_token' };
  }
}

// ─── Org membership guards ────────────────────────────────────────────────────

/**
 * Asserts that userId belongs to orgId by checking the users table.
 * Must be called BEFORE any DB writes to prevent horizontal privilege escalation.
 * (T-066 carry-forward: also enforce via RLS in T-067)
 */
async function assertUserBelongsToOrg(
  client: import('pg').PoolClient,
  userId: string,
  orgId: string,
  role: 'actor' | 'target',
): Promise<void> {
  const r = await client.query(
    'SELECT 1 FROM public.users WHERE id = $1 AND org_id = $2 LIMIT 1',
    [userId, orgId],
  );
  if (r.rowCount === 0) {
    throw new Error(`${role} does not belong to specified orgId`);
  }
}

// ─── grantRole ────────────────────────────────────────────────────────────────

export async function grantRole(input: GrantRoleInput): Promise<GrantRoleResult> {
  const { actorUserId, targetUserId, orgId, roleSlug, approvalToken } = input;

  // Step 1: Reject legacy aliases outright — do NOT normalize-and-persist (fail-safe)
  if (Object.prototype.hasOwnProperty.call(LegacyPermissionAlias, roleSlug)) {
    return { success: false, error: 'legacy_alias' };
  }

  // Step 1b: Quick token pre-check (no DB needed) — catches obviously invalid tokens
  // before we open a DB connection. Primarily helps unit tests without DB setup.
  if (approvalToken !== undefined) {
    const preCheck = verifyApprovalToken(approvalToken, actorUserId);
    if (!preCheck.valid) {
      return { success: false, error: preCheck.error };
    }
  }

  // No DATABASE_URL → cannot proceed with DB-dependent checks
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_OWNER) {
    return { success: false, error: 'sod_violation' };
  }

  const pool = getOwnerConnection();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Step 1c: Org membership validation — BEFORE any other DB work.
    // Prevents horizontal privilege escalation: caller in org A cannot pass orgId=B
    // and write roles/audit rows in org B.
    await assertUserBelongsToOrg(client, actorUserId, orgId, 'actor');
    await assertUserBelongsToOrg(client, targetUserId, orgId, 'target');

    // Step 2: Load org_security_policies
    const { rows: policyRows } = await client.query<{ dual_control_required: boolean }>(
      `SELECT dual_control_required FROM public.org_security_policies WHERE org_id = $1`,
      [orgId],
    );
    const dualControlRequired = policyRows.length > 0 ? policyRows[0]!.dual_control_required : true;

    // Step 3: Load TARGET's existing roles in this org (SoD checks the recipient, not the actor)
    // AC1: "A user holding org.access.admin cannot RECEIVE org.schema.admin" — target-centric.
    const { rows: targetRoleRows } = await client.query<{ slug: string }>(
      `SELECT r.slug FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1 AND ur.org_id = $2`,
      [targetUserId, orgId],
    );
    const targetSlugs = targetRoleRows.map((r) => r.slug);

    // Step 4: SoD check — if TARGET already holds the sibling of the requested role,
    // dual-control approval is required. AC1 is target-centric: "a user holding
    // org.access.admin cannot RECEIVE org.schema.admin".
    // MUTATION: swapping targetSlugs back to actorSlugs breaks the new test
    // "neutral actor grants schema.admin to a target who already holds access.admin → sod_violation".
    let sodViolation = false;
    for (const pair of SOD_EXCLUSIVE_PAIRS) {
      const [a, b] = pair;
      if (
        (roleSlug === b && targetSlugs.includes(a)) ||
        (roleSlug === a && targetSlugs.includes(b))
      ) {
        sodViolation = true;
        break;
      }
    }

    // Step 5: If SoD violation or dual_control_required, validate approval token
    if (sodViolation || dualControlRequired) {
      if (!approvalToken) {
        await client.query('ROLLBACK');
        // If SoD violation, report sod_violation; otherwise report missing token
        if (sodViolation) {
          return { success: false, error: 'sod_violation' };
        }
        return { success: false, error: 'invalid_token' };
      }

      // Re-verify token (already done above as pre-check, but re-verify in transaction scope)
      const verification = verifyApprovalToken(approvalToken, actorUserId);
      if (!verification.valid) {
        await client.query('ROLLBACK');
        return { success: false, error: verification.error };
      }

      // FT-011 — jti replay check (must run inside the transaction so the
      // INSERT into consumed_approval_tokens and the role grant either both
      // commit or both roll back). If the token's jti has already been seen,
      // the HMAC is valid but this is a replay → reject with invalid_token.
      const { rowCount: alreadyConsumed } = await client.query(
        `SELECT 1 FROM public.consumed_approval_tokens WHERE jti = $1`,
        [verification.payload.jti],
      );
      if ((alreadyConsumed ?? 0) > 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'invalid_token' };
      }

      // Mark the token consumed BEFORE we do the actual grant. If the grant
      // INSERT fails downstream the ROLLBACK will also clear the consumed-row
      // (single transaction) — but a successful grant guarantees the jti is
      // permanently burnt, so a replay of the same token cannot grant the
      // role a second time.
      await client.query(
        `INSERT INTO public.consumed_approval_tokens (jti, org_id) VALUES ($1, $2)`,
        [verification.payload.jti, orgId],
      );
    }

    // Step 6: Find or create the role row for this slug in the org
    const { rows: roleRows } = await client.query<{ id: string }>(
      `SELECT id FROM public.roles WHERE org_id = $1 AND slug = $2`,
      [orgId, roleSlug],
    );

    let roleId: string;
    if (roleRows.length === 0) {
      const { rows: newRoleRows } = await client.query<{ id: string }>(
        `INSERT INTO public.roles (org_id, slug, system) VALUES ($1, $2, false)
         ON CONFLICT (org_id, slug) DO UPDATE SET slug = EXCLUDED.slug
         RETURNING id`,
        [orgId, roleSlug],
      );
      roleId = newRoleRows[0]!.id;
    } else {
      roleId = roleRows[0]!.id;
    }

    // Step 7: Insert user_roles row
    await client.query(
      `INSERT INTO public.user_roles (user_id, role_id, org_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [targetUserId, roleId, orgId],
    );

    // Step 8: Insert audit_events row (retention_class='security' per T-014 red line)
    await client.query(
      `INSERT INTO public.audit_events
         (org_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, retention_class)
       VALUES ($1, $2, 'user', 'role.assigned', 'role', $3, $4, 'security')`,
      [orgId, actorUserId, roleSlug, randomUUID()],
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
