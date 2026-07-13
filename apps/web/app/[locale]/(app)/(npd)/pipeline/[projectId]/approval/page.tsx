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

import { evaluateNpdValidation } from '@monopilot/validation';
import { getTranslations } from 'next-intl/server';

import {
  ValidationStatusPanel,
  type ValidationRule,
} from '../../../../../../../components/npd/validation-status-panel';
import { loadFgCodeMask } from '../../../../../../(npd)/fa/actions/create-fa';
import { codeMaskToLenientRegExp } from '../../../../../../../lib/documents/code-mask';
import {
  ComplianceDocsScreen,
  type ComplianceDocRow,
  type ComplianceDocsLabels,
  type DocType,
  type PageState as CompliancePageState,
} from '../../../../../../(npd)/fa/[productCode]/docs/_components/compliance-docs-screen';
import { getSignedUrl } from '../../../../../../(npd)/fa/[productCode]/docs/_actions/get-signed-url';
import { listDocs } from '../../../../../../(npd)/fa/[productCode]/docs/_actions/list-docs';
import { listRisks } from '../../../../../../(npd)/fa/[productCode]/risks/_actions/list-risks';
import { createApprovalMountActions } from './_actions/approval-mount-actions';
import {
  AllergenCascadeSection,
  buildAllergenLabels,
  loadAllergenCascade,
  type AllergenCascadeData,
  type AllergenLoad,
  type WidgetState as AllergenWidgetState,
} from '../../../../../../(npd)/fa/[productCode]/_lib/allergen-cascade';
import {
  RiskRegisterScreen,
  type PageState as RiskPageState,
  type RiskRegisterLabels,
  type RiskRow,
} from '../../../../../../(npd)/fa/[productCode]/risks/_components/risk-register-screen';
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
import { hasPermission as hasAuthPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type ApprovalPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors costing/page.tsx + nutrition/page.tsx).
  data?: ApprovalScreenData | null;
  canApprove?: boolean;
  state?: PageState;
  productCode?: string | null;
  complianceRows?: ComplianceDocRow[];
  complianceState?: CompliancePageState;
  complianceCanWrite?: boolean;
  riskRows?: RiskRow[];
  riskState?: RiskPageState;
  riskCanWrite?: boolean;
  allergenData?: AllergenCascadeData | null;
  allergenState?: AllergenWidgetState;
  allergenCanWrite?: boolean;
  allergenCanAcceptDeclaration?: boolean;
  validationRules?: ValidationRule[];
  validationTitle?: string;
  validationVisible?: boolean;
};

type LoaderResult = {
  state: PageState;
  data: ApprovalScreenData | null;
  canApprove: boolean;
  productCode?: string | null;
};
type LoaderStage = LoaderResult & { productCode: string | null };

const RISK_WRITE_PERMISSION = 'npd.risk.write';

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
 * - C5/C6/C7 live on in-page Approval sections keyed by product_code (C4 wave).
 * - C4 (sensory) is a Technical-owned read-model — no in-app remediation link.
 */
export function buildCriterionLinks(
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
    const approvalBase = stage('approval');
    links.C5 = `${approvalBase}#approval-allergens`;
    links.C6 = `${approvalBase}#approval-risks`;
    links.C7 = `${approvalBase}#approval-compliance`;
  }
  return links;
}

