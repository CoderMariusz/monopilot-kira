/**
 * T-079 — Approval stage page (RSC).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/approval
 *
 * Server Component. Reads REAL, org-scoped data via `withOrgContext` (RLS as
 * app_user with app.current_org_id()). No mocks, no hard-coded rows.
 *
 *   - npd_projects               → project code / name / current_gate / product_code
 *   - evaluateApprovalCriteria   → the C1-C7 status read-model (MERGED T-078 Server Action,
 *                                  keyed by product_code; org-scoped). Sensory (C4) is consumed
 *                                  here as a Technical-owned status — this page never reads NPD
 *                                  sensory tables (risk red-line / cross-module contract).
 *   - gate_approvals             → the approval-chain step status for the current gate
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:412-475 (ApprovalScreen)
 *
 * The Submit-for-approval write is owned by T-061 (approveProjectGate) and is
 * imported, never authored here. RBAC (`permission_denied`) is resolved
 * server-side; the Submit affordance is omitted (not render-then-disabled) when
 * the caller lacks npd.gate.approve.
 */

import { getTranslations } from 'next-intl/server';

import {
  ApprovalScreen,
  type ApprovalChainStep,
  type ApprovalCriterionKey,
  type ApprovalCriterionStatus,
  type ApprovalGateCode,
  type ApprovalLabels,
  type ApprovalScreenData,
  type ApproveGateCall,
  type ApproveGateOutcome,
  type PageState,
} from './_components/approval-screen';
import { evaluateApprovalCriteria } from '../../../../../../(npd)/pipeline/[projectId]/approval/_actions/evaluate';
import { approveProjectGate } from '../../../../../../(npd)/pipeline/_actions/approve-project-gate';
import {
  GATE_APPROVE_PERMISSION,
} from '../../../../../../(npd)/pipeline/_actions/_lib/gate-helpers';
import {
  PROJECT_VIEW_PERMISSION,
  hasPermission,
  type OrgContextLike,
} from '../../../../../../(npd)/pipeline/_actions/shared';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type ApprovalPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors costing/page.tsx + nutrition/page.tsx).
  data?: ApprovalScreenData | null;
  canApprove?: boolean;
  state?: PageState;
};

type LoaderResult = { state: PageState; data: ApprovalScreenData | null; canApprove: boolean };
type LoaderStage = LoaderResult & { productCode: string | null };

