/**
 * T-111 — Gate screen page (RSC · WIRING).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/gate
 *
 * Server Component. Reads REAL, org-scoped data via the MERGED `getProject` Server
 * Action (T-057 — getProject + withOrgContext, RLS as app_user with
 * app.current_org_id()). No mocks, no hard-coded rows. It maps that single read into
 * the props for the four merged slice components and injects the merged Server-Action
 * adapters (advanceProjectGate / approveProjectGate — T-058) into the client
 * orchestrator (GateScreen). RBAC (`permission_denied`) is resolved server-side and
 * never client-trusted: the advance/approve affordances receive their action only
 * when the caller holds the matching permission.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/gate-screens.jsx:106-616
 *   (GateChecklistPanel + AdvanceGateModal + GateApprovalModal + ApprovalHistoryTimeline)
 *
 * Risk red lines (T-111): the DB is only read inside this RSC (never inside a child
 * island); no slice component (T-107..T-110) is modified here; the Server Actions
 * (T-058) are imported, never authored.
 */

import { getTranslations } from 'next-intl/server';

import { GateScreen, type GateScreenData, type GateScreenLabels } from './_components/gate-screen';
import {
  getProject,
  type ChecklistItem,
  type GateApprovalTimelineItem,
} from '../../../../../../(npd)/pipeline/_actions/get-project';
import { advanceProjectGate as advanceProjectGateAction } from '../../../../../../(npd)/pipeline/_actions/advance-project-gate';
import { approveProjectGate as approveProjectGateAction } from '../../../../../../(npd)/pipeline/_actions/approve-project-gate';
import { toggleGateChecklistItem as toggleGateChecklistItemAction } from '../../../../../../(npd)/pipeline/_actions/toggle-gate-checklist-item';
import {
  GATE_ADVANCE_PERMISSION,
  GATE_APPROVE_PERMISSION,
  advanceTransitionForStage,
  nextStage,
} from '../../../../../../(npd)/pipeline/_actions/_lib/gate-helpers';
import {
  PROJECT_VIEW_PERMISSION,
  hasPermission,
  type ChecklistGate,
  type OrgContextLike,
  type ProjectGate,
} from '../../../../../../(npd)/pipeline/_actions/shared';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import type {
  GateChecklistLabels,
  GateKey,
  GateView,
  CategoryCode,
  PanelState,
} from '../../../../../../(npd)/pipeline/[projectId]/_components/gate-checklist-panel';
import type {
  AdvanceGateInfo,
  AdvanceGateItem,
  AdvanceGateLabels,
  TargetGate,
} from '../../../../../../(npd)/_modals/advance-gate-modal';
import type {
  ApprovalHistoryEntry,
  ApprovalHistoryLabels,
} from '../_components/approval-history-timeline';
import type { GateApprovalProject } from '../../../../../../(npd)/_modals/gate-approval-modal';

/** The page-level UI state mirrors the panel/timeline shared 5-state union. */
type PageState = PanelState;

export const dynamic = 'force-dynamic';

type GatePageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors costing/page.tsx + pipeline/page.tsx).
  data?: GateScreenData | null;
  state?: PageState;
  canWrite?: boolean;
  canAdvance?: boolean;
  canApprove?: boolean;
};

type LoaderResult = {
  state: PageState;
  data: GateScreenData | null;
  canWrite: boolean;
  canAdvance: boolean;
  canApprove: boolean;
};

// ─── Domain-constant gate metadata (static G0..G4 sequence; mirrors prototype GATE_INFO). ───
const GATE_ORDER: GateKey[] = ['G0', 'G1', 'G2', 'G3', 'G4'];

type GateMeta = {
  label: string;
  next: GateKey | null;
  /** Next stage label (or the launched terminal label). */
  nextLabel: string | null;
  /** Advance target for the action (G3/G4 require e-sign approval). */
  advanceTarget: TargetGate | null;
  /** G3/G4 require e-signature approval (GateApprovalModal); G0-G2 self-advance. */
  requiresApproval: boolean;
};

