import { getTranslations } from 'next-intl/server';

import {
  initializeAuthorizationPolicies as initializeAuthorizationPoliciesAction,
  updateAuthorizationPolicy as updateAuthorizationPolicyAction,
} from '../../../../../../actions/authorization/policy-actions';
import {
  NPD_POST_RELEASE_EDIT_POLICY,
  TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE,
  TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY,
  readAuthorizationPolicy,
  type AuthorizationPolicyRow,
  type QueryClient,
} from '../../../../../../actions/authorization/preflight';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import AuthorizationPoliciesScreen, {
  type AuthorizationPageProps,
  type AuthorizationScreenLabels,
  type Blocker,
  type CopyKey,
  type InitializeAuthorizationPoliciesResult,
  type NpdPolicy,
  type PolicyStatus,
  type RoleOption,
  type TechnicalPolicy,
} from './authorization-screen.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

type RoleRow = {
  code: string;
  label: string | null;
};

type PermissionCheckRow = { ok: boolean };

type AuthorizationScreenReadResult =
  | { state: 'ready'; roles: RoleOption[]; policies: NonNullable<AuthorizationPageProps['policies']>; canEditAuthorization: boolean }
  | { state: 'missing_seed'; roles: RoleOption[]; policies: { npd: NpdPolicy | null; technical: TechnicalPolicy | null }; canEditAuthorization: boolean }
  | { state: 'permission_denied'; roles: RoleOption[]; policies: NonNullable<AuthorizationPageProps['policies']>; canEditAuthorization: false }
  | { state: 'error'; roles: RoleOption[]; policies: { npd: NpdPolicy | null; technical: TechnicalPolicy | null }; canEditAuthorization: false };

const SETTINGS_AUTHORIZATION_EDIT = 'settings.authorization.edit';
const AUTHORIZATION_AUDIT_HREF = '/en/settings/audit?action=authorization_policy_update';

// Per-field numeric coalescing defaults applied only when a REAL policy row
// exists but carries a null/invalid numeric column. These are NOT a policy
// fixture/fallback — when no row exists at all the page renders missing_seed,
// and on a read failure it renders the error state with null policies.
const DEFAULT_MIN_APPROVERS = 1;
const DEFAULT_POLICY_VERSION = 1;
const DEFAULT_REQUIRE_DUAL_SIGN_OFF = true;

const AUTHORIZATION_LABEL_KEYS: CopyKey[] = [
  'auditLink',
  'auditReason',
  'auditReasonRequired',
  'auditReasonPlaceholder',
  'approvalPermission',
  'approvalPermissionHint',
  'approvalThresholds',
  'approverRoles',
  'approverRolesHint',
  'authorizePermission',
  'authorizePermissionHint',
  'authorizedRoles',
  'authorizedRolesHint',
  'blockFactoryUseUntilApproved',
  'blockerApprovalPolicyDisabled',
  'blockerApproverRoleMissing',
  'blockerAuthorizePermissionMissing',
  'blockerAuthorizerRoleMissing',
  'blockerGateRuleMissing',
  'blockerMinApproversInvalid',
  'blockerMinApproversDualSignInvalid',
  'blockerPolicyDisabled',
  'blockerRequestPermissionMissing',
  'blockerRequiresNewVersionRequired',
  'blockerSelfAuthorization',
  'blockersTitle',
  'discard',
  'dualSignOff',
  'dualSignOffNotRequired',
  'dualSignOffRequired',
  'errorBody',
  'errorTitle',
  'factoryUseLock',
  'gateRuleCode',
  'gateRuleCodeHint',
  'invariantBanner',
  'invariantFlags',
  'loadingLabel',
  'minimumApprovers',
  'minimumAuthorizers',
  'minimumAuthorizersHint',
  'missingSeedBody',
  'missingSeedTitle',
  'initializePolicies',
  'initializingPolicies',
  'initializePoliciesFailed',
  'noRoleSelected',
  'npdDescription',
  'npdTitle',
  'pageSubtitle',
  'pageTitle',
  'policiesSaved',
  'policySaveError',
  'readOnlyNotice',
  'requestPermission',
  'requestPermissionHint',
  'requiresNewVersion',
  'savePolicies',
  'saveSectionLabel',
  'segregationOfDuties',
  'statusDisabled',
  'statusEnabled',
  'statusMisconfigured',
  'technicalDescription',
  'technicalTitle',
  'version',
];

