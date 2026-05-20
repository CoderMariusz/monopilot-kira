'use server';

import { randomUUID } from 'node:crypto';
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

type ParsedUpdateAuthorizationPolicyInput = Omit<UpdateAuthorizationPolicyInput, 'policyCode' | 'auditReason'> & {
  policyCode: AuthorizationPolicyCode;
  auditReason: string | null;
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

      const nextVersion = toNumber(row.version);
      const requestId = randomUUID();

      await client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            after_state, request_id, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, $4, $5, $6::jsonb, $7::uuid, 'security')`,
        [
          orgId,
          userId,
          'authorization_policy_update',
          'org_authorization_policy',
          parsed.policyCode,
          JSON.stringify({
            policy_code: parsed.policyCode,
            previous_version: toNumber(current.version ?? 0),
            version: nextVersion,
            audit_reason: parsed.auditReason,
          }),
          requestId,
        ],
      );

      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, $3, $4::uuid, $5::jsonb, $6)`,
        [
          orgId,
          'audit.recorded',
          'org_authorization_policy',
          orgId,
          JSON.stringify({
            org_id: orgId,
            action: 'authorization_policy_update',
            resource_type: 'org_authorization_policy',
            resource_id: parsed.policyCode,
            policy_code: parsed.policyCode,
            version: nextVersion,
            actor_user_id: userId,
            audit_reason: parsed.auditReason,
            request_id: requestId,
          }),
          'authorization-policy-actions-v1',
        ],
      );

      revalidatePath(AUTHORIZATION_SETTINGS_PATH);
      return { ok: true, data: { policyCode: row.policy_code, version: nextVersion } };
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

function parseInput(input: UpdateAuthorizationPolicyInput | null | undefined): ParsedUpdateAuthorizationPolicyInput | null {
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