// HONEST gate sequence (2026-06-06 stage-pivot, intended G1 skip): the engine is
// stage-native — from brief (gate G0) the first advance is brief→recipe, which
// DERIVES gate G2. G1 (Feasibility) is collapsed into the brief stage and is never
// a forward advance target (it can only reappear via an admin gate revert), so the
// timeline keeps G1 only as the checklist grouping for its seeded items and G0's
// forward claim is G2 — the UI must never promise a G0→G1 step that cannot happen.
const GATE_META: Record<GateKey, GateMeta> = {
  G0: { label: 'Idea', next: 'G2', nextLabel: 'Business Case', advanceTarget: 'G2', requiresApproval: false },
  G1: { label: 'Feasibility (within Brief)', next: 'G2', nextLabel: 'Business Case', advanceTarget: 'G2', requiresApproval: false },
  G2: { label: 'Business Case', next: 'G3', nextLabel: 'Development', advanceTarget: 'G3', requiresApproval: true },
  G3: { label: 'Development', next: 'G4', nextLabel: 'Testing', advanceTarget: 'G4', requiresApproval: true },
  G4: { label: 'Testing', next: null, nextLabel: 'Launched', advanceTarget: 'Launched', requiresApproval: true },
};

// ─────────────────────────────── i18n label loaders ────────────────────────────────

const DEFAULT_CHECKLIST_LABELS: GateChecklistLabels = {
  title: 'Stage-Gate checklist',
  currentGate: 'Current gate:',
  overallProgress: 'Overall progress',
  current: 'Current',
  blockingBadge: '{count} blocking',
  notStarted: 'Not started',
  completedBy: 'Completed by {by} · {at}',
  required: 'Required',
  optional: 'Optional',
  blocking: 'Blocking',
  attach: 'Attach',
  catTechnical: 'TECHNICAL',
  catBusiness: 'BUSINESS',
  catCompliance: 'COMPLIANCE',
  blockerAlert: '{count} blocking item(s) before advancing to {gate}: {gateLabel}',
  readyAlert: 'Ready to advance from {gate} to {nextLabel}',
  advance: 'Advance to {gate}: {nextLabel} →',
  requestApproval: 'Request approval →',
  markLaunched: 'Mark launched',
  advanceTerminalHint: 'Launched — fully advanced',
  expand: 'Expand',
  collapse: 'Collapse',
  loading: 'Loading gate checklist…',
  empty: 'No checklist items yet',
  emptyBody: 'Checklist items appear once the project gate is configured.',
  error: 'Unable to load the gate checklist.',
  forbidden: 'You do not have permission to view this gate.',
};

const DEFAULT_ADVANCE_LABELS: AdvanceGateLabels = {
  title: 'Advance gate',
  gateTransition: 'Gate transition',
  currentTag: 'Current',
  targetTag: 'Target',
  approvalRequired: 'This transition requires gate approval.',
  checklistSummary: '{gate} checklist — {label}',
  done: 'Done',
  blocking: 'Required',
  optional: 'Optional',
  requiredComplete: '{done} of {total} required items complete',
  blockersTitle: '{count} required item(s) incomplete',
  requiredIncompleteWarning: '{count} required checklist items are not complete — you can still advance.',
  readyAlert: 'All required items complete — ready to advance.',
  notesLabel: 'Advance notes',
  notesPlaceholder: 'Add a note for this gate transition…',
  notesHint: 'A short note is recorded with this gate transition.',
  cancel: 'Cancel',
  advance: 'Advance to {gate}: {nextLabel}',
  advancing: 'Advancing…',
  successTitle: 'Gate advanced to {gate}: {nextLabel}',
  successBody: 'The project has moved to the next gate.',
  loading: 'Loading gate summary…',
  empty: 'No checklist items to summarise.',
  error: 'Could not advance the gate. Try again.',
  forbidden: 'You do not have permission to advance this gate.',
  esignRequiredError:
    'Gate G4 e-signature approval is required before handoff — approve it on the Approval stage.',
  blockersPresentError: '{count} blocker(s) prevent advancement.',
};

const DEFAULT_HISTORY_LABELS: ApprovalHistoryLabels = {
  title: 'Approval History',
  subtitle: '{count} approvals recorded',
  statusApproved: 'APPROVED',
  statusRejected: 'REJECTED',
  eSignedTag: 'E-signed',
  eSignedIconLabel: 'E-signed entry',
  sigShow: 'View signature details',
  sigHide: 'Hide signature details',
  sigPanelTitle: 'E-Signature Details',
  sigSigner: 'Signer',
  sigRole: 'Role',
  sigTimestamp: 'Timestamp',
  sigCertId: 'Certificate ID',
  sigVerification: 'Verification',
  sigValid: 'Valid — Signature verified',
  approvedIconLabel: 'Approved',
  rejectedIconLabel: 'Rejected',
  loading: 'Loading approval history…',
  empty: 'No approvals recorded yet for this project',
  emptyBody: 'Gate approvals will appear here as the project advances.',
  error: 'Unable to load approval history.',
  forbidden: 'You do not have permission to view this approval history.',
};