async function buildLabels(locale: string): Promise<AuthorizationScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.authorization' });
  return Object.fromEntries(AUTHORIZATION_LABEL_KEYS.map((key) => [key, t(key)])) as AuthorizationScreenLabels;
}

async function hasAuthorizationEditPermission(client: QueryClient, userId: string, orgId: string): Promise<boolean> {
  const { rows, rowCount } = await client.query<PermissionCheckRow>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, SETTINGS_AUTHORIZATION_EDIT],
  );
  return (rowCount ?? rows.length) > 0;
}

async function readRoles(client: QueryClient): Promise<RoleOption[]> {
  const { rows } = await client.query<RoleRow>(
    `select code, coalesce(name, code) as label
       from public.roles
      where org_id = app.current_org_id()
      order by case code when 'owner' then 0 when 'admin' then 1 else 2 end, name nulls last, code`,
  );
  // Real org-scoped roles only — no seed/fixture fallback. An org with no role
  // rows resolves to an empty option list.
  return rows.map((row) => ({ code: row.code, label: row.label ?? row.code }));
}

function toNumber(value: number | string | null | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function firstPermission(value: readonly string[] | null | undefined, fallback: string): string {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : fallback;
}

function statusFrom(enabled: boolean, blockers: Blocker[]): PolicyStatus {
  if (!enabled) return 'Disabled';
  return blockers.length > 0 ? 'Misconfigured' : 'Enabled';
}

function npdBlockers(row: AuthorizationPolicyRow, labels: AuthorizationScreenLabels): Blocker[] {
  const blockers: Blocker[] = [];
  if (!row.is_enabled && !row.enabled) blockers.push({ code: 'policy_disabled', policyCode: NPD_POST_RELEASE_EDIT_POLICY, message: labels.blockerPolicyDisabled });
  if (!row.request_permissions?.length) blockers.push({ code: 'request_permission_missing', policyCode: NPD_POST_RELEASE_EDIT_POLICY, message: labels.blockerRequestPermissionMissing });
  if (!row.authorize_permissions?.length) blockers.push({ code: 'authorize_permission_missing', policyCode: NPD_POST_RELEASE_EDIT_POLICY, message: labels.blockerAuthorizePermissionMissing });
  if (!row.approver_role_codes?.length) blockers.push({ code: 'authorizer_role_missing', policyCode: NPD_POST_RELEASE_EDIT_POLICY, message: labels.blockerAuthorizerRoleMissing });
  if (row.requires_new_version !== true) blockers.push({ code: 'requires_new_version_required', policyCode: NPD_POST_RELEASE_EDIT_POLICY, message: labels.blockerRequiresNewVersionRequired });
  return blockers;
}

function technicalBlockers(row: AuthorizationPolicyRow, labels: AuthorizationScreenLabels): Blocker[] {
  const blockers: Blocker[] = [];
  if (!row.is_enabled && !row.enabled) blockers.push({ code: 'approval_policy_disabled', policyCode: TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY, message: labels.blockerApprovalPolicyDisabled });
  if (!row.approval_gate_rule_code) blockers.push({ code: 'gate_rule_missing', policyCode: TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY, message: labels.blockerGateRuleMissing });
  if (toNumber(row.min_approvers, 0) < 1) blockers.push({ code: 'min_approvers_invalid', policyCode: TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY, message: labels.blockerMinApproversInvalid });
  const requireDualSignOff = Boolean(row.settings_json?.require_dual_sign_off ?? DEFAULT_REQUIRE_DUAL_SIGN_OFF);
  if (requireDualSignOff && toNumber(row.min_approvers, 0) < 2) {
    blockers.push({ code: 'min_approvers_dual_sign_invalid', policyCode: TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY, message: labels.blockerMinApproversDualSignInvalid });
  }
  if (!row.approver_role_codes?.length) blockers.push({ code: 'approver_role_missing', policyCode: TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY, message: labels.blockerApproverRoleMissing });
  return blockers;
}

function mapNpdPolicy(row: AuthorizationPolicyRow, labels: AuthorizationScreenLabels): NpdPolicy {
  const blockers = npdBlockers(row, labels);
  const enabled = row.is_enabled === true || row.enabled === true;
  return {
    policyCode: NPD_POST_RELEASE_EDIT_POLICY,
    enabled,
    status: statusFrom(enabled, blockers),
    requestPermission: firstPermission(row.request_permissions, 'npd.released_product_edit.request') as NpdPolicy['requestPermission'],
    authorizePermission: firstPermission(row.authorize_permissions, 'npd.released_product_edit.authorize') as NpdPolicy['authorizePermission'],
    authorizedRoleCodes: [...(row.approver_role_codes ?? [])],
    minApprovers: toNumber(row.min_approvers, DEFAULT_MIN_APPROVERS),
    requireSegregationOfDuties: row.require_segregation_of_duties !== false,
    requiresNewVersion: true,
    reasonRequired: true,
    version: toNumber(row.version, DEFAULT_POLICY_VERSION),
    blockers,
  };
}

function mapTechnicalPolicy(row: AuthorizationPolicyRow, labels: AuthorizationScreenLabels): TechnicalPolicy {
  const blockers = technicalBlockers(row, labels);
  const required = row.is_enabled === true || row.enabled === true;
  return {
    policyCode: TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY,
    required,
    status: statusFrom(required, blockers),
    approvalPermission: firstPermission(row.authorize_permissions, 'technical.product_spec.approve') as TechnicalPolicy['approvalPermission'],
    approverRoleCodes: [...(row.approver_role_codes ?? [])],
    minApprovers: toNumber(row.min_approvers, DEFAULT_MIN_APPROVERS),
    requireDualSignOff: Boolean(row.settings_json?.require_dual_sign_off ?? DEFAULT_REQUIRE_DUAL_SIGN_OFF),
    blockFactoryUseUntilApproved: true,
    approvalGateRuleCode: (row.approval_gate_rule_code ?? TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE) as TechnicalPolicy['approvalGateRuleCode'],
    version: toNumber(row.version, DEFAULT_POLICY_VERSION),
    blockers,
  };
}

async function readAuthorizationScreenData(labels: AuthorizationScreenLabels): Promise<AuthorizationScreenReadResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const [canEditAuthorization, roles, npdRow, technicalRow] = await Promise.all([
        hasAuthorizationEditPermission(queryClient, userId, orgId),
        readRoles(queryClient),
        readAuthorizationPolicy(queryClient, NPD_POST_RELEASE_EDIT_POLICY),
        readAuthorizationPolicy(queryClient, TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY),
      ]);

      const npd = npdRow ? mapNpdPolicy(npdRow, labels) : null;
      const technical = technicalRow ? mapTechnicalPolicy(technicalRow, labels) : null;
      if (!npd || !technical) {
        return { state: 'missing_seed' as const, roles, policies: { npd, technical }, canEditAuthorization };
      }
      return { state: 'ready' as const, roles, policies: { npd, technical }, canEditAuthorization };
    });
  } catch {
    // Read failure — surface a loud error state with NO fabricated policy data.
    return { state: 'error', roles: [], policies: { npd: null, technical: null }, canEditAuthorization: false };
  }
}

