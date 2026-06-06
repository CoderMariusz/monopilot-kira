/**
 * NPD project-detail page (RSC) — parent of the gate/formulation/costing/nutrition/
 * approval child routes. Reached from the pipeline kanban/split "Open project →".
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:4-43
 *     - StageRail        (project.jsx:4-20)  → <StageRail> presentational dots.
 *     - ProjectHeader    (project.jsx:22-43) → <ProjectHeader> client island
 *       (code/name/gate badge/priority badge/owner/target + Watch/Duplicate/
 *        "Advance stage →" wired to the EXISTING AdvanceGateModal flow).
 *   7-dept status strip (product-owner addition; reuses the FA-detail strip):
 *     prototypes/design/Monopilot Design System/npd/fa-screens.jsx:365-385
 *
 * Real-data wiring (NO mocks):
 *   The project summary + per-gate checklist come from the MERGED `getProject`
 *   Server Action (T-057, org-scoped via withOrgContext + RLS). The 7-dept strip
 *   is derived SERVER-SIDE from the project's LINKED Finished Good (product) — the
 *   same `deriveDeptStatuses` the FA-detail screen uses — when the project has a
 *   `product_code` (G3+). Pre-G3 projects have no FG, so the strip renders an
 *   all-"pending" state with a caption (never faked data).
 *
 * Required UI states: loading (Suspense/streamed), empty/not-found (bad projectId),
 * error, permission-denied — all resolved server-side, never client-trusted.
 *
 * Next 16 RSC contract: StageRail + DeptStatusStrip are presentational (data-only
 * props). The ProjectHeader island owns its own button callbacks; the advance
 * Server Action is injected as a Server Action (not a raw function).
 */

import { getTranslations } from 'next-intl/server';

import {
  getProject,
  type ChecklistItem,
} from '../../../../../(npd)/pipeline/_actions/get-project';
import { advanceProjectGate as advanceProjectGateAction } from '../../../../../(npd)/pipeline/_actions/advance-project-gate';
import { GATE_ADVANCE_PERMISSION } from '../../../../../(npd)/pipeline/_actions/_lib/gate-helpers';
import {
  PROJECT_VIEW_PERMISSION,
  hasPermission,
  type OrgContextLike,
  type ProjectGate,
  type ProjectPriority,
  type ProjectSummary,
} from '../../../../../(npd)/pipeline/_actions/shared';
import type { TargetGate } from '../../../../../(npd)/_modals/advance-gate-modal';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  DEPT_KEYS,
  deriveDeptStatuses,
  type DeptKey,
  type DeptStatus,
  type GenericDeptColumn,
} from '../../../../../../lib/npd/derive-dept-statuses';
import {
  DeptStatusStrip,
  type DeptStatusItem,
} from '../../../../../../components/npd/dept-status-strip';
import { StageRail, type StageRailItem } from './_components/stage-rail';
import {
  ProjectHeader,
  type ProjectHeaderBadgeTone,
  type ProjectHeaderLabels,
  type ProjectHeaderView,
} from './_components/project-header';

export const dynamic = 'force-dynamic';

// ─── Domain-constant Stage-Gate metadata (static G0..G4; mirrors prototype GATE_INFO). ───
type GateKey = 'G0' | 'G1' | 'G2' | 'G3' | 'G4';
const GATE_ORDER: GateKey[] = ['G0', 'G1', 'G2', 'G3', 'G4'];
const STAGE_RAIL_KEYS: (GateKey | 'Launched')[] = ['G0', 'G1', 'G2', 'G3', 'G4', 'Launched'];

type GateMeta = {
  label: string;
  next: GateKey | null;
  nextLabel: string;
  advanceTarget: TargetGate;
  requiresApproval: boolean;
  tone: ProjectHeaderBadgeTone;
};