const DEFAULT_LABELS: ApprovalLabels = {
  title: 'Approval gates',
  subtitle: 'Seven approval criteria for this project',
  countPass: '{count} pass',
  countWarn: '{count} warn',
  countPending: '{count} pending',
  chainTitle: 'Approval chain',
  chainSingle: '(single approver)',
  chainMulti: '(multi-step)',
  submit: 'Submit for approval',
  submitBlocked:
    'Every criterion must pass (or be not-required) before you can e-sign this gate. Resolve the pending/warning rows above using their links, then return here to submit.',
  view: 'View',
  statusPass: 'Pass',
  statusWarn: 'Warning',
  statusPending: 'Pending',
  statusNotRequired: 'Not required',
  c1Name: 'Recipe locked',
  c2Name: 'Nutrition targets met',
  c3Name: 'Cost within target',
  c4Name: 'Sensory ≥ 7.0 overall',
  c5Name: 'Allergens declared',
  c6Name: 'No open high risks',
  c7Name: 'Compliance docs reviewed',
  c1Detail: 'The formulation version is locked.',
  c2Detail: 'NutriScore grade is within the approval spec.',
  c3Detail: 'Target-scenario margin meets the NPD minimum.',
  c4Detail: 'Technical-owned sensory panel status.',
  c5Detail: 'All allergens are audited and declared.',
  c6Detail: 'No open high-severity risks remain.',
  c7Detail: 'All compliance documents are valid.',
  c1Hint: 'Lock the formulation version on the Formulation stage.',
  c2Hint: 'Compute a passing NutriScore (A–C) on the Nutrition stage.',
  c3Hint: 'Reach the target-scenario margin on the Costing stage.',
  c4Hint: 'Sensory sign-off is owned by Technical — no action needed here.',
  c5Hint: 'Open the Allergens screen, then check “Declaration accepted” to satisfy this criterion.',
  c6Hint: 'Close or downgrade every open high-severity risk on the Risks screen.',
  c7Hint: 'Add valid, in-date compliance documents on the Docs screen.',
  fixLink: 'Go fix →',
  stepDone: 'Approved',
  stepCurrent: 'Awaiting',
  stepPending: 'Pending',
  approverPermissionFallback: 'Any user with npd.gate.approve can approve',
  approverNoneConfigured: 'No eligible approver is configured',
  modalTitle: 'Submit for approval',
  modalSubtitle: 'An e-signature is required to submit this gate for approval.',
  fieldPassword: 'Password',
  fieldNotes: 'Approval notes',
  cancel: 'Cancel',
  confirm: 'Confirm submission',
  signing: 'Submitting…',
  modalError: 'Submission failed. Check your password and try again.',
  loading: 'Loading approval criteria…',
  empty: 'No approval criteria yet',
  emptyBody: 'Approval criteria appear once the project reaches the approval gate.',
  error: 'Unable to load the approval criteria.',
  forbidden: 'You do not have permission to view this approval.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof ApprovalLabels>;

function translateLabel(t: (key: string) => string, key: keyof ApprovalLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<ApprovalLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.approvalScreen' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as ApprovalLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  current_gate: string;
  product_code: string | null;
};

type ApprovalRow = {
  decision: 'approved' | 'rejected';
  approver_user_id: string;
  approver_name: string | null;
  esigned_at: string | null;
};

type EligibleApproverRow = {
  count: string;
};

const APPROVAL_GATES: readonly ApprovalGateCode[] = ['G3', 'G4'] as const;

function asApprovalGate(currentGate: string): ApprovalGateCode {
  return (APPROVAL_GATES as readonly string[]).includes(currentGate) ? (currentGate as ApprovalGateCode) : 'G4';
}

const EMPTY_CRITERIA: Record<ApprovalCriterionKey, ApprovalCriterionStatus> = {
  C1: 'pending',
  C2: 'pending',
  C3: 'pending',
  C4: 'pending',
  C5: 'pending',
  C6: 'pending',
  C7: 'pending',
};

/**
 * Per-criterion remediation hrefs (criteria-card §"how to satisfy").
 * - C1/C2/C3 live on this project's stage screens (pipeline-relative).
 * - C5/C6/C7 live on the FA aggregate screens keyed by product_code.
 * - C4 (sensory) is a Technical-owned read-model — no in-app remediation link.
 */
function buildCriterionLinks(
  locale: string,
  projectId: string,
  productCode: string | null,
): Record<string, string> {
  const stage = (segment: string) => `/${locale}/pipeline/${projectId}/${segment}`;
  const links: Record<string, string> = {
    C1: stage('formulation'),
    C2: stage('nutrition'),
    C3: stage('costing'),
  };
  if (productCode) {
    const fa = (segment: string) =>
      `/${locale}/fg/${encodeURIComponent(productCode)}/${segment}`;
    links.C5 = fa('allergens');
    links.C6 = fa('risks');
    links.C7 = fa('docs');
  }
  return links;
}

async function readPageData(projectId: string, locale: string): Promise<LoaderResult> {
  try {
    const stage = await withOrgContext(async (rawCtx): Promise<LoaderStage> => {
      const ctx = rawCtx as OrgContextLike;

      const canRead = await hasPermission(ctx, PROJECT_VIEW_PERMISSION);
      if (!canRead) {
        return { state: 'permission_denied', data: null, canApprove: false, productCode: null };
      }
      const canApprove = await hasPermission(ctx, GATE_APPROVE_PERMISSION);

      const project = await ctx.client.query<ProjectRow>(
        `select id, code, name, current_gate, product_code
           from public.npd_projects
          where id = $1::uuid
            and org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      const projectRow = project.rows[0];
      if (!projectRow) {
        return { state: 'empty', data: null, canApprove, productCode: null };
      }
      if (!projectRow.product_code) {
        // No FA candidate yet (pre-G3) — no criteria to evaluate.
        return { state: 'empty', data: null, canApprove, productCode: null };
      }

      const gateCode = asApprovalGate(projectRow.current_gate);
      const eligibleApprovers = await ctx.client.query<EligibleApproverRow>(
        `select count(distinct ur.user_id)::text as count
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp
             on rp.role_id = r.id
            and rp.permission = $1
          where ur.org_id = app.current_org_id()
            and (
              rp.permission is not null
              or coalesce(r.permissions, '[]'::jsonb) ? $1
              or r.code = any($2::text[])
              or r.slug = any($2::text[])
            )`,
        [GATE_APPROVE_PERMISSION, ['owner', 'admin', 'org_admin']],
      );
      const eligibleApproverCount = Number(eligibleApprovers.rows[0]?.count ?? 0);

      // Approval-chain step status for the current gate (REAL gate_approvals row).
      const approval = await ctx.client.query<ApprovalRow>(
        `select ga.decision,
                ga.approver_user_id::text as approver_user_id,
                coalesce(u.display_name, u.name) as approver_name,
                ga.esigned_at::text as esigned_at
           from public.gate_approvals ga
           left join public.users u on u.id = ga.approver_user_id
          where ga.org_id = app.current_org_id()
            and ga.project_id = $1::uuid
            and ga.gate_code = $2
          order by ga.created_at desc
          limit 1`,
        [projectId, gateCode],
      );
      const latest = approval.rows[0];
      const step: ApprovalChainStep =
        latest?.decision === 'approved'
          ? { who: 'Approver', name: latest.approver_name ?? latest.approver_user_id, status: 'done', when: latest.esigned_at }
          : { who: 'Approver', name: null, status: 'current', when: null };

      return {
        state: 'ready',
        data: {
          projectId: projectRow.id,
          projectCode: projectRow.code,
          projectName: projectRow.name,
          gateCode,
          approvalMode: 'single',
          criteria: EMPTY_CRITERIA,
          steps: [step],
          eligibleApproverCount,
        },
        canApprove,
        productCode: projectRow.product_code,
      };
    });

    if (stage.state !== 'ready' || !stage.data || !stage.productCode) {
      return { state: stage.state, data: stage.data, canApprove: stage.canApprove };
    }

    // The C1-C7 evaluation runs through its own MERGED Server Action (T-078 owns
    // the criteria contract — keyed by the FA product_code, org-scoped via RLS).
    const evaluation = await evaluateApprovalCriteria(stage.productCode);

    if (evaluation.ok) {
      return {
        state: 'ready',
        data: {
          ...stage.data,
          criteria: evaluation.data,
          criterionLinks: buildCriterionLinks(locale, projectId, stage.productCode),
        },
        canApprove: stage.canApprove,
      };
    }
    if (evaluation.error === 'not_found') {
      return { state: 'empty', data: null, canApprove: stage.canApprove };
    }
    // Persistence/validation failure on the evaluator → surface the error state.
    return { state: 'error', data: null, canApprove: stage.canApprove };
  } catch (error) {
    console.error('[approval] org-scoped read failed:', error);
    return { state: 'error', data: null, canApprove: false };
  }
}

/** Server Action adapter passed to the client (T-061 owns approveProjectGate). */
async function approveAction(call: ApproveGateCall): Promise<ApproveGateOutcome> {
  'use server';
  const result = await approveProjectGate(call);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export default async function ApprovalPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as ApprovalPageProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);

  const injected = props.data !== undefined || props.state !== undefined;
  const loaded: LoaderResult = injected
    ? {
        state: props.state ?? (props.data ? 'ready' : 'empty'),
        data: props.data ?? null,
        canApprove: props.canApprove ?? false,
      }
    : await readPageData(projectId, locale);

  return (
    <ApprovalScreen
      state={loaded.state}
      data={loaded.data}
      labels={labels}
      canApprove={props.canApprove ?? loaded.canApprove}
      onApprove={approveAction}
    />
  );
}