function labelLoader<T extends Record<string, string | undefined>>(defaults: T) {
  const keys = Object.keys(defaults) as Array<keyof T>;
  return async (locale: string, namespace: string): Promise<T> => {
    try {
      const t = await getTranslations({ locale, namespace });
      return keys.reduce((acc, key) => {
        try {
          const value = t(key as string);
          acc[key] = (value === key ? defaults[key] : value) as T[keyof T];
        } catch {
          acc[key] = defaults[key];
        }
        return acc;
      }, {} as T);
    } catch {
      return { ...defaults };
    }
  };
}

const loadChecklistLabels = labelLoader(DEFAULT_CHECKLIST_LABELS);
const loadAdvanceLabels = labelLoader(DEFAULT_ADVANCE_LABELS);
const loadHistoryLabels = labelLoader(DEFAULT_HISTORY_LABELS);

async function buildLabels(locale: string): Promise<GateScreenLabels> {
  const [checklist, advance, approvalHistory] = await Promise.all([
    loadChecklistLabels(locale, 'npd.gateChecklist'),
    loadAdvanceLabels(locale, 'npd.advanceGateModal'),
    loadHistoryLabels(locale, 'npd.approvalHistory'),
  ]);
  return { checklist, advance, approvalHistory };
}

// ─────────────────────────────── data mappers ────────────────────────────────

function isChecklistGate(gate: ProjectGate): gate is ChecklistGate {
  return gate !== 'Launched';
}