async function saveAuthorizationPolicy(input: Parameters<typeof updateAuthorizationPolicyAction>[0]) {
  'use server';
  return updateAuthorizationPolicyAction(input);
}

async function initializeAuthorizationPolicies(): Promise<InitializeAuthorizationPoliciesResult> {
  'use server';
  return initializeAuthorizationPoliciesAction();
}

export default async function AuthorizationPoliciesPage({ params }: PageProps) {
  const { locale } = await params;
  const labels = await buildLabels(locale);
  const result = await readAuthorizationScreenData(labels);

  // Honest unavailable-state: when neither real policy row resolved (read
  // failure or unseeded org) we render the loud missing/error state and tag the
  // wrapper for the production-honesty guard. There is NO fabricated policy data
  // behind this — the screen shows missingSeed/error copy only.
  const policiesNotWired = result.policies.npd === null && result.policies.technical === null;

  return (
    <div data-testid={policiesNotWired ? 'settings-authorization-unavailable' : undefined}>
      <AuthorizationPoliciesScreen
        auditLogHref={`/${locale}${AUTHORIZATION_AUDIT_HREF.slice(3)}`}
        canEditAuthorization={result.canEditAuthorization}
        labels={labels}
        policies={result.policies}
        roles={result.roles}
        screenState={result.state}
        updateAuthorizationPolicy={saveAuthorizationPolicy}
        initializeAuthorizationPolicies={initializeAuthorizationPolicies}
      />
    </div>
  );
}