const GATE_META: Record<GateKey, GateMeta> = {
  G0: { label: 'Idea', next: 'G1', nextLabel: 'Feasibility', advanceTarget: 'G1', requiresApproval: false, tone: 'gray' },
  G1: { label: 'Feasibility', next: 'G2', nextLabel: 'Business Case', advanceTarget: 'G2', requiresApproval: false, tone: 'blue' },
  G2: { label: 'Business Case', next: 'G3', nextLabel: 'Development', advanceTarget: 'G3', requiresApproval: true, tone: 'blue' },
  G3: { label: 'Development', next: 'G4', nextLabel: 'Testing', advanceTarget: 'G4', requiresApproval: true, tone: 'amber' },
  G4: { label: 'Testing', next: null, nextLabel: 'Launched', advanceTarget: 'Launched', requiresApproval: true, tone: 'amber' },
};

const PRIO_TONE: Record<ProjectPriority, ProjectHeaderBadgeTone> = {
  high: 'red',
  normal: 'amber',
  low: 'gray',
};

function isGateKey(gate: ProjectGate): gate is GateKey {
  return gate !== 'Launched';
}

// ─────────────────────────────── i18n labels ────────────────────────────────

type ProjectDetailLabels = {
  header: ProjectHeaderLabels;
  prio: Record<ProjectPriority, string>;
  gate: Record<GateKey | 'Launched', string>;
  stageRailAriaLabel: string;
  deptStrip: {
    ariaLabel: string;
    labels: Record<DeptKey, string>;
    statusLabels: Record<DeptStatus, string>;
    /** Pre-G3 caption when no FG is linked yet. */
    pendingCaption: string;
  };
  empty: string;
  emptyBody: string;
  forbidden: string;
  error: string;
  // AdvanceGateModal labels (npd.advanceGateModal — same surface as the gate route).
  advance: {
    title: string;
    gateTransition: string;
    currentTag: string;
    targetTag: string;
    approvalRequired: string;
    checklistSummary: string;
    done: string;
    blocking: string;
    optional: string;
    requiredComplete: string;
    blockersTitle: string;
    readyAlert: string;
    notesLabel: string;
    notesPlaceholder: string;
    notesHint: string;
    cancel: string;
    advance: string;
    advancing: string;
    successTitle: string;
    successBody: string;
    loading: string;
    empty: string;
    error: string;
    forbidden: string;
  };
};

const DEFAULTS: ProjectDetailLabels = {
  header: {
    breadcrumbNpd: 'NPD',
    breadcrumbPipeline: 'Pipeline',
    ownerLabel: 'Owner',
    targetLabel: 'Target launch',
    noOwner: 'Unassigned',
    noTarget: 'Not set',
    watch: 'Watch',
    watchDisabledHint: 'Watching projects is not available yet.',
    duplicate: 'Duplicate',
    duplicateDisabledHint: 'Duplicating projects is not available yet.',
    advanceStage: 'Advance stage →',
    advanceDisabledHint: 'You do not have permission to advance this gate.',
  },
  prio: { high: 'High priority', normal: 'Normal priority', low: 'Low priority' },
  gate: {
    G0: 'Idea',
    G1: 'Feasibility',
    G2: 'Business Case',
    G3: 'Development',
    G4: 'Testing',
    Launched: 'Launched',
  },
  stageRailAriaLabel: 'Stage-Gate progress',
  deptStrip: {
    ariaLabel: 'Department gate progress',
    labels: {
      core: 'Core',
      planning: 'Planning',
      commercial: 'Commercial',
      production: 'Production',
      technical: 'Technical',
      mrp: 'MRP',
      procurement: 'Procurement',
    },
    statusLabels: { done: 'Done', inprog: 'In progress', blocked: 'Blocked', pending: 'Pending' },
    pendingCaption: 'Departments populate once the FG is created at Gate 3.',
  },
  empty: 'Project not found',
  emptyBody: 'No project matches this id in your organisation.',
  forbidden: 'You do not have permission to view this project.',
  error: 'Unable to load this project.',
  advance: {
    title: 'Advance gate',
    gateTransition: 'Gate transition',
    currentTag: 'Current',
    targetTag: 'Target',
    approvalRequired: 'This transition requires gate approval.',
    checklistSummary: '{gate} checklist — {label}',
    done: 'Done',
    blocking: 'Blocking',
    optional: 'Optional',
    requiredComplete: '{done} of {total} required items complete',
    blockersTitle: '{count} blocker(s) must be resolved first',
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
  },
};