function pctOf(items: { done: boolean }[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}

function mapChecklistItem(item: ChecklistItem) {
  return {
    id: item.id,
    text: item.itemText,
    required: item.required,
    done: item.completedAt !== null,
    // Category codes are stored lower-case (e.g. 'technical'); the panel groups by the
    // canonical TECHNICAL/BUSINESS/COMPLIANCE upper-case codes.
    category: item.categoryCode.toUpperCase() as CategoryCode,
    by: item.completedByUser,
    at: item.completedAt,
    file: item.evidenceFile,
  };
}

function buildGateViews(
  currentGate: ProjectGate,
  checklistByGate: Record<ChecklistGate, ChecklistItem[]>,
): GateView[] {
  const currentKey: GateKey = isChecklistGate(currentGate) ? currentGate : 'G4';
  return GATE_ORDER.map((key): GateView => {
    const meta = GATE_META[key];
    const items = (checklistByGate[key] ?? []).map(mapChecklistItem);
    const blockers = items.filter((i) => i.required && !i.done);
    return {
      key,
      label: meta.label,
      items,
      pct: pctOf(items),
      blockers,
      isCurrent: key === currentKey,
      next: meta.next,
      nextLabel: meta.nextLabel,
      requiresApproval: meta.requiresApproval,
    };
  });
}

function buildAdvanceProps(
  projectId: string,
  code: string,
  name: string,
  currentGate: ProjectGate,
  currentStage: string,
  gates: GateView[],
): { project: GateScreenData['advanceProject']; info: AdvanceGateInfo; items: AdvanceGateItem[] } {
  const currentKey: GateKey = isChecklistGate(currentGate) ? currentGate : 'G4';
  const meta = GATE_META[currentKey];
  const currentGateView = gates.find((g) => g.key === currentKey);
  const items: AdvanceGateItem[] = (currentGateView?.items ?? []).map((i) => ({
    id: i.id,
    text: i.text,
    required: i.required,
    done: i.done,
  }));
  // The advance target is derived from the STAGE machine (advanceTransitionForStage),
  // never from static per-gate metadata — from brief (G0) the real next step derives
  // G2 (G1 is collapsed into brief), and within G3 a stage step keeps the gate at G3.
  const transition = advanceTransitionForStage(currentStage);
  const targetGate = (transition?.targetGate ?? 'Launched') as TargetGate;
  const nextLabel =
    targetGate === 'Launched' ? 'Launched' : GATE_META[targetGate as GateKey].label;
  return {
    project: { id: projectId, code, name, currentGate: currentKey },
    info: {
      current: currentKey,
      currentLabel: meta.label,
      next: targetGate,
      nextLabel,
      // Only the approval→handoff step is the enforced G4 e-sign checkpoint.
      requiresApproval: transition?.requiresESign ?? false,
    },
    items,
  };
}

function buildApprovalProject(
  projectId: string,
  code: string,
  name: string,
  currentGate: ProjectGate,
  gates: GateView[],
): GateApprovalProject {
  // The approval modal only handles the e-sign gates (G3/G4). Default to the current
  // gate when it is one of those, otherwise G3 (the first e-sign gate) as a safe shell.
  const gateCode = currentGate === 'G3' || currentGate === 'G4' ? currentGate : 'G3';
  const view = gates.find((g) => g.key === gateCode);
  const required = (view?.items ?? []).filter((i) => i.required);
  return {
    id: projectId,
    code,
    name,
    gateCode,
    requiredDone: required.filter((i) => i.done).length,
    requiredTotal: required.length,
    pct: view?.pct ?? 0,
  };
}

function mapApprovalEntry(row: GateApprovalTimelineItem): ApprovalHistoryEntry {
  const gateLabel = isChecklistGate(row.gateCode) ? GATE_META[row.gateCode].label : row.gateCode;
  const eSigned = row.esignedAt !== null;
  return {
    id: row.id,
    gate: row.gateCode,
    gateLabel,
    result: row.decision,
    approver: row.approverUserId,
    role: 'Approver',
    notes: row.decision === 'rejected' ? row.rejectionReason ?? row.notes : row.notes,
    date: row.esignedAt ?? row.createdAt,
    eSigned,
    eSignHash: null,
    eSignedAt: row.esignedAt,
  } as ApprovalHistoryEntry;
}

function buildGateScreenData(
  projectId: string,
  code: string,
  name: string,
  currentGate: ProjectGate,
  currentStage: string,
  checklistByGate: Record<ChecklistGate, ChecklistItem[]>,
  approvalsTimeline: GateApprovalTimelineItem[],
): GateScreenData {
  const gates = buildGateViews(currentGate, checklistByGate);
  const advance = buildAdvanceProps(projectId, code, name, currentGate, currentStage, gates);
  const currentKey: GateKey = isChecklistGate(currentGate) ? currentGate : 'G4';
  const isTerminal = currentGate === 'Launched';
  return {
    panelProject: { id: projectId, code, name, currentGate: currentKey },
    gates,
    advanceProject: advance.project,
    advanceGateInfo: advance.info,
    advanceItems: advance.items,
    approvalProject: buildApprovalProject(projectId, code, name, currentGate, gates),
    approvals: approvalsTimeline.map(mapApprovalEntry),
    isTerminal,
  };
}

// ─────────────────────────────── RSC loader ────────────────────────────────

async function readPageData(projectId: string): Promise<LoaderResult> {
  try {
    // Write-capability flags are RBAC, resolved server-side (never client-trusted).
    const perms = await withOrgContext(async (rawCtx): Promise<{ canView: boolean; canAdvance: boolean; canApprove: boolean }> => {
      const ctx = rawCtx as OrgContextLike;
      const [canView, canAdvance, canApprove] = await Promise.all([
        hasPermission(ctx, PROJECT_VIEW_PERMISSION),
        hasPermission(ctx, GATE_ADVANCE_PERMISSION),
        hasPermission(ctx, GATE_APPROVE_PERMISSION),
      ]);
      return { canView, canAdvance, canApprove };
    });

    if (!perms.canView) {
      return { state: 'permission_denied', data: null, canWrite: false, canAdvance: false, canApprove: false };
    }

    const result = await getProject({ projectId });
    if (!result.ok) {
      if (result.error === 'FORBIDDEN') {
        return { state: 'permission_denied', data: null, canWrite: false, canAdvance: false, canApprove: false };
      }
      if (result.error === 'NOT_FOUND') {
        return { state: 'empty', data: null, canWrite: perms.canAdvance, canAdvance: perms.canAdvance, canApprove: perms.canApprove };
      }
      return { state: 'error', data: null, canWrite: false, canAdvance: false, canApprove: false };
    }

    const { project, checklistByGate, approvalsTimeline } = result.data;
    const data = buildGateScreenData(
      project.id,
      project.code,
      project.name,
      project.currentGate,
      project.currentStage,
      checklistByGate,
      approvalsTimeline,
    );
    const hasItems = data.gates.some((g) => g.items.length > 0);
    return {
      state: hasItems ? 'ready' : 'empty',
      data,
      canWrite: perms.canAdvance,
      canAdvance: perms.canAdvance,
      canApprove: perms.canApprove,
    };
  } catch (error) {
    console.error('[gate-screen] org-scoped read failed:', error);
    return { state: 'error', data: null, canWrite: false, canAdvance: false, canApprove: false };
  }
}

// ─── Server-Action adapters passed to the client (T-058 owns the actions themselves). ───

async function advanceAdapter(input: { projectId: string; targetGate: TargetGate; notes: string }) {
  'use server';
  // Stage-native engine: advance exactly one operational stage from the project's
  // real current_stage (the modal's `targetGate` is the old gate-transition UI shape
  // and is intentionally ignored here).
  const current = await getProject({ projectId: input.projectId });
  if (!current.ok) return { ok: false as const, error: current.error, status: 400 };
  const next = nextStage(current.data.project.currentStage);
  if (!next) return { ok: false as const, error: 'ADJACENCY_VIOLATION', status: 422 };
  const result = await advanceProjectGateAction({ projectId: input.projectId, targetStage: next });
  if (result.ok) return { ok: true as const, data: result.data };
  return { ok: false as const, error: result.error, status: result.status, blockers: result.blockers };
}

async function approveAdapter(
  input:
    | { projectId: string; gateCode: 'G3' | 'G4'; decision: 'approved'; notes: string; password: string }
    | { projectId: string; gateCode: 'G3' | 'G4'; decision: 'rejected'; notes: string },
) {
  'use server';
  const result = await approveProjectGateAction(input);
  return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
}

async function toggleChecklistAdapter(projectId: string, itemId: string, done: boolean) {
  'use server';
  const result = await toggleGateChecklistItemAction({ projectId, itemId, completed: done });
  return result.ok ? { ok: true as const } : { ok: false as const, code: result.code };
}

export default async function GatePage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as GatePageProps;
  const { locale, projectId } = props.params ? await props.params : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);

  const injected = props.data !== undefined || props.state !== undefined;
  const loaded: LoaderResult = injected
    ? {
        state: props.state ?? (props.data ? 'ready' : 'empty'),
        data: props.data ?? null,
        canWrite: props.canWrite ?? false,
        canAdvance: props.canAdvance ?? false,
        canApprove: props.canApprove ?? false,
      }
    : await readPageData(projectId);

  if (!loaded.data) {
    // Non-ready shells (loading/empty/error/permission_denied) still render the panel +
    // timeline state notices; pass empty data so the islands surface their state UI.
    const emptyData: GateScreenData = {
      panelProject: { id: projectId, code: '', name: '', currentGate: 'G0' },
      gates: [],
      advanceProject: { id: projectId, code: '', name: '', currentGate: 'G0' },
      advanceGateInfo: {
        current: 'G0',
        currentLabel: GATE_META.G0.label,
        // Honest forward claim: brief (G0) advances to recipe, which derives G2 —
        // G1 is collapsed into the brief stage and is never a forward target.
        next: 'G2',
        nextLabel: GATE_META.G0.nextLabel ?? 'Business Case',
        requiresApproval: false,
      },
      advanceItems: [],
      approvalProject: { id: projectId, code: '', name: '', gateCode: 'G3', requiredDone: 0, requiredTotal: 0, pct: 0 },
      approvals: [],
      isTerminal: false,
    };
    return (
      <GateScreen
        projectId={projectId}
        data={emptyData}
        labels={labels}
        state={loaded.state}
        canWrite={loaded.canWrite}
        canAdvance={loaded.canAdvance}
        canApprove={loaded.canApprove}
      />
    );
  }

  return (
    <GateScreen
      projectId={projectId}
      data={loaded.data}
      labels={labels}
      state={loaded.state}
      canWrite={loaded.canWrite}
      canAdvance={loaded.canAdvance}
      canApprove={loaded.canApprove}
      toggleGateChecklistItem={loaded.canWrite ? toggleChecklistAdapter.bind(null, projectId) : undefined}
      advanceProjectGate={advanceAdapter}
      approveProjectGate={approveAdapter}
    />
  );
}