const COMPLIANCE_DEFAULT_LABELS: ComplianceDocsLabels = {
  title: 'Compliance documents',
  subtitle: 'Read-only attachments tied to this Finished Good.',
  upload: '+ Upload document',
  colType: 'Type',
  colTitle: 'Title',
  colVersion: 'Version',
  colUploaded: 'Uploaded',
  colExpires: 'Expires',
  colStatus: 'Status',
  colActions: 'Actions',
  download: 'Download',
  delete: 'Delete',
  noExpiry: 'No expiry',
  statusValid: 'Valid',
  statusExpiring: 'Expiring',
  statusExpired: 'Expired',
  loading: 'Loading compliance documents…',
  empty: 'No compliance documents yet',
  emptyBody:
    'Upload the compliance artefacts tied to this FA (specs, certificates, CoA). PDF, XLSX, DOCX up to 20 MB.',
  error: 'Unable to load compliance documents. Try again after the backend is available.',
  forbidden: 'You do not have permission to view compliance documents for this FA.',
  fileTypesNote:
    'File types: PDF, XLSX, DOCX. Max 20 MB per upload. Documents nearing expiry are flagged automatically.',
  approvalC7Note:
    'Approval criterion C7 requires at least one valid, in-date compliance document; any expired or invalid document blocks gate submission.',
  backToApproval: 'Back to Approval',
  docTypeCoA: 'CoA',
  docTypeSDS: 'SDS',
  docTypeSpec: 'Spec',
  docTypeCert: 'Certificate',
  docTypeOther: 'Other',
  modalTitle: 'Upload compliance document',
  modalSubtitle: 'FG {code}',
  fieldDocType: 'Document type',
  fieldTitle: 'Title',
  fieldTitleHint: 'A short human-readable name (3–300 characters).',
  fieldFile: 'File',
  fieldFileHint: 'PDF, XLSX, DOCX · max 20 MB',
  fieldExpires: 'Expiry date',
  fieldExpiresHint: 'Optional. Documents are flagged 30 days before this date.',
  cancel: 'Cancel',
  uploadAction: 'Upload',
  errorTitleRequired: 'Title must be at least 3 characters.',
  errorTitleTooLong: 'Title must be at most 300 characters.',
  errorFileRequired: 'A file is required.',
  errorFileTooLarge: 'File exceeds the 20 MB limit.',
  errorFileType: 'Unsupported file type. Use PDF, XLSX or DOCX.',
  errorUpload: 'Upload failed. Please try again.',
};

const COMPLIANCE_LABEL_KEYS = Object.keys(COMPLIANCE_DEFAULT_LABELS) as Array<keyof ComplianceDocsLabels>;

function translateComplianceLabel(
  t: (key: string) => string,
  key: keyof ComplianceDocsLabels,
): string {
  try {
    const value = t(key);
    return value === key ? COMPLIANCE_DEFAULT_LABELS[key] : value;
  } catch {
    return COMPLIANCE_DEFAULT_LABELS[key];
  }
}

async function buildComplianceLabels(locale: string): Promise<ComplianceDocsLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.compliance' });
    return COMPLIANCE_LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateComplianceLabel(t, key);
      return labels;
    }, {} as ComplianceDocsLabels);
  } catch {
    return { ...COMPLIANCE_DEFAULT_LABELS };
  }
}

type ComplianceLoaderResult = {
  state: CompliancePageState;
  rows: ComplianceDocRow[];
  canWrite: boolean;
};

async function readComplianceSection(productCode: string): Promise<ComplianceLoaderResult> {
  try {
    const result = await listDocs({ productCode });
    if (!result.ok) {
      const state: CompliancePageState = result.code === 'FORBIDDEN' ? 'permission_denied' : 'error';
      return { state, rows: [], canWrite: false };
    }
    const rows: ComplianceDocRow[] = result.docs.map((doc) => ({
      id: doc.id,
      productCode: doc.productCode,
      docType: doc.docType as DocType,
      title: doc.title,
      versionNumber: doc.versionNumber,
      uploadedAt: doc.uploadedAt,
      expiresAt: doc.expiresAt,
    }));
    return { state: rows.length === 0 ? 'empty' : 'ready', rows, canWrite: true };
  } catch (error) {
    console.error('[approval-compliance] org-scoped read failed:', error);
    return { state: 'error', rows: [], canWrite: false };
  }
}

