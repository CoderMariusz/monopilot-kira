"use client";

import React, { useState } from 'react';

import {
  NPD_POST_RELEASE_EDIT_POLICY,
  TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE,
  TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY,
} from '../../../../../../actions/authorization/preflight';
import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

export type PolicyStatus = 'Enabled' | 'Disabled' | 'Misconfigured';
export type Blocker = { code: string; policyCode: string; message: string };
export type RoleOption = { code: string; label: string };

export type NpdPolicy = {
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

export type TechnicalPolicy = {
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

export type UpdateAuthorizationPolicyInput = {
  policyCode: NpdPolicy['policyCode'] | TechnicalPolicy['policyCode'];
  patch: Record<string, unknown>;
  auditReason: string;
};

export type UpdateAuthorizationPolicyResult =
  | { ok: true; data?: { policyCode?: string; version?: number } }
  | { ok: false; error?: string; blockers?: Blocker[] };

export type AuthorizationPageProps = {
  screenState?: 'ready' | 'loading' | 'missing_seed' | 'permission_denied' | 'error';
  canEditAuthorization?: boolean;
  roles?: RoleOption[];
  policies?: {
    npd: NpdPolicy | null;
    technical: TechnicalPolicy | null;
  };
  auditLogHref?: string;
  labels: AuthorizationScreenLabels;
  updateAuthorizationPolicy: (input: UpdateAuthorizationPolicyInput) => Promise<UpdateAuthorizationPolicyResult>;
};

export type CopyKey =
  | 'auditLink'
  | 'auditReason'
  | 'auditReasonRequired'
  | 'auditReasonPlaceholder'
  | 'approvalPermission'
  | 'approvalPermissionHint'
  | 'approvalThresholds'
  | 'approverRoles'
  | 'approverRolesHint'
  | 'authorizePermission'
  | 'authorizePermissionHint'
  | 'authorizedRoles'
  | 'authorizedRolesHint'
  | 'blockFactoryUseUntilApproved'
  | 'blockerApprovalPolicyDisabled'
  | 'blockerApproverRoleMissing'
  | 'blockerAuthorizePermissionMissing'
  | 'blockerAuthorizerRoleMissing'
  | 'blockerGateRuleMissing'
  | 'blockerMinApproversInvalid'
  | 'blockerPolicyDisabled'
  | 'blockerRequestPermissionMissing'
  | 'blockerRequiresNewVersionRequired'
  | 'blockerSelfAuthorization'
  | 'blockersTitle'
  | 'discard'
  | 'dualSignOff'
  | 'dualSignOffNotRequired'
  | 'dualSignOffRequired'
  | 'errorBody'
  | 'errorTitle'
  | 'factoryUseLock'
  | 'gateRuleCode'
  | 'gateRuleCodeHint'
  | 'invariantBanner'
  | 'invariantFlags'
  | 'loadingLabel'
  | 'minimumApprovers'
  | 'minimumAuthorizers'
  | 'minimumAuthorizersHint'
  | 'missingSeedBody'
  | 'missingSeedTitle'
  | 'noRoleSelected'
  | 'npdDescription'
  | 'npdTitle'
  | 'pageSubtitle'
  | 'pageTitle'
  | 'policiesSaved'
  | 'policySaveError'
  | 'readOnlyNotice'
  | 'requestPermission'
  | 'requestPermissionHint'
  | 'requiresNewVersion'
  | 'savePolicies'
  | 'saveSectionLabel'
  | 'segregationOfDuties'
  | 'statusDisabled'
  | 'statusEnabled'
  | 'statusMisconfigured'
  | 'technicalDescription'
  | 'technicalTitle'
  | 'version';

export type AuthorizationScreenLabels = Record<CopyKey, string>;

type Copy = (key: CopyKey) => string;

export const defaultRoles: RoleOption[] = [
  { code: 'owner', label: 'owner' },
  { code: 'admin', label: 'admin' },
  { code: 'npd_manager', label: 'npd_manager' },
  { code: 'quality_lead', label: 'quality_lead' },
];

export const defaultPolicies: NonNullable<AuthorizationPageProps['policies']> = {
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

function roleLabels(roleCodes: string[], roles: RoleOption[], copy: Copy) {
  const labelsByCode = new Map(roles.map((role) => [role.code, role.label]));
  return roleCodes.map((code) => labelsByCode.get(code) ?? code).join(', ') || copy('noRoleSelected');
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
  copy,
  children,
}: {
  region: string;
  title: string;
  description?: string;
  status?: PolicyStatus;
  copy: Copy;
  children: React.ReactNode;
}) {
  return (
    <section data-region={region} role="region" aria-label={title} className="card" style={{ margin: 0, padding: 0 }}>
      <div className="card-head" style={{ margin: 0, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <h2 className="card-title">{title}</h2>
          {description ? <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{description}</div> : null}
        </div>
        {status ? <Badge tone={badgeTone(status)}>{statusLabel(status, copy)}</Badge> : null}
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}


function statusLabel(status: PolicyStatus, copy: Copy) {
  if (status === 'Enabled') return copy('statusEnabled');
  if (status === 'Misconfigured') return copy('statusMisconfigured');
  return copy('statusDisabled');
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

function blockerMessage(blocker: Blocker, copy: Copy) {
  const messages: Partial<Record<string, CopyKey>> = {
    approval_policy_disabled: 'blockerApprovalPolicyDisabled',
    approver_role_missing: 'blockerApproverRoleMissing',
    authorize_permission_missing: 'blockerAuthorizePermissionMissing',
    authorizer_role_missing: 'blockerAuthorizerRoleMissing',
    gate_rule_missing: 'blockerGateRuleMissing',
    min_approvers_invalid: 'blockerMinApproversInvalid',
    policy_disabled: 'blockerPolicyDisabled',
    request_permission_missing: 'blockerRequestPermissionMissing',
    requires_new_version_required: 'blockerRequiresNewVersionRequired',
    self_authorization: 'blockerSelfAuthorization',
  };
  const key = messages[blocker.code];
  return key ? copy(key) : blocker.code;
}

function BlockerList({ blockers, copy }: { blockers: Blocker[]; copy: Copy }) {
  if (blockers.length === 0) return null;
  return (
    <div role="alert" className="alert alert-amber m-4 space-y-2">
      <div className="alert-title">{copy('blockersTitle')}</div>
      <ul className="list-disc space-y-1 pl-5">
        {blockers.map((blocker) => (
          <li key={`${blocker.policyCode}-${blocker.code}`}>
            <CodePill>{blocker.code}</CodePill> <span>{blockerMessage(blocker, copy)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LoadingState({ copy }: { copy: Copy }) {
  return (
    <main className="space-y-5 p-6">
      <section data-region="page-head" className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-950">{copy('pageTitle')}</h1>
        <p className="text-sm text-slate-500">{copy('pageSubtitle')}</p>
      </section>
      <div role="status" aria-label={copy('loadingLabel')} aria-busy="true" className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((item) => (
          <div key={item} data-testid="authorization-policy-card-skeleton" className="card h-64 animate-pulse" style={{ margin: 0, background: 'var(--gray-100)' }} />
        ))}
      </div>
    </main>
  );
}

function MissingSeedState({ auditLogHref, copy }: { auditLogHref: string; copy: Copy }) {
  return (
    <main className="space-y-5 p-6">
      <PageHead auditLogHref={auditLogHref} copy={copy} />
      <div role="alert" className="alert alert-red">
        <h2 className="alert-title text-base">{copy('missingSeedTitle')}</h2>
        <p className="mt-1">{copy('missingSeedBody')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CodePill>{NPD_POST_RELEASE_EDIT_POLICY}</CodePill>
          <CodePill>{TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY}</CodePill>
        </div>
      </div>
    </main>
  );
}

function ErrorState({ auditLogHref, copy }: { auditLogHref: string; copy: Copy }) {
  return (
    <main className="space-y-5 p-6">
      <PageHead auditLogHref={auditLogHref} copy={copy} />
      <div role="alert" className="alert alert-red">
        <h2 className="alert-title text-base">{copy('errorTitle')}</h2>
        <p className="mt-1">{copy('errorBody')}</p>
      </div>
    </main>
  );
}

function PageHead({ auditLogHref, copy }: { auditLogHref: string; copy: Copy }) {
  return (
    <section data-region="page-head" className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">{copy('pageTitle')}</h1>
        <p className="text-sm text-slate-500">{copy('pageSubtitle')}</p>
      </div>
      <a data-region="audit-link" className="text-sm font-medium text-blue-600" href={auditLogHref}>
        {copy('auditLink')}
      </a>
    </section>
  );
}

export default function AuthorizationPoliciesScreen(pageProps: AuthorizationPageProps) {
  const screenState = pageProps.screenState ?? 'ready';
  const canEditAuthorization = pageProps.canEditAuthorization ?? false;
  const roles = pageProps.roles ?? defaultRoles;
  const policies = pageProps.policies ?? defaultPolicies;
  const auditLogHref = pageProps.auditLogHref ?? '/en/settings/audit?action=authorization_policy_update';
  const updateAuthorizationPolicy = pageProps.updateAuthorizationPolicy;
  const copy: Copy = (key) => pageProps.labels[key];
  const [auditReason, setAuditReason] = useState('');
  const [npdMinApprovers, setNpdMinApprovers] = useState(policies?.npd?.minApprovers ?? defaultPolicies.npd!.minApprovers);
  const [technicalMinApprovers, setTechnicalMinApprovers] = useState(
    policies?.technical?.minApprovers ?? defaultPolicies.technical!.minApprovers,
  );
  const [technicalDualSignOff, setTechnicalDualSignOff] = useState(
    policies?.technical?.requireDualSignOff ?? defaultPolicies.technical!.requireDualSignOff,
  );
  const [fieldAlert, setFieldAlert] = useState<string | null>(null);
  const [serverBlockers, setServerBlockers] = useState<Blocker[]>([]);
  const [saved, setSaved] = useState(false);
  const mayEdit = canEditAuthorization && screenState !== 'permission_denied';

  const resetEdits = () => {
    setAuditReason('');
    setNpdMinApprovers(policies?.npd?.minApprovers ?? defaultPolicies.npd!.minApprovers);
    setTechnicalMinApprovers(policies?.technical?.minApprovers ?? defaultPolicies.technical!.minApprovers);
    setTechnicalDualSignOff(policies?.technical?.requireDualSignOff ?? defaultPolicies.technical!.requireDualSignOff);
    setFieldAlert(null);
    setServerBlockers([]);
    setSaved(false);
  };

  const savePolicies = async () => {
    const trimmedReason = auditReason.trim();
    if (!trimmedReason) {
      setFieldAlert(copy('auditReasonRequired'));
      setServerBlockers([]);
      setSaved(false);
      return;
    }

    if (technicalDualSignOff && technicalMinApprovers < 2) {
      setFieldAlert(copy('policySaveError'));
      setServerBlockers([
        {
          code: 'min_approvers_invalid',
          policyCode: TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY,
          message: copy('blockerMinApproversInvalid'),
        },
      ]);
      setSaved(false);
      return;
    }

    const npdResult = await updateAuthorizationPolicy({
      policyCode: NPD_POST_RELEASE_EDIT_POLICY,
      auditReason: trimmedReason,
      patch: { min_approvers: npdMinApprovers },
    });

    if (!npdResult.ok) {
      const failedResult = npdResult as Extract<UpdateAuthorizationPolicyResult, { ok: false }>;
      setFieldAlert(copy('policySaveError'));
      setServerBlockers(failedResult.blockers ?? []);
      setSaved(false);
      return;
    }

    const technicalResult = await updateAuthorizationPolicy({
      policyCode: TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY,
      auditReason: trimmedReason,
      patch: {
        min_approvers: technicalMinApprovers,
        settings_json: { require_dual_sign_off: technicalDualSignOff },
      },
    });

    if (technicalResult.ok) {
      setFieldAlert(null);
      setServerBlockers([]);
      setSaved(true);
      return;
    }

    const failedTechnical = technicalResult as Extract<UpdateAuthorizationPolicyResult, { ok: false }>;
    setFieldAlert(copy('policySaveError'));
    setServerBlockers(failedTechnical.blockers ?? []);
    setSaved(false);
  };

  if (screenState === 'loading') return <LoadingState copy={copy} />;
  if (screenState === 'error') return <ErrorState auditLogHref={auditLogHref} copy={copy} />;
  if (screenState === 'missing_seed' || !policies.npd || !policies.technical) return <MissingSeedState auditLogHref={auditLogHref} copy={copy} />;

  return (
    <main className="space-y-5 p-6">
      <PageHead auditLogHref={auditLogHref} copy={copy} />

      {!mayEdit ? (
        <div role="note" className="alert alert-amber">
          {copy('readOnlyNotice')}
        </div>
      ) : null}

      <div data-region="invariant-banner" className="alert alert-blue">
        {copy('invariantBanner')}
      </div>

      {fieldAlert ? (
        <div role="alert" className="alert alert-red font-medium">
          {fieldAlert}
          {serverBlockers.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 font-normal">
              {serverBlockers.map((blocker) => (
                <li key={`${blocker.policyCode}-${blocker.code}`}>
                  <CodePill>{blocker.code}</CodePill> {blockerMessage(blocker, copy)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {saved ? (
        <div role="status" className="text-sm text-green-700">
          {copy('policiesSaved')}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          region="npd-post-release-policy"
          title={copy('npdTitle')}
          description={copy('npdDescription')}
          status={policies.npd.status}
          copy={copy}
        >
          <SRow label={copy('requestPermission')} hint={copy('requestPermissionHint')}>
            <CodePill>{policies.npd.requestPermission}</CodePill>
          </SRow>
          <SRow label={copy('authorizePermission')} hint={copy('authorizePermissionHint')}>
            <CodePill>{policies.npd.authorizePermission}</CodePill>
          </SRow>
          <SRow label={copy('authorizedRoles')} hint={copy('authorizedRolesHint')}>
            {roleLabels(policies.npd.authorizedRoleCodes, roles, copy)}
          </SRow>
          <SRow label={copy('minimumAuthorizers')} hint={copy('minimumAuthorizersHint')}>
            <Input
              aria-label={copy('minimumAuthorizers')}
              className="form-input w-20"
              min={1}
              type="number"
              value={npdMinApprovers}
              disabled={!mayEdit}
              onChange={(event) => setNpdMinApprovers(Number(event.currentTarget.value))}
            />
          </SRow>
          <SRow label={copy('invariantFlags')}>
            <div className="space-y-1 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={policies.npd.requiresNewVersion} readOnly disabled />
                <span>{copy('requiresNewVersion')}</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={policies.npd.requireSegregationOfDuties} readOnly disabled />
                <span>{copy('segregationOfDuties')}</span>
              </label>
              <div className="text-xs text-slate-500">
                {copy('version')} {policies.npd.version}
              </div>
            </div>
          </SRow>
          <BlockerList blockers={policies.npd.blockers} copy={copy} />
        </Section>

        <Section
          region="technical-approval-policy"
          title={copy('technicalTitle')}
          description={copy('technicalDescription')}
          status={policies.technical.status}
          copy={copy}
        >
          <SRow label={copy('approvalPermission')} hint={copy('approvalPermissionHint')}>
            <CodePill>{policies.technical.approvalPermission}</CodePill>
          </SRow>
          <SRow label={copy('gateRuleCode')} hint={copy('gateRuleCodeHint')}>
            <CodePill>{policies.technical.approvalGateRuleCode}</CodePill>
          </SRow>
          <SRow label={copy('approverRoles')} hint={copy('approverRolesHint')}>
            {roleLabels(policies.technical.approverRoleCodes, roles, copy)}
          </SRow>
          <SRow label={copy('approvalThresholds')}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span>{copy('minimumApprovers')}</span>
                <Input
                  aria-label={copy('minimumApprovers')}
                  className="form-input w-20"
                  min={1}
                  type="number"
                  value={technicalMinApprovers}
                  disabled={!mayEdit}
                  onChange={(event) => setTechnicalMinApprovers(Number(event.currentTarget.value))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  aria-label={copy('dualSignOff')}
                  type="checkbox"
                  checked={technicalDualSignOff}
                  disabled={!mayEdit}
                  onChange={(event) => setTechnicalDualSignOff(event.currentTarget.checked)}
                />
                <span>
                  {copy('dualSignOff')}: {technicalDualSignOff ? copy('dualSignOffRequired') : copy('dualSignOffNotRequired')}
                </span>
              </label>
              <div className="text-xs text-slate-500">
                {copy('version')} {policies.technical.version}
              </div>
            </div>
          </SRow>
          <SRow label={copy('factoryUseLock')}>
            <label className="flex items-center gap-2">
              <input
                aria-label={copy('blockFactoryUseUntilApproved')}
                type="checkbox"
                checked={policies.technical.blockFactoryUseUntilApproved}
                readOnly
                disabled
              />
              <span>{copy('blockFactoryUseUntilApproved')}</span>
            </label>
          </SRow>
          <BlockerList blockers={policies.technical.blockers} copy={copy} />
        </Section>
      </div>

      {mayEdit ? (
        <section className="card" style={{ margin: 0, padding: 16 }} aria-label={copy('saveSectionLabel')}>
          <label className="block text-sm font-medium text-slate-900" htmlFor="authorization-audit-reason">
            {copy('auditReason')}
          </label>
          <Input
            id="authorization-audit-reason"
            aria-label={copy('auditReason')}
            className="form-input mt-2 w-full"
            value={auditReason}
            onChange={(event) => setAuditReason(event.currentTarget.value)}
            placeholder={copy('auditReasonPlaceholder')}
            type="text"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" className="btn-ghost" onClick={resetEdits}>
              {copy('discard')}
            </Button>
            <Button type="button" className="btn-primary" onClick={savePolicies}>
              {copy('savePolicies')}
            </Button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

export { LoadingState };
