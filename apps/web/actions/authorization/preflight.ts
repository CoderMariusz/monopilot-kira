export const NPD_POST_RELEASE_EDIT_POLICY = 'npd_post_release_edit' as const;
export const TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY = 'technical_product_spec_approval' as const;
export const TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE = 'technical_product_spec_approval_gate_v1' as const;

export type AuthorizationPolicyCode =
  | typeof NPD_POST_RELEASE_EDIT_POLICY
  | typeof TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY;

export type NpdPostReleaseEditBlocker =
  | { code: 'policy_missing'; policyCode: typeof NPD_POST_RELEASE_EDIT_POLICY }
  | { code: 'policy_disabled'; policyCode: typeof NPD_POST_RELEASE_EDIT_POLICY }
  | { code: 'request_permission_missing'; policyCode: typeof NPD_POST_RELEASE_EDIT_POLICY }
  | { code: 'authorize_permission_missing'; policyCode: typeof NPD_POST_RELEASE_EDIT_POLICY }
  | { code: 'authorizer_role_missing'; policyCode: typeof NPD_POST_RELEASE_EDIT_POLICY }
  | { code: 'self_authorization'; policyCode: typeof NPD_POST_RELEASE_EDIT_POLICY }
  | { code: 'requires_new_version_required'; policyCode: typeof NPD_POST_RELEASE_EDIT_POLICY };

export type TechnicalApprovalBlocker =
  | { code: 'approval_policy_missing'; policyCode: typeof TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY }
  | { code: 'approval_policy_disabled'; policyCode: typeof TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY }
  | { code: 'gate_rule_missing'; policyCode: typeof TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY }
  | { code: 'min_approvers_invalid'; policyCode: typeof TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY }
  | { code: 'approver_role_missing'; policyCode: typeof TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY };

export type NpdPostReleaseEditPreflightResult =
  | { ok: true; blockers: [] }
  | { ok: false; blockers: NpdPostReleaseEditBlocker[] };

export type TechnicalApprovalPreflightResult =
  | { ok: true; blockers: [] }
  | { ok: false; blockers: TechnicalApprovalBlocker[] };

export type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type AuthorizationPolicyRow = {
  policy_code: AuthorizationPolicyCode;
  is_enabled?: boolean | null;
  enabled?: boolean | null;
  request_permissions?: readonly string[] | null;
  authorize_permissions?: readonly string[] | null;
  approver_role_codes?: readonly string[] | null;
  min_approvers?: number | string | null;
  require_segregation_of_duties?: boolean | null;
  requires_new_version?: boolean | null;
  approval_gate_rule_code?: string | null;
  version?: number | string | null;
  settings_json?: Record<string, unknown> | null;
};

type GateRuleRow = {
  rule_code?: string | null;
  active_from?: string | null;
  active_to?: string | null;
};

export async function runNpdPostReleaseEditPreflight(input: {
  client: QueryClient;
  requesterUserId: string;
  authorizerUserId: string;
  policyCode?: typeof NPD_POST_RELEASE_EDIT_POLICY;
}): Promise<NpdPostReleaseEditPreflightResult> {
  const policyCode = input.policyCode ?? NPD_POST_RELEASE_EDIT_POLICY;
  const policy = await readAuthorizationPolicy(input.client, policyCode);
  if (!policy) {
    return { ok: false, blockers: [{ code: 'policy_missing', policyCode }] };
  }

  const blockers: NpdPostReleaseEditBlocker[] = [];
  if (!isEnabled(policy)) blockers.push({ code: 'policy_disabled', policyCode });
  if (arrayLength(policy.request_permissions) < 1) blockers.push({ code: 'request_permission_missing', policyCode });
  if (arrayLength(policy.authorize_permissions) < 1) blockers.push({ code: 'authorize_permission_missing', policyCode });
  if (arrayLength(policy.approver_role_codes) < 1) blockers.push({ code: 'authorizer_role_missing', policyCode });
  if (policy.require_segregation_of_duties !== false && input.requesterUserId === input.authorizerUserId) {
    blockers.push({ code: 'self_authorization', policyCode });
  }
  if (policy.requires_new_version !== true) blockers.push({ code: 'requires_new_version_required', policyCode });

  return blockers.length > 0 ? { ok: false, blockers } : { ok: true, blockers: [] };
}

export async function runTechnicalApprovalPreflight(input: {
  client: QueryClient;
  policyCode?: typeof TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY;
}): Promise<TechnicalApprovalPreflightResult> {
  const policyCode = input.policyCode ?? TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY;
  const policy = await readAuthorizationPolicy(input.client, policyCode);
  if (!policy) {
    return { ok: false, blockers: [{ code: 'approval_policy_missing', policyCode }] };
  }

  const gateRuleCode = policy.approval_gate_rule_code ?? TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE;
  const activeGate = await readActiveGateRule(input.client, gateRuleCode);
  const blockers: TechnicalApprovalBlocker[] = [];

  if (!isEnabled(policy)) blockers.push({ code: 'approval_policy_disabled', policyCode });
  if (!activeGate) blockers.push({ code: 'gate_rule_missing', policyCode });
  if (toNumber(policy.min_approvers) < 1) blockers.push({ code: 'min_approvers_invalid', policyCode });
  if (arrayLength(policy.approver_role_codes) < 1) blockers.push({ code: 'approver_role_missing', policyCode });

  return blockers.length > 0 ? { ok: false, blockers } : { ok: true, blockers: [] };
}

export async function readAuthorizationPolicy(
  client: QueryClient,
  policyCode: AuthorizationPolicyCode,
): Promise<AuthorizationPolicyRow | null> {
  const { rows } = await client.query<AuthorizationPolicyRow>(
    `select policy_code,
            is_enabled,
            is_enabled as enabled,
            request_permissions,
            authorize_permissions,
            approver_role_codes,
            min_approvers,
            require_segregation_of_duties,
            requires_new_version,
            approval_gate_rule_code,
            version,
            settings_json
       from public.org_authorization_policies
      where org_id = app.current_org_id()
        and policy_code = $1
      limit 1`,
    [policyCode],
  );
  return rows[0] ?? null;
}

async function readActiveGateRule(client: QueryClient, gateRuleCode: string): Promise<boolean> {
  const { rows, rowCount } = await client.query<GateRuleRow>(
    `select rule_code, active_from, active_to
       from public.rule_definitions
      where org_id = app.current_org_id()
        and rule_code = $1
        and rule_type = 'gate'
        and active_from <= now()
        and (active_to is null or active_to > now())
      order by version desc
      limit 1`,
    [gateRuleCode],
  );
  return (rowCount ?? rows.length) > 0;
}

function isEnabled(policy: AuthorizationPolicyRow): boolean {
  return policy.is_enabled === true || policy.enabled === true;
}

function arrayLength(value: readonly unknown[] | null | undefined): number {
  return Array.isArray(value) ? value.length : 0;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}