const RISK_DEFAULT_LABELS: RiskRegisterLabels = {
  title: 'Risk register',
  subtitle: 'Score = Likelihood × Impact (1=Low, 2=Med, 3=High).',
  addRisk: '+ Add risk',
  filterState: 'State',
  filterBucket: 'Severity',
  clearFilters: 'Clear filters',
  stateAll: 'All states',
  bucketAll: 'All severities',
  colScore: 'Score',
  colDescription: 'Description',
  colLikelihood: 'Likelihood',
  colImpact: 'Impact',
  colStatus: 'Status',
  colOwner: 'Owner',
  colMitigation: 'Mitigation',
  colActions: 'Actions',
  edit: 'Edit',
  bucketHigh: 'High',
  bucketMed: 'Med',
  bucketLow: 'Low',
  stateOpen: 'Open',
  stateMitigated: 'Mitigated',
  stateClosed: 'Closed',
  builtBlocked: 'Built blocked',
  builtBlockedBody: 'An open High-severity risk blocks this FA from being built. Mitigate or close it first.',
  loading: 'Loading risks…',
  empty: 'No risks logged yet',
  emptyBody:
    'Track risks to launch: likelihood × impact. Add a risk to capture mitigation owner and status.',
  error: 'Unable to load risks. Try again after the backend is available.',
  forbidden: 'You do not have permission to view risks for this FA.',
  modalTitleAdd: 'Add risk',
  modalTitleEdit: 'Edit risk',
  fieldDescription: 'Description',
  fieldDescriptionHint: 'Max 300 chars. Describe the risk and business impact.',
  fieldLikelihood: 'Likelihood',
  fieldImpact: 'Impact',
  fieldMitigation: 'Mitigation plan',
  fieldMitigationHint: 'Max 500 chars.',
  fieldOwner: 'Owner',
  fieldStatus: 'Status',
  fieldReason: 'Reason',
  fieldReasonHint: 'Required for lifecycle changes — min 10 chars.',
  scoreLabel: 'Risk score',
  likelihoodLow: 'Low (1)',
  likelihoodMed: 'Med (2)',
  likelihoodHigh: 'High (3)',
  impactLow: 'Low (1)',
  impactMed: 'Med (2)',
  impactHigh: 'High (3)',
  cancel: 'Cancel',
  save: 'Save',
  create: 'Add risk',
  mitigate: 'Mitigate',
  close: 'Close',
  reopen: 'Reopen',
  errorRequired: 'Description is required.',
  errorTooLong: 'Too long.',
  errorReasonShort: 'Reason must be at least 10 characters.',
};

const RISK_LABEL_KEYS = Object.keys(RISK_DEFAULT_LABELS) as Array<keyof RiskRegisterLabels>;

function translateRiskLabel(t: (key: string) => string, key: keyof RiskRegisterLabels): string {
  try {
    const value = t(key);
    return value === key ? RISK_DEFAULT_LABELS[key] : value;
  } catch {
    return RISK_DEFAULT_LABELS[key];
  }
}

async function buildRiskLabels(locale: string): Promise<RiskRegisterLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.risks' });
    return RISK_LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateRiskLabel(t, key);
      return labels;
    }, {} as RiskRegisterLabels);
  } catch {
    return { ...RISK_DEFAULT_LABELS };
  }
}

type RiskLoaderResult = { state: RiskPageState; rows: RiskRow[] };

async function resolveRiskCanWrite(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) =>
      hasAuthPermission(rawCtx as OrgContextLike, RISK_WRITE_PERMISSION),
    );
  } catch {
    return false;
  }
}

const DEFAULT_VALIDATION_RULE_TITLES: Record<string, string> = {
  V01: 'FG Code format',
  V02: 'Product Name required',
  V03: 'Pack Size in reference',
  V04: 'D365 material codes',
  V05: 'Dept required fields',
  V06: 'PR Code suffix',
  V07: 'Allergen declaration',
  V08: 'Brief mapping',
};

const DEFAULT_VALIDATION_SECTION_TITLE = 'Validation status';

type ValidationLabels = {
  title: string;
  rules: Record<string, string>;
  errorNotice: string;
};

const DEFAULT_VALIDATION_ERROR_NOTICE = 'Validation could not be loaded right now. Try refreshing.';

