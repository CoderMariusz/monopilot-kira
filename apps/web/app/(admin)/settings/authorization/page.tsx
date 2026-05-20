"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@monopilot/ui/Button";
import Textarea from "@monopilot/ui/Textarea";
import { updateAuthorizationPolicy } from "../../../../actions/authorization/policy-actions";

type PolicyStatus = "enabled" | "misconfigured" | "missing_seed";

type PolicySummary = {
  policyCode: "npd_post_release_edit" | "technical_product_spec_approval";
  title: string;
  status: PolicyStatus;
  version: number;
  requiredPermission: string;
  authorizerRoles: string[];
  requestPermissions?: string[];
  requiresNewVersion?: boolean;
  minApprovers?: number;
  approvalGateRuleCode?: string;
  factoryUseBlockingLocked?: boolean;
  blockers?: Array<{ code: string; message: string }>;
};

type SaveAuthorizationPoliciesInput = {
  auditReason: string;
  policies: PolicySummary[];
};

type SaveAuthorizationPoliciesResult = {
  ok: boolean;
  policies?: PolicySummary[];
  blockers?: Array<{ policyCode?: PolicySummary["policyCode"]; code: string; message: string }>;
};

type AuthorizationPolicyPatch = {
  requires_new_version?: boolean;
  require_segregation_of_duties?: boolean;
  min_approvers?: number;
  approval_gate_rule_code?: string;
  settings_json?: Record<string, unknown>;
};

type AuthorizationPoliciesPageProps = {
  canEdit?: boolean;
  policies?: PolicySummary[];
  auditLogHref?: string;
  onSave?: (input: SaveAuthorizationPoliciesInput) => Promise<SaveAuthorizationPoliciesResult> | SaveAuthorizationPoliciesResult;
};

const defaultPolicies: PolicySummary[] = [
  {
    policyCode: "npd_post_release_edit",
    title: "NPD post-release edit authorization",
    status: "enabled",
    version: 1,
    requiredPermission: "npd.post_release_edit.authorize",
    requestPermissions: ["npd.post_release_edit.request"],
    authorizerRoles: ["NPD Manager", "QA Manager"],
    requiresNewVersion: true,
  },
  {
    policyCode: "technical_product_spec_approval",
    title: "Technical product-spec approval gate",
    status: "enabled",
    version: 1,
    requiredPermission: "technical.product_spec.approve",
    authorizerRoles: ["Technical Approver"],
    minApprovers: 1,
    approvalGateRuleCode: "technical_product_spec_approval_gate_v1",
    factoryUseBlockingLocked: true,
  },
];

function statusLabel(status: PolicyStatus) {
  if (status === "missing_seed") return "Missing seed";
  if (status === "misconfigured") return "Misconfigured";
  return "Enabled";
}

function statusTone(status: PolicyStatus) {
  if (status === "enabled") return "success";
  if (status === "missing_seed") return "warning";
  return "destructive";
}

function hasBlockers(policies: PolicySummary[]) {
  return policies.some((policy) => policy.status !== "enabled" || (policy.blockers?.length ?? 0) > 0);
}

function enforcePolicyInvariants(policy: PolicySummary): PolicySummary {
  if (policy.policyCode === "npd_post_release_edit") {
    return { ...policy, requiresNewVersion: true };
  }

  return {
    ...policy,
    approvalGateRuleCode: policy.approvalGateRuleCode ?? "technical_product_spec_approval_gate_v1",
    factoryUseBlockingLocked: true,
  };
}

function buildPolicyPatch(policy: PolicySummary): AuthorizationPolicyPatch {
  if (policy.policyCode === "npd_post_release_edit") {
    return {
      require_segregation_of_duties: true,
      requires_new_version: true,
    };
  }

  return {
    approval_gate_rule_code: policy.approvalGateRuleCode ?? "technical_product_spec_approval_gate_v1",
    min_approvers: Math.max(1, policy.minApprovers ?? 1),
    require_segregation_of_duties: true,
    settings_json: { factory_use_blocking_locked: true },
  };
}

function mergePolicyBlockers(
  policies: PolicySummary[],
  blockers: Array<{ policyCode?: PolicySummary["policyCode"]; code: string; message: string }>,
): PolicySummary[] {
  return policies.map((policy) => {
    const policyBlockers = blockers.filter((blocker) => !blocker.policyCode || blocker.policyCode === policy.policyCode);
    if (policyBlockers.length < 1) return policy;
    return {
      ...policy,
      status: "misconfigured",
      blockers: policyBlockers.map((blocker) => ({ code: blocker.code, message: blocker.message })),
    };
  });
}

