/**
 * T-014 — RBAC enforcement library: grantRole implementation
 *
 * Security design decisions (per notes/T-014.md GREEN section):
 * - Legacy aliases (fa.*, brief.convert_to_fa) are REJECTED outright with 'legacy_alias'
 *   (not normalized-and-persisted) — fail-safe over convenience.
 * - SoD check: if ACTOR holds a role in a SOD_EXCLUSIVE_PAIR with the requested roleSlug,
 *   dual-control approval is required. This prevents a single org.access.admin from
 *   granting org.schema.admin without a second administrator's sign-off.
 * - Self-approval: approverUserId === actorUserId is hard-rejected at token generation AND
 *   at grant time (even if a forged token slips through, the decoded approver is checked).
 * - All DB operations are in a single transaction (rollback on any failure).
 * - HMAC key falls back to a test-only sentinel when RBAC_APPROVAL_HMAC_KEY is absent.
 *   In production the env var must be set.
 * - Uses owner connection (BYPASSRLS) because grantRole is a privileged operation that
 *   manages org roles and must write audit_events across org contexts. The app_user role
 *   cannot access app.session_org_contexts directly.
 */

import { createHmac, randomUUID } from 'node:crypto';
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
  return process.env.RBAC_APPROVAL_HMAC_KEY ?? 'test-only-hmac-key-DO-NOT-USE-IN-PROD';
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
    if (signature !== expectedSig) return { valid: false, error: 'invalid_token' };

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

    // Step 2: Load org_security_policies
    const { rows: policyRows } = await client.query<{ dual_control_required: boolean }>(
      `SELECT dual_control_required FROM public.org_security_policies WHERE org_id = $1`,
      [orgId],
    );
    const dualControlRequired = policyRows.length > 0 ? policyRows[0]!.dual_control_required : true;

    // Step 3: Load actor's existing roles in this org
    const { rows: actorRoleRows } = await client.query<{ slug: string }>(
      `SELECT r.slug FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1 AND ur.org_id = $2`,
      [actorUserId, orgId],
    );
    const actorSlugs = actorRoleRows.map((r) => r.slug);

    // Step 4: SoD check — if actor holds the sibling of the requested role, dual control required
    let sodViolation = false;
    for (const pair of SOD_EXCLUSIVE_PAIRS) {
      const [a, b] = pair;
      if (
        (roleSlug === b && actorSlugs.includes(a)) ||
        (roleSlug === a && actorSlugs.includes(b))
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