async function buildValidationLabels(locale: string): Promise<ValidationLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.faRightPanel' });
    const pick = (key: string, fallback: string) => {
      try {
        const value = t(key);
        return value === key ? fallback : value;
      } catch {
        return fallback;
      }
    };
    return {
      title: pick('validationTitle', DEFAULT_VALIDATION_SECTION_TITLE),
      rules: {
        V01: pick('validationRules.V01', DEFAULT_VALIDATION_RULE_TITLES.V01),
        V02: pick('validationRules.V02', DEFAULT_VALIDATION_RULE_TITLES.V02),
        V03: pick('validationRules.V03', DEFAULT_VALIDATION_RULE_TITLES.V03),
        V04: pick('validationRules.V04', DEFAULT_VALIDATION_RULE_TITLES.V04),
        V05: pick('validationRules.V05', DEFAULT_VALIDATION_RULE_TITLES.V05),
        V06: pick('validationRules.V06', DEFAULT_VALIDATION_RULE_TITLES.V06),
        V07: pick('validationRules.V07', DEFAULT_VALIDATION_RULE_TITLES.V07),
        V08: pick('validationRules.V08', DEFAULT_VALIDATION_RULE_TITLES.V08),
      },
      errorNotice: pick('validationErrorNotice', DEFAULT_VALIDATION_ERROR_NOTICE),
    };
  } catch {
    return {
      title: DEFAULT_VALIDATION_SECTION_TITLE,
      rules: { ...DEFAULT_VALIDATION_RULE_TITLES },
      errorNotice: DEFAULT_VALIDATION_ERROR_NOTICE,
    };
  }
}

type ValidationLoaderResult = {
  visible: boolean;
  title: string;
  rules: ValidationRule[];
  /** true when the loader THREW (vs. simply no product row) — render an explicit
   *  "validation unavailable" notice instead of silently hiding the panel. */
  error?: boolean;
  /** localized notice text, carried on the result so the render (which has no
   *  access to the labels) can show it in the error state. */
  errorNotice?: string;
};

type ValidationOrgContext = OrgContextLike & {
  client: {
    query<T = Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<{ rows: T[] }>;
  };
};