async function pickerFor(locale: string, namespace: string) {
  try {
    const t = await getTranslations({ locale, namespace });
    return (key: string, fallback: string) => {
      try {
        const value = t(key);
        if (value === key || value === `${namespace}.${key}`) return fallback;
        return value;
      } catch {
        return fallback;
      }
    };
  } catch {
    return (_key: string, fallback: string) => fallback;
  }
}

async function buildLabels(locale: string): Promise<ProjectDetailLabels> {
  const p = await pickerFor(locale, 'npd.projectDetail');
  const a = await pickerFor(locale, 'npd.advanceGateModal');
  const d = DEFAULTS;
  return {
    header: {
      breadcrumbNpd: p('header.breadcrumbNpd', d.header.breadcrumbNpd),
      breadcrumbPipeline: p('header.breadcrumbPipeline', d.header.breadcrumbPipeline),
      ownerLabel: p('header.ownerLabel', d.header.ownerLabel),
      targetLabel: p('header.targetLabel', d.header.targetLabel),
      noOwner: p('header.noOwner', d.header.noOwner),
      noTarget: p('header.noTarget', d.header.noTarget),
      watch: p('header.watch', d.header.watch),
      watchDisabledHint: p('header.watchDisabledHint', d.header.watchDisabledHint),
      duplicate: p('header.duplicate', d.header.duplicate),
      duplicateDisabledHint: p('header.duplicateDisabledHint', d.header.duplicateDisabledHint),
      advanceStage: p('header.advanceStage', d.header.advanceStage),
      advanceDisabledHint: p('header.advanceDisabledHint', d.header.advanceDisabledHint),
    },
    prio: {
      high: p('prio.high', d.prio.high),
      normal: p('prio.normal', d.prio.normal),
      low: p('prio.low', d.prio.low),
    },
    gate: {
      G0: p('gate.G0', d.gate.G0),
      G1: p('gate.G1', d.gate.G1),
      G2: p('gate.G2', d.gate.G2),
      G3: p('gate.G3', d.gate.G3),
      G4: p('gate.G4', d.gate.G4),
      Launched: p('gate.Launched', d.gate.Launched),
    },
    stageRailAriaLabel: p('stageRailAriaLabel', d.stageRailAriaLabel),
    deptStrip: {
      ariaLabel: p('deptStrip.ariaLabel', d.deptStrip.ariaLabel),
      labels: {
        core: p('deptStrip.labels.core', d.deptStrip.labels.core),
        planning: p('deptStrip.labels.planning', d.deptStrip.labels.planning),
        commercial: p('deptStrip.labels.commercial', d.deptStrip.labels.commercial),
        production: p('deptStrip.labels.production', d.deptStrip.labels.production),
        technical: p('deptStrip.labels.technical', d.deptStrip.labels.technical),
        mrp: p('deptStrip.labels.mrp', d.deptStrip.labels.mrp),
        procurement: p('deptStrip.labels.procurement', d.deptStrip.labels.procurement),
      },
      statusLabels: {
        done: p('deptStrip.statusLabels.done', d.deptStrip.statusLabels.done),
        inprog: p('deptStrip.statusLabels.inprog', d.deptStrip.statusLabels.inprog),
        blocked: p('deptStrip.statusLabels.blocked', d.deptStrip.statusLabels.blocked),
        pending: p('deptStrip.statusLabels.pending', d.deptStrip.statusLabels.pending),
      },
      pendingCaption: p('deptStrip.pendingCaption', d.deptStrip.pendingCaption),
    },
    empty: p('empty', d.empty),
    emptyBody: p('emptyBody', d.emptyBody),
    forbidden: p('forbidden', d.forbidden),
    error: p('error', d.error),
    advance: {
      title: a('title', d.advance.title),
      gateTransition: a('gateTransition', d.advance.gateTransition),
      currentTag: a('currentTag', d.advance.currentTag),
      targetTag: a('targetTag', d.advance.targetTag),
      approvalRequired: a('approvalRequired', d.advance.approvalRequired),
      checklistSummary: a('checklistSummary', d.advance.checklistSummary),
      done: a('done', d.advance.done),
      blocking: a('blocking', d.advance.blocking),
      optional: a('optional', d.advance.optional),
      requiredComplete: a('requiredComplete', d.advance.requiredComplete),
      blockersTitle: a('blockersTitle', d.advance.blockersTitle),
      readyAlert: a('readyAlert', d.advance.readyAlert),
      notesLabel: a('notesLabel', d.advance.notesLabel),
      notesPlaceholder: a('notesPlaceholder', d.advance.notesPlaceholder),
      notesHint: a('notesHint', d.advance.notesHint),
      cancel: a('cancel', d.advance.cancel),
      advance: a('advance', d.advance.advance),
      advancing: a('advancing', d.advance.advancing),
      successTitle: a('successTitle', d.advance.successTitle),
      successBody: a('successBody', d.advance.successBody),
      loading: a('loading', d.advance.loading),
      empty: a('empty', d.advance.empty),
      error: a('error', d.advance.error),
      forbidden: a('forbidden', d.advance.forbidden),
    },
  };
}

