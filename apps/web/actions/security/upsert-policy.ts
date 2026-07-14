'use server';

import { PASSWORD_MIN_LENGTH } from '../../lib/auth/nist-password-policy';

import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';
import { withOrgContext } from '../../lib/auth/with-org-context';
import type { UpsertSecurityPolicyInput, UpsertSecurityPolicyResult } from './upsert-policy-types';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type ParsedSecurityPolicyInput = Required<UpsertSecurityPolicyInput>;

const FORBIDDEN = 'forbidden' as const;
const PASSWORD_MIN_LENGTH_FLOOR = 8;
const ALLOWED_MFA_METHODS = new Set(['totp', 'sms', 'email']);
const ADMIN_ROLE_CODES = ['owner', 'admin', 'org_admin'] as const;

type ParsePolicyResult = {
  input?: ParsedSecurityPolicyInput;
  error?: Exclude<UpsertSecurityPolicyResult, { ok: true }>['error'];
};

function parseInput(input: UpsertSecurityPolicyInput | null | undefined): ParsePolicyResult {
  if (!input || typeof input !== 'object') return { error: 'invalid_input' };

  const mfaAllowedMethods = Array.isArray(input.mfa_allowed_methods)
    ? input.mfa_allowed_methods.map((method) => String(method).trim().toLowerCase()).filter(Boolean)
    : ['totp'];
  const hasWebAuthn = mfaAllowedMethods.some((method) => method === 'webauthn');
  if (hasWebAuthn) return { error: 'webauthn_not_allowed' };
  if (mfaAllowedMethods.some((method) => !ALLOWED_MFA_METHODS.has(method))) {
    return { error: 'unsupported_mfa_method' };
  }

  const passwordMinLength = Number(input.password_min_length ?? PASSWORD_MIN_LENGTH_FLOOR);
  if (!Number.isInteger(passwordMinLength) || passwordMinLength < PASSWORD_MIN_LENGTH_FLOOR) {
    return { error: 'password_min_length_floor' };
  }

  const mfaRequirement = input.mfa_requirement ?? 'optional';
  if (!['off', 'optional', 'required_admins', 'required_all'].includes(mfaRequirement)) {
    return { error: 'invalid_input' };
  }

  const passwordComplexity = input.password_complexity ?? 'standard';
  if (!['standard', 'strong'].includes(passwordComplexity)) {
    return { error: 'invalid_input' };
  }

  return {
    input: {
      dual_control_required: input.dual_control_required ?? true,
      mfa_requirement: mfaRequirement,
      mfa_allowed_methods: mfaAllowedMethods,
      password_min_length: passwordMinLength,
      password_complexity: passwordComplexity,
    },
  };
}

export async function upsertPolicy(rawInput: UpsertSecurityPolicyInput): Promise<UpsertSecurityPolicyResult> {
  const parsed = parseInput(rawInput);
  if (parsed.error || !parsed.input) return { ok: false, error: parsed.error ?? 'invalid_input' };
  const input = parsed.input;

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
      await requireSecurityAdmin({ client, userId, orgId });

      const upsert = await client.query<{ org_id: string }>(
        `insert into public.org_security_policies
           (org_id, dual_control_required)
         values ($1::uuid, $2)
         on conflict (org_id) do update set
           dual_control_required = excluded.dual_control_required,
           updated_at = now()
         returning org_id::text as org_id`,
        [orgId, input.dual_control_required],
      );

      if (!upsert.rows[0]?.org_id) {
        throw new Error('PERSISTENCE_FAILED');
      }

      if (input.mfa_requirement === 'required_admins') {
        await forceAdminMfa({ client, orgId, actorUserId: userId });
      } else if (input.mfa_requirement === 'required_all') {
        await forceAllUsersMfa({ client, orgId, actorUserId: userId });
      }

      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, $3, null, $4::jsonb, $5)`,
        [
          orgId,
          'org.security_policy.updated',
          'org_security_policy',
          JSON.stringify({
            org_id: orgId,
            mfa_requirement: input.mfa_requirement,
            mfa_allowed_methods: input.mfa_allowed_methods,
            dual_control_required: input.dual_control_required,
            actor_user_id: userId,
          }),
          'settings-security-policy-v1',
        ],
      );

      await client.query(
        `insert into public.audit_log
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, 'org_security_policies', $4, null, $5::jsonb, 'security')`,
        [
          orgId,
          userId,
          'org.security_policy.updated',
          orgId,
          JSON.stringify({
            org_id: orgId,
            mfa_requirement: input.mfa_requirement,
            mfa_allowed_methods: input.mfa_allowed_methods,
            dual_control_required: input.dual_control_required,
          }),
        ],
      );

      revalidateLocalized('/settings/security');
      return {
        ok: true,
        data: {
          orgId: upsert.rows[0].org_id,
          mfaRequirement: input.mfa_requirement,
          passwordMinLength: PASSWORD_MIN_LENGTH,
        },
      };
    });
  } catch (error) {
    if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
    console.error('[security/upsert-policy] persistence_failed', error instanceof Error ? error : String(error));
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function upsertSecurityPolicy(
  rawInput: UpsertSecurityPolicyInput,
): Promise<UpsertSecurityPolicyResult> {
  return upsertPolicy(rawInput);
}

async function requireSecurityAdmin({ client, userId, orgId }: OrgActionContext): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or r.slug = $3
          or r.permissions ? $3
          or r.code = any($4::text[])
          or r.slug = any($4::text[])
        )
      limit 1`,
    [userId, orgId, 'org.access.admin', ADMIN_ROLE_CODES],
  );
  if (rows.length === 0) throw FORBIDDEN;
}

async function forceAdminMfa({
  client,
  orgId,
  actorUserId,
}: {
  client: QueryClient;
  orgId: string;
  actorUserId: string;
}): Promise<void> {
  const requiresMfaAt = new Date().toISOString();
  await client.query(
    `update public.users u
        set requires_mfa_at = coalesce(u.requires_mfa_at, $1::timestamptz),
            updated_at = now()
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
      where u.id = ur.user_id
        and u.org_id = $2::uuid
        and ur.org_id = $2::uuid
        and (r.code = any($3::text[]) or r.slug = any($3::text[]))`,
    [requiresMfaAt, orgId, ADMIN_ROLE_CODES],
  );
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, $3, null, $4::jsonb, $5)`,
    [
      orgId,
      'org.mfa_enrollment.forced',
      'org_security_policy',
      JSON.stringify({
        org_id: orgId,
        role_codes: ADMIN_ROLE_CODES,
        actor_user_id: actorUserId,
        requires_mfa_at: requiresMfaAt,
      }),
      'settings-security-policy-v1',
    ],
  );
}

async function forceAllUsersMfa({
  client,
  orgId,
  actorUserId,
}: {
  client: QueryClient;
  orgId: string;
  actorUserId: string;
}): Promise<void> {
  const requiresMfaAt = new Date().toISOString();
  await client.query(
    `update public.users
        set requires_mfa_at = coalesce(requires_mfa_at, $1::timestamptz),
            updated_at = now()
      where org_id = $2::uuid
        and is_active = true`,
    [requiresMfaAt, orgId],
  );
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, $3, null, $4::jsonb, $5)`,
    [
      orgId,
      'org.mfa_enrollment.forced',
      'org_security_policy',
      JSON.stringify({
        org_id: orgId,
        scope: 'all_users',
        actor_user_id: actorUserId,
        requires_mfa_at: requiresMfaAt,
      }),
      'settings-security-policy-v1',
    ],
  );
}