function strField(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

async function readPackSizes(ctx: ValidationOrgContext): Promise<string[]> {
  try {
    const { rows } = await ctx.client.query<{ value: string | null }>(
      `select value
         from "Reference"."PackSizes"
        where org_id = app.current_org_id()`,
    );
    return rows.map((r) => strField(r.value)).filter((v) => v !== '');
  } catch {
    return [];
  }
}

async function readValidationSection(
  productCode: string,
  labels: ValidationLabels,
): Promise<ValidationLoaderResult> {
  const hidden: ValidationLoaderResult = { visible: false, title: labels.title, rules: [] };
  try {
    return await withOrgContext(async (rawCtx): Promise<ValidationLoaderResult> => {
      const ctx = rawCtx as ValidationOrgContext;
      const { rows } = await ctx.client.query<Record<string, unknown>>(
        `select to_jsonb(p.*) as product_json
           from public.product p
          where p.product_code = $1
            and p.deleted_at is null
          limit 1`,
        [productCode],
      );
      const raw = rows[0];
      if (!raw) return hidden;

      const productRow =
        (raw.product_json as Record<string, unknown> | undefined) ?? raw;
      if (!productRow || Object.keys(productRow).length === 0) return hidden;

      const packSizes = await readPackSizes(ctx);
      const fgMask = await loadFgCodeMask(ctx);
      // Distinguish "no mask configured" (null → evaluator's lenient non-empty V01)
      // from an EMPTY mask string ('' → compiles to /^$/ so no code passes, flagging
      // the misconfiguration) — a `fgMask ? …` truthy check would collapse '' to null
      // and wrongly pass every code through V01.
      const codeMaskRegExp = fgMask == null ? null : codeMaskToLenientRegExp(fgMask);
      const rules = (await evaluateNpdValidation(ctx.client, {
        orgId: ctx.orgId,
        productRow,
        packSizes,
        codeMaskRegExp,
        titles: labels.rules,
      })) as ValidationRule[];

      return { visible: true, title: labels.title, rules };
    });
  } catch (error) {
    // A THROWN loader error (DB/RLS/permission) surfaces an explicit error state
    // rather than silently hiding validation — the approver must know it couldn't
    // load, not mistake absence for "all good". (A missing product row stays hidden.)
    console.error('[approval-validation] org-scoped read failed:', error);
    return { visible: true, error: true, title: labels.title, rules: [], errorNotice: labels.errorNotice };
  }
}

async function readRiskSection(productCode: string): Promise<RiskLoaderResult> {
  try {
    const result = await listRisks({ productCode });
    if (!result.ok) {
      return { state: 'error', rows: [] };
    }
    const rows: RiskRow[] = result.risks.map((risk) => ({
      id: risk.id,
      productCode: risk.product_code,
      title: risk.title,
      description: risk.description,
      likelihood: risk.likelihood,
      impact: risk.impact,
      score: risk.score,
      bucket: risk.bucket,
      state: risk.state,
      mitigation: risk.mitigation,
      owner: risk.owner_user_id,
    }));
    return { state: rows.length === 0 ? 'empty' : 'ready', rows };
  } catch (error) {
    console.error('[approval-risks] org-scoped read failed:', error);
    return { state: 'error', rows: [] };
  }
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
      return {
        state: stage.state,
        data: stage.data,
        canApprove: stage.canApprove,
        productCode: stage.productCode,
      };
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
        productCode: stage.productCode,
      };
    }
    if (evaluation.error === 'not_found') {
      return { state: 'empty', data: null, canApprove: stage.canApprove, productCode: null };
    }
    // Persistence/validation failure on the evaluator → surface the error state.
    return { state: 'error', data: null, canApprove: stage.canApprove, productCode: null };
  } catch (error) {
    console.error('[approval] org-scoped read failed:', error);
    return { state: 'error', data: null, canApprove: false, productCode: null };
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
        productCode: props.productCode ?? null,
      }
    : await readPageData(projectId, locale);

  const productCode = props.productCode ?? loaded.productCode ?? null;

  const showMountSections = loaded.state === 'ready' && Boolean(productCode);

  const [
    complianceLabels,
    riskLabels,
    allergenLabels,
    validationLoaded,
    complianceLoaded,
    riskLoaded,
    allergenLoaded,
    riskCanWrite,
  ] =
    showMountSections && productCode
      ? await loadApprovalMountSections({
          locale,
          productCode,
          props,
          injected,
        })
      : [null, null, null, null, null, null, null, false] as const;

  const mountActions =
    showMountSections && productCode
      ? createApprovalMountActions(locale, projectId)
      : null;

  return (
    <>
      <ApprovalScreen
        state={loaded.state}
        data={loaded.data}
        labels={labels}
        canApprove={props.canApprove ?? loaded.canApprove}
        onApprove={approveAction}
      />
      {showMountSections && productCode && mountActions && complianceLabels && riskLabels && allergenLabels && complianceLoaded && riskLoaded && allergenLoaded ? (
        <div className="mx-auto w-full max-w-4xl space-y-8 px-6 pb-8">
          {validationLoaded?.visible ? (
            <section id="approval-validation" aria-labelledby="approval-validation-heading" className="space-y-4">
              <h2 id="approval-validation-heading" className="page-title" style={{ fontSize: 18 }}>
                {validationLoaded.title}
              </h2>
              {validationLoaded.error ? (
                <div role="status" data-testid="approval-validation-error" className="alert alert-amber">
                  {validationLoaded.errorNotice}
                </div>
              ) : (
                <ValidationStatusPanel title={validationLoaded.title} rules={validationLoaded.rules} />
              )}
            </section>
          ) : null}

          <section id="approval-compliance" aria-labelledby="approval-compliance-heading" className="space-y-4">
            <h2 id="approval-compliance-heading" className="page-title" style={{ fontSize: 18 }}>
              {complianceLabels.title}
            </h2>
            <ComplianceDocsScreen
              embedded
              productCode={productCode}
              rows={complianceLoaded.rows}
              labels={complianceLabels}
              canWrite={props.complianceCanWrite ?? complianceLoaded.canWrite}
              state={props.complianceState ?? complianceLoaded.state}
              projectId={projectId}
              locale={locale}
              uploadDocAction={mountActions.uploadDocForApproval}
              getSignedUrlAction={getSignedUrl}
              softDeleteDocAction={mountActions.softDeleteDocForApproval}
            />
          </section>

          <section id="approval-risks" aria-labelledby="approval-risks-heading" className="space-y-4">
            <h2 id="approval-risks-heading" className="page-title" style={{ fontSize: 18 }}>
              {riskLabels.title}
            </h2>
            <RiskRegisterScreen
              embedded
              productCode={productCode}
              rows={riskLoaded.rows}
              labels={riskLabels}
              canWrite={props.riskCanWrite ?? riskCanWrite}
              state={props.riskState ?? riskLoaded.state}
              createRiskAction={mountActions.createRiskForApproval}
              updateRiskAction={mountActions.updateRiskForApproval}
            />
          </section>

          <section id="approval-allergens" aria-labelledby="approval-allergens-heading" className="space-y-4">
            <h2 id="approval-allergens-heading" className="page-title" style={{ fontSize: 18 }}>
              {allergenLabels.title}
            </h2>
            <AllergenCascadeSection labels={allergenLabels} load={allergenLoaded} />
          </section>
        </div>
      ) : null}
    </>
  );
}