// ─────────────────────────────── data loader ────────────────────────────────

type LinkedFgDept = {
  productCode: string;
  deptStatuses: Record<DeptKey, DeptStatus>;
};

const ALL_PENDING_DEPTS: Record<DeptKey, DeptStatus> = {
  core: 'pending',
  planning: 'pending',
  commercial: 'pending',
  production: 'pending',
  technical: 'pending',
  mrp: 'pending',
  procurement: 'pending',
};

type LoaderResult = {
  state: 'ready' | 'empty' | 'permission_denied' | 'error';
  project: ProjectSummary | null;
  checklistByGate: Record<string, ChecklistItem[]> | null;
  /** Linked FG dept derivation (null when no FG is linked → pre-G3). */
  linkedFg: LinkedFgDept | null;
  canAdvance: boolean;
};

type DeptColumnRow = {
  physical_column: string;
  required_for_done: boolean | null;
  display_order: number | null;
};

async function readRequiredColumns(ctx: OrgContextLike, deptCode: string): Promise<GenericDeptColumn[]> {
  const { rows } = await ctx.client.query<DeptColumnRow>(
    `select lower(dc.column_key) as physical_column,
            dc.required_for_done,
            dc.display_order
       from "Reference"."DeptColumns" dc
      where dc.org_id = app.current_org_id()
        and lower(dc.dept_code) = lower($1)
      order by dc.display_order nulls last, dc.column_key`,
    [deptCode],
  );
  return rows.map((row, i) => ({
    key: row.physical_column,
    dataType: 'text' as const,
    required: row.required_for_done === true,
    readOnly: false,
    displayOrder: row.display_order ?? i,
  }));
}