function renderList(items: string[]) {
  return items.length > 0 ? items.join(", ") : "None configured";
}

function Badge({ children, tone = "muted", ariaLabel }: { children: React.ReactNode; tone?: string; ariaLabel?: string }) {
  return (
    <span
      aria-label={ariaLabel}
      data-slot="badge"
      data-tone={tone}
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
    >
      {children}
    </span>
  );
}

function Card({ title, sub, action, children }: { title: string; sub?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section role="region" aria-label={title} data-slot="card" className="rounded-xl border bg-white shadow-sm">
      <div data-slot="card-header" className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {sub ? <div className="mt-1 text-sm text-slate-500">{sub}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div data-slot="card-content" className="divide-y px-5">
        {children}
      </div>
    </section>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[220px_1fr] gap-4 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </div>
      <div className="flex min-w-0 items-center justify-start gap-3 text-sm">{children}</div>
    </div>
  );
}

function InvariantBanner({ children }: { children: React.ReactNode }) {
  return (
    <div data-slot="alert" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
      {children}
    </div>
  );
}

function policyInvariants(policy: PolicySummary) {
  if (policy.policyCode === "npd_post_release_edit") {
    return (
      <>
        <p>Requires a new released version for every approved post-release edit.</p>
        <p>Self-authorization is never allowed.</p>
      </>
    );
  }

  return (
    <>
      <p>technical_product_spec_approval_gate_v1 is visible and locked against edits.</p>
      <p>Factory-use blocking is locked on.</p>
      <p>Self-authorization is never allowed.</p>
    </>
  );
}

export default function AuthorizationPoliciesPage({
  canEdit = false,
  policies = defaultPolicies,
  auditLogHref = "/settings/audit?entity=org_authorization_policies",
  onSave,
}: AuthorizationPoliciesPageProps) {
  const t = useTranslations('settings.authorization');
  const [savedPolicies, setSavedPolicies] = useState<PolicySummary[]>(policies.map(enforcePolicyInvariants));
  const [draftPolicies, setDraftPolicies] = useState<PolicySummary[]>(policies.map(enforcePolicyInvariants));
  const [auditReason, setAuditReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveBlocked = hasBlockers(draftPolicies);

  async function handleSave() {
    if (saveBlocked || isSaving) return;

    const trimmedReason = auditReason.trim();
    if (!trimmedReason) {
      setError("Audit reason is required before saving authorization policies.");
      return;
    }

    const payloadPolicies = draftPolicies.map(enforcePolicyInvariants);

    setIsSaving(true);
    try {
      const result = onSave
        ? await onSave({ auditReason: trimmedReason, policies: payloadPolicies })
        : await savePoliciesWithT126Action(payloadPolicies, trimmedReason);

      if (result?.ok && result.policies) {
        const nextPolicies = result.policies.map(enforcePolicyInvariants);
        setSavedPolicies(nextPolicies);
        setDraftPolicies(nextPolicies);
        setAuditReason("");
        setError(null);
        return;
      }

      if (result?.blockers?.length) {
        setDraftPolicies((current) => mergePolicyBlockers(current, result.blockers ?? []));
        setError(null);
        return;
      }

      setError("Authorization policies could not be saved.");
    } catch {
      setError("Authorization policies could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function savePoliciesWithT126Action(
    payloadPolicies: PolicySummary[],
    trimmedReason: string,
  ): Promise<SaveAuthorizationPoliciesResult> {
    const results = await Promise.all(
      payloadPolicies.map(async (policy) => ({
        policy,
        result: await updateAuthorizationPolicy({
          policyCode: policy.policyCode,
          auditReason: trimmedReason,
          patch: buildPolicyPatch(policy),
        }),
      })),
    );

    const blockers = results.flatMap(({ policy, result }) => {
      if (result.ok === true) return [];
      return [
        {
          policyCode: policy.policyCode,
          code: result.error.toUpperCase(),
          message: `T-126 rejected ${policy.title}: ${result.error.replaceAll("_", " ")}.`,
        },
      ];
    });

    if (blockers.length > 0) return { ok: false, blockers };

    const versionsByPolicy = new Map<string, number>();
    for (const { result } of results) {
      if (result.ok === true) {
        versionsByPolicy.set(result.data.policyCode, result.data.version);
      }
    }
    return {
      ok: true,
      policies: payloadPolicies.map((policy) => ({
        ...policy,
        version: versionsByPolicy.get(policy.policyCode) ?? policy.version,
        blockers: [],
        status: "enabled",
      })),
    };
  }

  function handleDiscard() {
    if (isSaving) return;
    setDraftPolicies(savedPolicies);
    setAuditReason("");
    setError(null);
  }

  return (
    <main aria-labelledby="authorization-policies-heading" className="space-y-5 p-6">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Settings / Authorization</p>
        <h1 id="authorization-policies-heading" className="text-2xl font-semibold">{t('heading')}</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Manage org_authorization_policies for NPD post-release edits and Technical approval gates.
          These summaries expose policy state while server-side T-126 blockers remain authoritative.
        </p>
        <a className="text-sm font-medium text-blue-700" href={auditLogHref}>View audit log</a>
      </header>

      {!canEdit ? (
        <div role="status" aria-label="Read-only authorization policy notice" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Read-only</strong>
          <p>You need settings.authorization.edit to save authorization policy changes.</p>
        </div>
      ) : null}

      <section aria-label="Authorization policy summaries" className="space-y-4">
        {draftPolicies.map((policy) => (
          <Card
            key={policy.policyCode}
            title={policy.title}
            sub={<code className="font-mono text-xs">{policy.policyCode}</code>}
            action={
              <div className="flex flex-col items-end gap-1">
                <Badge tone={statusTone(policy.status)} ariaLabel={statusLabel(policy.status)}>{statusLabel(policy.status)}</Badge>
                <span className="text-xs text-slate-500">Version {policy.version}</span>
              </div>
            }
          >
            <div data-testid="authorization-policy-card" className="contents">
              <SettingRow label="Required authorization permission" hint="Immutable permission string enforced by RBAC and T-126.">
                <code className="font-mono text-xs">{policy.requiredPermission}</code>
              </SettingRow>

              {policy.requestPermissions?.length ? (
                <SettingRow label="Request permissions" hint="Permission strings that can request authorization.">
                  <code className="font-mono text-xs">{renderList(policy.requestPermissions)}</code>
                </SettingRow>
              ) : null}

              <SettingRow label="Authorizer roles" hint="Roles allowed to authorize this policy in the org.">
                <span>{renderList(policy.authorizerRoles)}</span>
              </SettingRow>

              {policy.minApprovers !== undefined ? (
                <SettingRow label="Minimum approvers" hint="Server-side minimum enforced by T-126 helpers.">
                  <Badge tone="muted">{policy.minApprovers}</Badge>
                </SettingRow>
              ) : null}

              {policy.approvalGateRuleCode ? (
                <SettingRow label="Approval gate rule" hint="Rule code is locked for Technical product-spec approval.">
                  <code className="font-mono text-xs">{policy.approvalGateRuleCode}</code>
                </SettingRow>
              ) : null}

              <div aria-label={`${policy.title} invariants`} className="py-3">
                <InvariantBanner>{policyInvariants(policy)}</InvariantBanner>
              </div>

              {policy.blockers?.length ? (
                <div className="py-3">
                  <ul aria-label={`${policy.title} blockers`} className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    {policy.blockers.map((blocker) => (
                      <li key={`${policy.policyCode}-${blocker.code}`}>
                        <strong>{blocker.code}</strong>: {blocker.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Card>
        ))}
      </section>

      {canEdit ? (
        <Card title="Policy changes" sub="Provide an audit reason for all T-126 policy updates.">
          <div className="space-y-3 py-3">
            <label className="text-sm font-medium" htmlFor="authorization-audit-reason">Audit reason</label>
            <Textarea
              className="min-h-24 w-full rounded-md border px-3 py-2 text-sm"
              disabled={isSaving}
              id="authorization-audit-reason"
              name="auditReason"
              onChange={(event) => {
                setAuditReason(event.currentTarget.value);
                if (event.currentTarget.value.trim()) setError(null);
              }}
              value={auditReason}
            />
            {saveBlocked ? (
              <p role="status" className="text-sm text-amber-700">Saving is disabled until server policy blockers are resolved.</p>
            ) : null}
            {isSaving ? <p role="status" aria-live="polite" className="text-sm text-blue-700">Saving authorization policies…</p> : null}
            {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
            <div className="flex gap-2">
              <Button disabled={saveBlocked || isSaving} onClick={handleSave} type="button">
                {isSaving ? "Saving…" : "Save"}
              </Button>
              <Button disabled={isSaving} onClick={handleDiscard} type="button">
                Discard
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </main>
  );
}
