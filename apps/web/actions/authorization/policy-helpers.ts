import {
  NPD_POST_RELEASE_EDIT_POLICY,
  TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY,
  type NpdPostReleaseEditBlocker,
  type QueryClient,
  type TechnicalApprovalBlocker,
  runNpdPostReleaseEditPreflight,
  runTechnicalApprovalPreflight,
} from './preflight';

export type AuthorizationDryRunChange = {
  kind: 'feature_flag' | 'import_row';
  flagCode?: string;
  enabled?: boolean;
  policyCode?: string;
};

export type AuthorizationDryRunResult =
  | { ok: true; dryRun: true; blockers: [] }
  | { ok: false; dryRun: true; blockers: Array<NpdPostReleaseEditBlocker | TechnicalApprovalBlocker> };

const DRY_RUN_REQUESTER_USER_ID = '00000000-0000-4000-8000-000000000001';
const DRY_RUN_AUTHORIZER_USER_ID = '00000000-0000-4000-8000-000000000002';

export async function dryRunAuthorizationPolicyChanges(input: {
  client: QueryClient;
  changes: AuthorizationDryRunChange[];
}): Promise<AuthorizationDryRunResult> {
  const policyCodes = new Set<string>();
  for (const change of input.changes) {
    const policyCode = policyCodeForChange(change);
    if (policyCode) policyCodes.add(policyCode);
  }

  const blockers: Array<NpdPostReleaseEditBlocker | TechnicalApprovalBlocker> = [];
  const seenBlockers = new Set<string>();

  for (const policyCode of Array.from(policyCodes)) {
    if (policyCode === NPD_POST_RELEASE_EDIT_POLICY) {
      const result = await runNpdPostReleaseEditPreflight({
        client: input.client,
        requesterUserId: DRY_RUN_REQUESTER_USER_ID,
        authorizerUserId: DRY_RUN_AUTHORIZER_USER_ID,
      });
      if (!result.ok) appendUniqueBlockers(blockers, seenBlockers, result.blockers);
    }

    if (policyCode === TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY) {
      const result = await runTechnicalApprovalPreflight({ client: input.client });
      if (!result.ok) appendUniqueBlockers(blockers, seenBlockers, result.blockers);
    }
  }

  return blockers.length > 0 ? { ok: false, dryRun: true, blockers } : { ok: true, dryRun: true, blockers: [] };
}

function policyCodeForChange(change: AuthorizationDryRunChange): string | null {
  if (change.policyCode) return change.policyCode;
  if (change.flagCode === 'npd.post_release_edit.enabled' && change.enabled === true) return NPD_POST_RELEASE_EDIT_POLICY;
  if (change.flagCode === 'technical.product_spec_approval.required' && change.enabled === true) {
    return TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY;
  }
  return null;
}

function appendUniqueBlockers<T extends { code: string; policyCode: string }>(
  target: T[],
  seen: Set<string>,
  blockers: T[],
): void {
  for (const blocker of blockers) {
    const key = `${blocker.policyCode}:${blocker.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(blocker);
  }
}
