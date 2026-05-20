import React from 'react';

import { updateAuthorizationPolicy as updateAuthorizationPolicyAction } from '../../../../../actions/authorization/policy-actions';
import {
  NPD_POST_RELEASE_EDIT_POLICY,
  TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE,
  TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY,
} from '../../../../../actions/authorization/preflight';
import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardDescription, CardHeader, CardTitle } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';

export const dynamic = 'force-dynamic';

type PolicyStatus = 'Enabled' | 'Disabled' | 'Misconfigured';
type Blocker = { code: string; policyCode: string; message: string };
type RoleOption = { code: string; label: string };

type NpdPolicy = {
  policyCode: typeof NPD_POST_RELEASE_EDIT_POLICY;
  enabled: boolean;
  status: PolicyStatus;
  requestPermission: 'npd.released_product_edit.request';
  authorizePermission: 'npd.released_product_edit.authorize';
  authorizedRoleCodes: string[];
  minApprovers: number;
  requireSegregationOfDuties: boolean;
  requiresNewVersion: true;
  reasonRequired: boolean;
  version: number;
  blockers: Blocker[];
};

type TechnicalPolicy = {
  policyCode: typeof TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY;
  required: boolean;
  status: PolicyStatus;
  approvalPermission: 'technical.product_spec.approve';
  approverRoleCodes: string[];
  minApprovers: number;
  requireDualSignOff: boolean;
  blockFactoryUseUntilApproved: true;
  approvalGateRuleCode: typeof TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE;
  version: number;
  blockers: Blocker[];
};

type UpdateAuthorizationPolicyInput = {
  policyCode: NpdPolicy['policyCode'] | TechnicalPolicy['policyCode'];
  patch: Record<string, unknown>;
  auditReason: string;
};

type UpdateAuthorizationPolicyResult =
  | { ok: true; data?: { policyCode?: string; version?: number } }
  | { ok: false; error?: string; blockers?: Blocker[] };

type AuthorizationPageProps = {
  screenState?: 'ready' | 'loading' | 'missing_seed' | 'permission_denied';
  canEditAuthorization?: boolean;
  roles?: RoleOption[];
  policies?: {
    npd: NpdPolicy | null;
    technical: TechnicalPolicy | null;
  };
  auditLogHref?: string;
  updateAuthorizationPolicy?: (input: UpdateAuthorizationPolicyInput) => Promise<UpdateAuthorizationPolicyResult>;
};

type AuthorizationPageState = {
  auditReason: string;
  npdMinApprovers: number;
  fieldAlert: string | null;
  serverBlockers: Blocker[];
  saved: boolean;
};

const defaultRoles: RoleOption[] = [
  { code: 'owner', label: 'Owner' },
  { code: 'admin', label: 'Admin' },
  { code: 'npd_manager', label: 'NPD Manager' },
  { code: 'quality_lead', label: 'Quality Lead' },
];

const defaultPolicies: Required<AuthorizationPageProps>['policies'] = {
  npd: {
    policyCode: NPD_POST_RELEASE_EDIT_POLICY,
    enabled: true,
    status: 'Enabled',
    requestPermission: 'npd.released_product_edit.request',
    authorizePermission: 'npd.released_product_edit.authorize',
    authorizedRoleCodes: ['owner'],
    minApprovers: 1,
    requireSegregationOfDuties: true,
    requiresNewVersion: true,
    reasonRequired: true,
    version: 1,
    blockers: [],
  },
  technical: {
    policyCode: TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY,
    required: true,
    status: 'Enabled',
    approvalPermission: 'technical.product_spec.approve',
    approverRoleCodes: ['quality_lead'],
    minApprovers: 1,
    requireDualSignOff: true,
    blockFactoryUseUntilApproved: true,
    approvalGateRuleCode: TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE,
    version: 1,
    blockers: [],
  },
};

function roleLabels(roleCodes: string[], roles: RoleOption[]) {
  const labelsByCode = new Map(roles.map((role) => [role.code, role.label]));
  return roleCodes.map((code) => labelsByCode.get(code) ?? code).join(', ') || 'No role selected';
}

function badgeTone(status: PolicyStatus) {
  if (status === 'Enabled') return 'success';
  if (status === 'Misconfigured') return 'warning';
  return 'muted';
}

function Section({
  region,
  title,
  description,
  status,
  children,
}: {
  region: string;
  title: string;
  description?: string;
  status?: PolicyStatus;
  children: React.ReactNode;
}) {
  return (
    <section data-region={region} role="region" aria-label={title}>
      <Card className="rounded-xl border bg-white shadow-sm">
        <CardHeader className="flex items-start justify-between gap-4 border-b px-5 py-4 md:flex-row">
          <div>
            <CardTitle className="text-base font-semibold text-slate-950">{title}</CardTitle>
            {description ? <CardDescription className="mt-1 text-sm text-slate-500">{description}</CardDescription> : null}
          </div>
          {status ? <Badge tone={badgeTone(status)}>{status}</Badge> : null}
        </CardHeader>
        <div className="divide-y divide-slate-100 p-0">{children}</div>
      </Card>
    </section>
  );
}

function SRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(220px,0.55fr)_1fr] md:items-center">
      <div>
        <div className="text-sm font-medium text-slate-900">{label}</div>
        {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
      </div>
      <div className="min-w-0 text-sm text-slate-900">{children}</div>
    </div>
  );
}

function CodePill({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-800">{children}</code>;
}

function BlockerList({ blockers }: { blockers: Blocker[] }) {
  if (blockers.length === 0) return null;
  return (
    <div role="alert" className="m-5 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <div className="font-semibold">Typed blockers from T-126 preflight</div>
      <ul className="list-disc space-y-1 pl-5">
        {blockers.map((blocker) => (
          <li key={`${blocker.policyCode}-${blocker.code}`}>
            <CodePill>{blocker.code}</CodePill> <span>{blocker.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LoadingState() {
  return (
    <main className="space-y-5 p-6">
      <section data-region="page-head" className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-950">Authorization Policies</h1>
        <p className="text-sm text-slate-500">Control who can request released product/BOM edits and technical approval gates.</p>
      </section>
      <div role="status" aria-label="Loading authorization policies" aria-busy="true" className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((item) => (
          <Card key={item} data-testid="authorization-policy-card-skeleton" className="h-64 animate-pulse rounded-xl border bg-slate-100" />
        ))}
      </div>
    </main>
  );
}

function MissingSeedState({ auditLogHref }: { auditLogHref: string }) {
  return (
    <main className="space-y-5 p-6">
      <PageHead auditLogHref={auditLogHref} />
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-950">
        <h2 className="text-base font-semibold">Authorization policy seed missing</h2>
        <p className="mt-1">Required org_authorization_policies rows are absent. Seed these policy codes before editing settings:</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CodePill>{NPD_POST_RELEASE_EDIT_POLICY}</CodePill>
          <CodePill>{TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY}</CodePill>
        </div>
      </div>
    </main>
  );
}

function PageHead({ auditLogHref }: { auditLogHref: string }) {
  return (
    <section data-region="page-head" className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Authorization Policies</h1>
        <p className="text-sm text-slate-500">Control who can request released product/BOM edits and technical approval gates.</p>
      </div>
      <a data-region="audit-link" className="text-sm font-medium text-blue-600" href={auditLogHref}>
        View audit log →
      </a>
    </section>
  );
}

export default class AuthorizationPoliciesPage extends React.Component<AuthorizationPageProps, AuthorizationPageState> {
  static defaultProps = {
    screenState: 'ready',
    canEditAuthorization: false,
    roles: defaultRoles,
    policies: defaultPolicies,
    auditLogHref: '/en/settings/audit?action=authorization_policy_update',
    updateAuthorizationPolicy: updateAuthorizationPolicyAction as unknown as (input: UpdateAuthorizationPolicyInput) => Promise<UpdateAuthorizationPolicyResult>,
  } satisfies Partial<AuthorizationPageProps>;

  constructor(props: AuthorizationPageProps) {
    super(props);
    this.state = {
      auditReason: '',
      npdMinApprovers: props.policies?.npd?.minApprovers ?? defaultPolicies.npd!.minApprovers,
      fieldAlert: null,
      serverBlockers: [],
      saved: false,
    };
  }

  resetEdits = () => {
    this.setState({
      auditReason: '',
      npdMinApprovers: this.props.policies?.npd?.minApprovers ?? defaultPolicies.npd!.minApprovers,
      fieldAlert: null,
      serverBlockers: [],
      saved: false,
    });
  };

  savePolicies = async () => {
    const auditReason = this.state.auditReason.trim();
    if (!auditReason) {
      this.setState({ fieldAlert: 'Audit reason is required', serverBlockers: [], saved: false });
      return;
    }

    const update: (input: UpdateAuthorizationPolicyInput) => Promise<UpdateAuthorizationPolicyResult> =
      this.props.updateAuthorizationPolicy ??
      (updateAuthorizationPolicyAction as unknown as (input: UpdateAuthorizationPolicyInput) => Promise<UpdateAuthorizationPolicyResult>);
    const result = await update({
      policyCode: NPD_POST_RELEASE_EDIT_POLICY,
      auditReason,
      patch: { min_approvers: this.state.npdMinApprovers },
    });

    if (result.ok) {
      this.setState({ fieldAlert: null, serverBlockers: [], saved: true });
      return;
    }

    const failedResult = result as Extract<UpdateAuthorizationPolicyResult, { ok: false }>;
    this.setState({
      fieldAlert: failedResult.error ?? 'Unable to save policies',
      serverBlockers: failedResult.blockers ?? [],
      saved: false,
    });
  };

  render() {
    const screenState = this.props.screenState ?? 'ready';
    const policies = this.props.policies ?? defaultPolicies;
    const roles = this.props.roles ?? defaultRoles;
    const auditLogHref = this.props.auditLogHref ?? '/en/settings/audit?action=authorization_policy_update';
    const canEditAuthorization = this.props.canEditAuthorization ?? false;

    if (screenState === 'loading') return <LoadingState />;
    if (screenState === 'missing_seed' || !policies.npd || !policies.technical) return <MissingSeedState auditLogHref={auditLogHref} />;

    return (
      <main className="space-y-5 p-6">
        <PageHead auditLogHref={auditLogHref} />

        {!canEditAuthorization || screenState === 'permission_denied' ? (
          <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Read-only: settings.authorization.edit is required to change authorization policies.
          </div>
        ) : null}

        <div data-region="invariant-banner" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          Authorized edits always create a new BOM/product-spec version; in-place mutation is never allowed. Factory-use approval remains locked until Technical signs off.
        </div>

        {this.state.fieldAlert ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-950">
            {this.state.fieldAlert}
            {this.state.serverBlockers.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 font-normal">
                {this.state.serverBlockers.map((blocker) => (
                  <li key={`${blocker.policyCode}-${blocker.code}`}>
                    <CodePill>{blocker.code}</CodePill> {blocker.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {this.state.saved ? <div role="status" className="text-sm text-green-700">Policies saved.</div> : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            region="npd-post-release-policy"
            title="NPD post-release edit authorization"
            description="Authorizes released product/BOM edit requests after NPD release."
            status={policies.npd.status}
          >
            <SRow label="Request permission" hint="Fixed permission string used by workflows.">
              <CodePill>{policies.npd.requestPermission}</CodePill>
            </SRow>
            <SRow label="Authorize permission" hint="Fixed permission string required to approve a request.">
              <CodePill>{policies.npd.authorizePermission}</CodePill>
            </SRow>
            <SRow label="Authorized roles" hint="Roles selected by T-126 policy data.">
              {roleLabels(policies.npd.authorizedRoleCodes, roles)}
            </SRow>
            <SRow label="Minimum authorizers" hint="T-126 validates blockers and segregation of duties on save.">
              <Input
                aria-label="Minimum authorizers"
                className="w-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
                min={1}
                type="number"
                value={this.state.npdMinApprovers}
                disabled={!canEditAuthorization}
                onChange={(event) => this.setState({ npdMinApprovers: Number(event.currentTarget.value) })}
              />
            </SRow>
            <SRow label="Invariant flags">
              <div className="space-y-1 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={policies.npd.requiresNewVersion} readOnly disabled />
                  <span>Requires new version</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={policies.npd.requireSegregationOfDuties} readOnly disabled />
                  <span>Segregation of duties</span>
                </label>
                <div className="text-xs text-slate-500">Version {policies.npd.version}</div>
              </div>
            </SRow>
            <BlockerList blockers={policies.npd.blockers} />
          </Section>

          <Section
            region="technical-approval-policy"
            title="Technical product-spec approval gate"
            description="Blocks production/factory use until Technical approval is recorded."
            status={policies.technical.status}
          >
            <SRow label="Approval permission" hint="Fixed permission string used by the Technical gate.">
              <CodePill>{policies.technical.approvalPermission}</CodePill>
            </SRow>
            <SRow label="Gate rule code" hint="Immutable rule binding from V-SET-44.">
              <CodePill>{policies.technical.approvalGateRuleCode}</CodePill>
            </SRow>
            <SRow label="Approver roles" hint="Roles selected by the authorization policy row.">
              {roleLabels(policies.technical.approverRoleCodes, roles)}
            </SRow>
            <SRow label="Approval thresholds">
              <div className="space-y-1">
                <div>Minimum approvers: {policies.technical.minApprovers}</div>
                <div>Dual sign-off: {policies.technical.requireDualSignOff ? 'Required' : 'Not required'}</div>
                <div className="text-xs text-slate-500">Version {policies.technical.version}</div>
              </div>
            </SRow>
            <SRow label="Factory-use lock">
              <label className="flex items-center gap-2">
                <input
                  aria-label="Block factory-use until approved"
                  type="checkbox"
                  checked={policies.technical.blockFactoryUseUntilApproved}
                  readOnly
                  disabled
                />
                <span>Block factory-use until approved</span>
              </label>
            </SRow>
            <BlockerList blockers={policies.technical.blockers} />
          </Section>
        </div>

        {canEditAuthorization ? (
          <section className="rounded-xl border bg-white p-5 shadow-sm" aria-label="Save authorization policies">
            <label className="block text-sm font-medium text-slate-900" htmlFor="authorization-audit-reason">
              Audit reason
            </label>
            <Input
              id="authorization-audit-reason"
              aria-label="Audit reason"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={this.state.auditReason}
              onChange={(event) => this.setState({ auditReason: event.currentTarget.value })}
              placeholder="Describe why these authorization settings are changing"
              type="text"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" className="btn-ghost" onClick={this.resetEdits}>
                Discard
              </Button>
              <Button type="button" className="btn-primary" onClick={this.savePolicies}>
                Save policies
              </Button>
            </div>
          </section>
        ) : null}
      </main>
    );
  }
}

export { LoadingState };
