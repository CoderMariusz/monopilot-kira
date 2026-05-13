"use client";

import { useState } from "react";

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
  blockers?: Array<{ code: string; message: string }>;
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

function renderList(items: string[]) {
  return items.length > 0 ? items.join(", ") : "None configured";
}

export default function AuthorizationPoliciesPage({
  canEdit = false,
  policies = defaultPolicies,
  auditLogHref = "/settings/audit?entity=org_authorization_policies",
  onSave,
}: AuthorizationPoliciesPageProps) {
  const [savedPolicies, setSavedPolicies] = useState<PolicySummary[]>(policies.map(enforcePolicyInvariants));
  const [draftPolicies, setDraftPolicies] = useState<PolicySummary[]>(policies.map(enforcePolicyInvariants));
  const [auditReason, setAuditReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const saveBlocked = hasBlockers(draftPolicies);

  async function handleSave() {
    if (saveBlocked) return;

    const trimmedReason = auditReason.trim();
    if (!trimmedReason) {
      setError("Audit reason is required before saving authorization policies.");
      return;
    }

    if (!onSave) {
      setError("Save action is unavailable for authorization policies.");
      return;
    }

    const payloadPolicies = draftPolicies.map(enforcePolicyInvariants);

    try {
      const result = await onSave({ auditReason: trimmedReason, policies: payloadPolicies });

      if (result?.ok && result.policies) {
        const nextPolicies = result.policies.map(enforcePolicyInvariants);
        setSavedPolicies(nextPolicies);
        setDraftPolicies(nextPolicies);
        setAuditReason("");
        setError(null);
        return;
      }

      if (result?.blockers?.length) {
        setError(result.blockers.map((blocker) => `${blocker.code}: ${blocker.message}`).join(" "));
        return;
      }

      setError("Authorization policies could not be saved.");
    } catch {
      setError("Authorization policies could not be saved.");
    }
  }

  function handleDiscard() {
    setDraftPolicies(savedPolicies);
    setAuditReason("");
    setError(null);
  }

  return (
    <main aria-labelledby="authorization-policies-heading" style={{ display: "grid", gap: 24 }}>
      <header>
        <p>Settings / Authorization</p>
        <h1 id="authorization-policies-heading">Authorization Policies</h1>
        <p>
          Manage org_authorization_policies for NPD post-release edits and Technical approval gates.
          These summaries expose policy state while server-side T-126 blockers remain authoritative.
        </p>
        <a href={auditLogHref}>View audit log</a>
      </header>

      {!canEdit ? (
        <section aria-label="Read-only authorization policy notice">
          <strong>Read-only</strong>
          <p>You need settings.authorization.edit to save authorization policy changes.</p>
        </section>
      ) : null}

      <section aria-label="Authorization policy summaries" style={{ display: "grid", gap: 16 }}>
        {draftPolicies.map((policy) => (
          <article
            aria-label={policy.title}
            data-testid="authorization-policy-card"
            key={policy.policyCode}
            role="region"
            style={{ border: "1px solid #d4d4d8", borderRadius: 12, padding: 16 }}
          >
            <header>
              <h2>{policy.title}</h2>
              <p>
                <code>{policy.policyCode}</code>
              </p>
              <span aria-label={statusLabel(policy.status)}>{statusLabel(policy.status)}</span>
              <p>Version {policy.version}</p>
            </header>

            <dl>
              <dt>Required authorization permission</dt>
              <dd>{policy.requiredPermission}</dd>

              {policy.requestPermissions?.length ? (
                <>
                  <dt>Request permissions</dt>
                  <dd>{renderList(policy.requestPermissions)}</dd>
                </>
              ) : null}

              <dt>Authorizer roles</dt>
              <dd>{renderList(policy.authorizerRoles)}</dd>

              {policy.minApprovers !== undefined ? (
                <>
                  <dt>Minimum approvers</dt>
                  <dd>{policy.minApprovers}</dd>
                </>
              ) : null}

              {policy.approvalGateRuleCode ? (
                <>
                  <dt>Approval gate rule</dt>
                  <dd>
                    <code>{policy.approvalGateRuleCode}</code>
                  </dd>
                </>
              ) : null}
            </dl>

            <div aria-label={`${policy.title} invariants`}>
              {policy.policyCode === "npd_post_release_edit" ? (
                <>
                  <p>Requires a new released version for every approved post-release edit.</p>
                  <p>Self-authorization is never allowed.</p>
                </>
              ) : null}

              {policy.policyCode === "technical_product_spec_approval" ? (
                <>
                  <p>technical_product_spec_approval_gate_v1 is visible and locked against edits.</p>
                  <p>Factory-use blocking is locked on.</p>
                  <p>Self-authorization is never allowed.</p>
                </>
              ) : null}
            </div>

            {policy.blockers?.length ? (
              <ul aria-label={`${policy.title} blockers`}>
                {policy.blockers.map((blocker) => (
                  <li key={`${policy.policyCode}-${blocker.code}`}>
                    <strong>{blocker.code}</strong>: {blocker.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </section>

      {canEdit ? (
        <section aria-label="Save authorization policies" style={{ display: "grid", gap: 8 }}>
          <label htmlFor="authorization-audit-reason">Audit reason</label>
          <textarea
            id="authorization-audit-reason"
            name="auditReason"
            onChange={(event) => {
              setAuditReason(event.currentTarget.value);
              if (event.currentTarget.value.trim()) setError(null);
            }}
            value={auditReason}
          />
          {saveBlocked ? (
            <p role="status">Saving is disabled until server policy blockers are resolved.</p>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          <div>
            <button disabled={saveBlocked} onClick={handleSave} type="button">
              Save
            </button>
            <button onClick={handleDiscard} type="button">
              Discard
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
