'use server';

import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';
import { withOrgContext } from '../../lib/auth/with-org-context';
import { findMissingD365Constants } from '../../lib/integrations/d365/gate';

export type SetCoreFlagInput = {
  flagCode: string;
  enabled: boolean;
  auditReason?: string;
};

export type SetCoreFlagResult =
  | { ok: true; data: { flagCode: string; enabled: boolean } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'flag_not_found'
        | 'd365_preflight_failed'
        | 'authorization_policy_failed'
        | 'persistence_failed';
      failedChecks?: string[];
      policyCode?: string;
    };

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type AuthorizationPolicyRow = {
  policy_code: string;
  enabled?: boolean | null;
  authorize_role_count?: number | string | null;
  requires_new_version?: boolean | null;
  approval_gate_rule_code?: string | null;
  min_approvers?: number | string | null;
};

type FeatureFlagRow = {
  flag_code: string;
  is_enabled: boolean;
};

const FORBIDDEN = 'forbidden' as const;
const FLAG_CODE_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const D365_FLAG = 'integration.d365.enabled';
const NPD_POST_RELEASE_EDIT_FLAG = 'npd.post_release_edit.enabled';
const TECHNICAL_PRODUCT_SPEC_APPROVAL_FLAG = 'technical.product_spec_approval.required';
const NPD_POLICY_CODE = 'npd_post_release_edit';
const TECHNICAL_POLICY_CODE = 'technical_product_spec_approval';
const TECHNICAL_APPROVAL_GATE_RULE = 'technical_product_spec_approval_gate_v1';

export async function setCoreFlag(rawInput: SetCoreFlagInput): Promise<SetCoreFlagResult> {
  const input = parseInput(rawInput);
  if (!input) {
    return { ok: false, error: 'invalid_input' };
  }

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requirePermission({ client, userId, orgId });

      const preflight = await runEnablePreflight({ client, flagCode: input.flagCode, enabled: input.enabled });
      if (preflight) {
        return preflight;
      }

      const updated = await client.query<FeatureFlagRow>(
        `update public.feature_flags_core
            set is_enabled = $1,
                updated_at = now(),
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and flag_code = $3
        returning flag_code, is_enabled`,
        [input.enabled, userId, input.flagCode],
      );
      const flag = updated.rows[0];
      if ((updated.rowCount ?? updated.rows.length) < 1 || !flag) {
        return { ok: false, error: 'flag_not_found' };
      }

      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, $3, null, $4::jsonb, $5)`,
        [
          orgId,
          'settings.core_flag.updated',
          'core_flag',
          JSON.stringify({
            org_id: orgId,
            flag_code: flag.flag_code,
            enabled: flag.is_enabled,
            actor_user_id: userId,
            audit_reason: input.auditReason,
          }),
          'settings-set-core-flag-v1',
        ],
      );

      revalidateLocalized('/settings/flags');
      return { ok: true, data: { flagCode: flag.flag_code, enabled: flag.is_enabled } };
    } catch (error) {
      if (error === FORBIDDEN) {
        return { ok: false, error: 'forbidden' };
      }
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

function parseInput(input: SetCoreFlagInput | null | undefined): SetCoreFlagInput | null {
  if (!input || typeof input !== 'object') return null;
  const flagCode = typeof input.flagCode === 'string' ? input.flagCode.trim() : '';
  if (!FLAG_CODE_PATTERN.test(flagCode) || typeof input.enabled !== 'boolean') return null;
  const auditReason = typeof input.auditReason === 'string' ? input.auditReason.trim() : undefined;
  return {
    flagCode,
    enabled: input.enabled,
    auditReason: auditReason && auditReason.length > 0 ? auditReason : undefined,
  };
}

async function requirePermission({ client, userId, orgId }: OrgActionContext): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.permissions ? $3
        )
      limit 1`,
    [userId, orgId, 'org.access.admin'],
  );
  if (rows.length === 0) throw FORBIDDEN;
}

async function runEnablePreflight({
  client,
  flagCode,
  enabled,
}: {
  client: QueryClient;
  flagCode: string;
  enabled: boolean;
}): Promise<SetCoreFlagResult | null> {
  if (!enabled) return null;

  if (flagCode === D365_FLAG) {
    const missingConstants = await findMissingD365Constants(client);
    const failedChecks: string[] = [];
    if (missingConstants.length > 0) failedChecks.push('V-SET-42');
    if (!hasRuntimeD365ConnectionConfig()) {
      failedChecks.push('V-SET-50', 'V-SET-52');
    }
    if (failedChecks.length > 0) {
      return { ok: false, error: 'd365_preflight_failed', failedChecks };
    }
  }

  if (flagCode === NPD_POST_RELEASE_EDIT_FLAG) {
    const policy = await readAuthorizationPolicy(client, NPD_POLICY_CODE);
    const authorizeRoleCount = toNumber(policy?.authorize_role_count);
    if (!policy?.enabled || authorizeRoleCount < 1 || policy.requires_new_version !== true) {
      return {
        ok: false,
        error: 'authorization_policy_failed',
        policyCode: NPD_POLICY_CODE,
        failedChecks: ['V-SET-43'],
      };
    }
  }

  if (flagCode === TECHNICAL_PRODUCT_SPEC_APPROVAL_FLAG) {
    const policy = await readAuthorizationPolicy(client, TECHNICAL_POLICY_CODE);
    const gate = await client.query(
      `select rule_code, is_active as active
         from public.rule_definitions
        where org_id = app.current_org_id()
          and rule_code = $1
          and rule_code = 'technical_product_spec_approval_gate_v1'
          and rule_type = 'gate'
          and is_active = true
        order by version desc
        limit 1`,
      [TECHNICAL_APPROVAL_GATE_RULE],
    );
    const minApprovers = toNumber(policy?.min_approvers);
    if (
      !policy?.enabled ||
      policy.approval_gate_rule_code !== TECHNICAL_APPROVAL_GATE_RULE ||
      minApprovers < 1 ||
      (gate.rowCount ?? gate.rows.length) < 1
    ) {
      return {
        ok: false,
        error: 'authorization_policy_failed',
        policyCode: TECHNICAL_POLICY_CODE,
        failedChecks: ['V-SET-44'],
      };
    }
  }

  return null;
}

function hasRuntimeD365ConnectionConfig(): boolean {
  const baseUrl = process.env.D365_BASE_URL ?? process.env.NEXT_PUBLIC_D365_BASE_URL;
  const tenantId = process.env.D365_TENANT_ID;
  const clientId = process.env.D365_CLIENT_ID;
  const secretConfigured = Boolean(process.env.D365_CLIENT_SECRET_REF || process.env.D365_CLIENT_SECRET_SET);
  return Boolean(baseUrl && tenantId && clientId && secretConfigured && process.env.D365_OAUTH_BEARER);
}

async function readAuthorizationPolicy(
  client: QueryClient,
  policyCode: typeof NPD_POLICY_CODE | typeof TECHNICAL_POLICY_CODE,
): Promise<AuthorizationPolicyRow | null> {
  const { rows } = await client.query<AuthorizationPolicyRow>(
    `select policy_code,
            is_enabled as enabled,
            cardinality(authorize_permissions) as authorize_role_count,
            requires_new_version,
            approval_gate_rule_code,
            min_approvers
       from public.org_authorization_policies
      where org_id = app.current_org_id()
        and policy_code = $1
      limit 1`,
    [policyCode],
  );
  return rows[0] ?? null;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}