async function readProjectProductLink(ctx: OrgContextLike, projectId: string): Promise<string | null> {
  const { rows } = await ctx.client.query<{ product_code: string | null }>(
    `select product_code
       from public.npd_projects
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [projectId],
  );
  return rows[0]?.product_code ?? null;
}

async function readProductValues(ctx: OrgContextLike, productCode: string): Promise<Record<string, unknown> | null> {
  const { rows } = await ctx.client.query<{ product_json: Record<string, unknown> | null }>(
    `select to_jsonb(p.*) as product_json
       from public.product p
      where p.org_id = app.current_org_id()
        and p.product_code = $1
        and p.deleted_at is null
      limit 1`,
    [productCode],
  );
  return rows[0]?.product_json ?? null;
}

async function loadLinkedFg(projectId: string): Promise<LinkedFgDept | null> {
  return withOrgContext(async (rawCtx): Promise<LinkedFgDept | null> => {
    const ctx = rawCtx as OrgContextLike;
    const productCode = await readProjectProductLink(ctx, projectId);
    if (!productCode) return null;

    const values = await readProductValues(ctx, productCode);
    if (!values) return null;

    const [core, planning, commercial, production, technical, mrp, procurement] = await Promise.all([
      readRequiredColumns(ctx, 'Core'),
      readRequiredColumns(ctx, 'Planning'),
      readRequiredColumns(ctx, 'Commercial'),
      readRequiredColumns(ctx, 'Production'),
      readRequiredColumns(ctx, 'Technical'),
      readRequiredColumns(ctx, 'MRP'),
      readRequiredColumns(ctx, 'Procurement'),
    ]);

    const deptStatuses = deriveDeptStatuses(values, {
      core,
      planning,
      commercial,
      production,
      technical,
      mrp,
      procurement,
    });
    return { productCode, deptStatuses };
  });
}

async function loadPage(projectId: string): Promise<LoaderResult> {
  try {
    const canAdvance = await withOrgContext(async (rawCtx): Promise<boolean> => {
      const ctx = rawCtx as OrgContextLike;
      const [canView, mayAdvance] = await Promise.all([
        hasPermission(ctx, PROJECT_VIEW_PERMISSION),
        hasPermission(ctx, GATE_ADVANCE_PERMISSION),
      ]);
      // canView is re-checked inside getProject; surface it here so a denied user
      // never reaches the FG read.
      return canView && mayAdvance;
    });

    const result = await getProject({ projectId });
    if (!result.ok) {
      if (result.error === 'FORBIDDEN') {
        return { state: 'permission_denied', project: null, checklistByGate: null, linkedFg: null, canAdvance: false };
      }
      if (result.error === 'NOT_FOUND') {
        return { state: 'empty', project: null, checklistByGate: null, linkedFg: null, canAdvance: false };
      }
      return { state: 'error', project: null, checklistByGate: null, linkedFg: null, canAdvance: false };
    }

    // Linked-FG dept derivation runs only after getProject confirmed access.
    let linkedFg: LinkedFgDept | null = null;
    try {
      linkedFg = await loadLinkedFg(projectId);
    } catch (fgError) {
      console.error('[project-detail] linked FG read failed:', fgError);
      linkedFg = null; // degrade to pending strip, never fail the whole page
    }

    return {
      state: 'ready',
      project: result.data.project,
      checklistByGate: result.data.checklistByGate,
      linkedFg,
      canAdvance,
    };
  } catch (error) {
    console.error('[project-detail] org-scoped read failed:', error);
    return { state: 'error', project: null, checklistByGate: null, linkedFg: null, canAdvance: false };
  }
}

// ─── Server-Action adapter passed to the client (T-058 owns the action itself). ───
async function advanceAdapter(input: { projectId: string; targetGate: TargetGate; notes: string }) {
  'use server';
  const result = await advanceProjectGateAction(input);
  if (result.ok) return { ok: true as const, data: result.data };
  return { ok: false as const, error: result.error, status: result.status };
}

// ─────────────────────────────── view helpers ────────────────────────────────

function StatePanel({ testId, title, body }: { testId: string; title: string; body?: string }) {
  return (
    <main className="flex w-full flex-col gap-4 px-6 py-6">
      <div role="alert" data-testid={testId} className="card" style={{ textAlign: 'center', padding: 32 }}>
        <p style={{ fontSize: 15, fontWeight: 600 }}>{title}</p>
        {body ? <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>{body}</p> : null}
      </div>
    </main>
  );
}

type ProjectDetailPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors gate/page.tsx + costing/page.tsx).
  loaded?: LoaderResult;
};

export default async function ProjectDetailPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as ProjectDetailPageProps;
  const { locale, projectId } = props.params ? await props.params : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);

  const loaded: LoaderResult = props.loaded ?? (await loadPage(projectId));

  if (loaded.state === 'permission_denied') {
    return <StatePanel testId="project-detail-forbidden" title={labels.forbidden} />;
  }
  if (loaded.state === 'error') {
    return <StatePanel testId="project-detail-error" title={labels.error} />;
  }
  if (loaded.state === 'empty' || !loaded.project) {
    return <StatePanel testId="project-detail-empty" title={labels.empty} body={labels.emptyBody} />;
  }

  const { project, checklistByGate, linkedFg, canAdvance } = loaded;

  const currentGate = project.currentGate;
  const currentKey: GateKey = isGateKey(currentGate) ? currentGate : 'G4';
  const meta = GATE_META[currentKey];

  // Header view.
  const gateLabel = labels.gate[isGateKey(currentGate) ? currentGate : 'Launched'];
  const gateTone: ProjectHeaderBadgeTone =
    currentGate === 'Launched' ? 'green' : GATE_META[currentKey].tone;
  const headerView: ProjectHeaderView = {
    id: project.id,
    code: project.code,
    name: project.name,
    type: project.type,
    owner: project.owner,
    targetLaunch: project.targetLaunch,
    gateLabel,
    gateTone,
    prioLabel: labels.prio[project.prio],
    prioTone: PRIO_TONE[project.prio],
  };

  // Stage rail: current index across the G0..Launched sequence.
  const currentRailIndex = STAGE_RAIL_KEYS.indexOf(currentGate);
  const stageRailItems: StageRailItem[] = STAGE_RAIL_KEYS.map((key) => ({
    key,
    label: labels.gate[key],
  }));

  // Advance modal props (resolved from the real getProject checklist).
  const currentChecklist = isGateKey(currentGate)
    ? (checklistByGate?.[currentGate] ?? [])
    : [];
  const advanceItems = currentChecklist.map((item) => ({
    id: item.id,
    text: item.itemText,
    required: item.required,
    done: item.completedAt !== null,
  }));
  const advanceModal = {
    labels: labels.advance,
    project: { id: project.id, code: project.code, name: project.name, currentGate: currentKey },
    gateInfo: {
      current: currentKey,
      currentLabel: meta.label,
      next: meta.advanceTarget,
      nextLabel: meta.nextLabel,
      requiresApproval: meta.requiresApproval,
    },
    items: advanceItems,
  };

  // Dept strip — derived server-side from the linked FG (G3+); pre-G3 = all pending.
  const deptStatuses = linkedFg?.deptStatuses ?? ALL_PENDING_DEPTS;
  const deptStripItems: DeptStatusItem[] = DEPT_KEYS.map((deptKey, i) => ({
    dept: deptKey,
    label: labels.deptStrip.labels[deptKey],
    status: deptStatuses[deptKey],
    index: i + 1,
  }));

  return (
    <main className="flex w-full flex-col gap-3">
      {/* ProjectHeader (prototype project.jsx:22-43) */}
      <ProjectHeader
        project={headerView}
        labels={labels.header}
        advanceModal={advanceModal}
        canAdvance={canAdvance}
        advanceProjectGate={advanceAdapter}
      />

      {/* StageRail (prototype project.jsx:4-20) */}
      <StageRail
        stages={stageRailItems}
        currentIndex={currentRailIndex}
        ariaLabel={labels.stageRailAriaLabel}
      />

      {/* 7-DEPT STATUS STRIP (product-owner addition; reuses fa-screens.jsx:365-385) */}
      <DeptStatusStrip
        items={deptStripItems}
        ariaLabel={labels.deptStrip.ariaLabel}
        statusLabels={labels.deptStrip.statusLabels}
      />
      {!linkedFg ? (
        <p
          className="muted"
          style={{ fontSize: 12, marginTop: -4 }}
          data-testid="project-detail-dept-pending-caption"
        >
          {labels.deptStrip.pendingCaption}
        </p>
      ) : null}
    </main>
  );
}
