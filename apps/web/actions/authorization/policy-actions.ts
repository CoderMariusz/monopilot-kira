'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '../../lib/auth/with-org-context';
import {
  type AuthorizationPolicyCode,
  type AuthorizationPolicyRow,
  type QueryClient,
  readAuthorizationPolicy,
} from './preflight';

export type UpdateAuthorizationPolicyInput = {
  policyCode: string;
  patch: Partial<AuthorizationPolicyRow>;
  auditReason?: string;
};

export type UpdateAuthorizationPolicyResult =
  | { ok: true; data: { policyCode: string; version: number } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'audit_reason_required' | 'policy_not_found' | 'persistence_failed' };

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

const SETTINGS_AUTHORIZATION_EDIT = 'settings.authorization.edit';
const AUTHORIZATION_SETTINGS_PATH = '/settings/authorization';

export async function updateAuthorizationPolicy(
  input: UpdateAuthorizationPolicyInput,
): Promise<UpdateAuthorizationPolicyResult> {
  const parsed = parseInput(input);
  if (!parsed) return { ok: false, error: 'invalid_input' };

  return withOrgContext<UpdateAuthorizationPolicyResult>(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      const allowed = await hasAuthorizationEditPermission({ client, userId, orgId });
      if (!allowed) return { ok: false, error: 'forbidden' };

      if (!parsed.auditReason) return { ok: false, error: 'audit_reason_required' };

      const current = await readAuthorizationPolicy(client, parsed.policyCode);
      if (!current) return { ok: false, error: 'policy_not_found' };

      const updated = await client.query<{ policy_code: string; version: number | string }>(
        `update public.org_authorization_policies
            set is_enabled = coalesce($2::boolean, is_enabled),
                request_permissions = coalesce($3::text[], request_permissions),
                authorize_permissions = coalesce($4::text[], authorize_permissions),
                approver_role_codes = coalesce($5::text[], approver_role_codes),
                min_approvers = coalesce($6::integer, min_approvers),
                require_segregation_of_duties = coalesce($7::boolean, require_segregation_of_duties),
                requires_new_version = coalesce($8::boolean, requires_new_version),
                approval_gate_rule_code = coalesce($9::text, approval_gate_rule_code),
                settings_json = coalesce($10::jsonb, settings_json),
                updated_by = $11::uuid,
                updated_at = now(),
                version = version + 1
          where org_id = app.current_org_id()
            and policy_code = $1
        returning policy_code, version`,
        [
          parsed.policyCode,
          nullableBoolean(parsed.patch.is_enabled ?? parsed.patch.enabled),
          nullableStringArray(parsed.patch.request_permissions),
          nullableStringArray(parsed.patch.authorize_permissions),
          nullableStringArray(parsed.patch.approver_role_codes),
          nullableInteger(parsed.patch.min_approvers),
          nullableBoolean(parsed.patch.require_segregation_of_duties),
          nullableBoolean(parsed.patch.requires_new_version),
          nullableString(parsed.patch.approval_gate_rule_code),
          parsed.patch.settings_json ? JSON.stringify(parsed.patch.settings_json) : null,
          userId,
        ],
      );
      const row = updated.rows[0];
      if ((updated.rowCount ?? updated.rows.length) < 1 || !row) return { ok: false, error: 'policy_not_found' };

      await client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, event_type, subject_type, subject_id, reason, metadata)
         values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb)`,
        [
          orgId,
          userId,
          'settings.authorization_policy.updated',
          'org_authorization_policy',
          parsed.policyCode,
          parsed.auditReason,
          JSON.stringify({ policy_code: parsed.policyCode, version: toNumber(row.version) }),
        ],
      );

      await client.query(
        `with selected_policy as (select $6::text as policy_code)
         insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         select $1::uuid, $2, $3, null, $4::jsonb, $5
           from selected_policy`,
        [
          orgId,
          'settings.authorization_policy.updated',
          'org_authorization_policy',
          JSON.stringify({
            org_id: orgId,
            policy_code: parsed.policyCode,
            version: toNumber(row.version),
            actor_user_id: userId,
            audit_reason: parsed.auditReason,
          }),
          'authorization-policy-actions-v1',
          parsed.policyCode,
        ],
      );

      revalidatePath(AUTHORIZATION_SETTINGS_PATH);
      return { ok: true, data: { policyCode: row.policy_code, version: toNumber(row.version) } };
    } catch {
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

async function hasAuthorizationEditPermission({ client, userId, orgId }: OrgActionContext): Promise<boolean> {
  const { rows, rowCount } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       join public.role_permissions rp on rp.role_id = r.id
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and rp.permission = $3
      limit 1`,
    [userId, orgId, SETTINGS_AUTHORIZATION_EDIT],
  );
  return (rowCount ?? rows.length) > 0;
}

function parseInput(input: UpdateAuthorizationPolicyInput | null | undefined): (UpdateAuthorizationPolicyInput & {
  policyCode: AuthorizationPolicyCode;
  auditReason: string | null;
}) | null {
  if (!input || typeof input !== 'object') return null;
  if (input.policyCode !== 'npd_post_release_edit' && input.policyCode !== 'technical_product_spec_approval') return null;
  if (!input.patch || typeof input.patch !== 'object') return null;
  const auditReason = typeof input.auditReason === 'string' ? input.auditReason.trim() : null;
  return { ...input, policyCode: input.policyCode, auditReason };
}

function nullableStringArray(value: readonly string[] | null | undefined): readonly string[] | null {
  return Array.isArray(value) ? value : null;
}

function nullableBoolean(value: boolean | null | undefined): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function nullableInteger(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && Number.isInteger(Number(value))) return Number(value);
  return null;
}

function nullableString(value: string | null | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function toNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}