async function loadApprovalMountSections({
  locale,
  productCode,
  props,
  injected,
}: {
  locale: string;
  productCode: string;
  props: ApprovalPageProps;
  injected: boolean;
}) {
  const complianceInjected = Array.isArray(props.complianceRows);
  const riskInjected = Array.isArray(props.riskRows);
  const allergenInjected = props.allergenData !== undefined || props.allergenState !== undefined;
  const validationInjected = Array.isArray(props.validationRules);

  const validationLabelsPromise = buildValidationLabels(locale);

  const [complianceLabels, riskLabels, allergenLabels, validationLabels, complianceLoaded, riskLoaded, allergenLoaded, riskCanWrite] =
    await Promise.all([
      buildComplianceLabels(locale),
      buildRiskLabels(locale),
      buildAllergenLabels(locale),
      validationLabelsPromise,
      complianceInjected
        ? Promise.resolve({
            state: props.complianceState ?? ((props.complianceRows?.length ?? 0) === 0 ? 'empty' : 'ready'),
            rows: props.complianceRows ?? [],
            canWrite: props.complianceCanWrite ?? true,
          } satisfies ComplianceLoaderResult)
        : readComplianceSection(productCode),
      riskInjected
        ? Promise.resolve({
            state: props.riskState ?? ((props.riskRows?.length ?? 0) === 0 ? 'empty' : 'ready'),
            rows: props.riskRows ?? [],
          } satisfies RiskLoaderResult)
        : readRiskSection(productCode),
      allergenInjected
        ? Promise.resolve({
            state: props.allergenState ?? (props.allergenData ? 'ready' : 'empty'),
            data: props.allergenData ?? null,
            canWrite: props.allergenCanWrite ?? false,
            canAcceptDeclaration: props.allergenCanAcceptDeclaration ?? false,
            displayNames: {},
          } satisfies AllergenLoad)
        : loadAllergenCascade(productCode, locale),
      injected && props.riskCanWrite !== undefined
        ? Promise.resolve(props.riskCanWrite)
        : resolveRiskCanWrite(),
    ]);

  const validationLoaded: ValidationLoaderResult = validationInjected
    ? {
        visible: props.validationVisible ?? (props.validationRules?.length ?? 0) > 0,
        title: props.validationTitle ?? validationLabels.title,
        rules: props.validationRules ?? [],
      }
    : await readValidationSection(productCode, validationLabels);

  return [
    complianceLabels,
    riskLabels,
    allergenLabels,
    validationLoaded,
    complianceLoaded,
    riskLoaded,
    allergenLoaded,
    riskCanWrite,
  ] as const;
}
