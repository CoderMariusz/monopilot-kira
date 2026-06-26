/**
 * NPD project workbench layout (RSC) — owns the PERSISTENT project header + the
 * 8-stage operational stepper that frame the project index AND every per-stage
 * child route (brief/formulation/packaging/trial/sensory/pilot/approval/handoff).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/*
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:22-43 (ProjectHeader)
 *     - breadcrumb "NPD / Pipeline / {code}", title + stage badge + priority badge,
 *       muted "{code} · {type} · Owner · Target launch", Watch/Duplicate/Advance.
 *   prototypes/design/Monopilot Design System/npd/project.jsx:4-20 (StageRail)
 *     - horizontal numbered rail of the 8 OPERATIONAL stages; earlier → ✓ done,
 *       current → active, later → number; clicking a stage navigates to it.
 *
 * Why the layout (not the page) owns these: the header + rail must persist across
 * every stage route, and the user complaint was that the index page showed a
 * SECOND, redundant G0-G4 gate rail ("too many tabs instead of a header"). The
 * G0-G4 gate stepper has been removed from the index page; the canonical operational
 * navigation now lives here, once.
 *
 * Real-data wiring (NO mocks): the project summary comes from the MERGED `getProject`
 * Server Action (org-scoped via withOrgContext + RLS). `current_stage` (mig 242)
 * drives the rail's done/active state. The Advance button keeps calling the EXISTING
 * advanceProjectGate action (full 8-step advance semantics is a later phase).
 *
 * Next 16 RSC safety: the layout resolves locale/projectId + localized strings
 * server-side and hands the client islands ONLY serializable props (strings/data)
 * plus the advanceProjectGate Server Action (a Server Action, not a raw function).
 * PROJECT_STAGES is imported from the non-'use client' sibling so this Server
 * Component gets the real array (see project-stages.ts header).
 *
 * i18n: stepper labels via `npd.stepper.*`; header/states via `npd.projectDetail.*`.
 */

import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { getProject } from '../../../../../(npd)/pipeline/_actions/get-project';
import { advanceProjectGate as advanceProjectGateAction } from '../../../../../(npd)/pipeline/_actions/advance-project-gate';
import { deleteProject as deleteProjectAction } from '../../../../../(npd)/pipeline/_actions/delete-project';
import { cloneProject as cloneProjectAction } from '../../../../../(npd)/pipeline/_actions/clone-project';
import { createOrMapFgCandidateAtG3 as createOrMapFgCandidateAtG3Action } from '../../../../../(npd)/pipeline/_actions/create-or-map-fg-candidate-at-g3';
import {
  advanceTransitionForStage,
  nextStage,
} from '../../../../../(npd)/pipeline/_actions/_lib/gate-helpers';
import {
  type ProjectGate,
  type ProjectPriority,
} from '../../../../../(npd)/pipeline/_actions/shared';
import type { TargetGate } from '../../../../../(npd)/_modals/advance-gate-modal';

import { ProjectStepper } from './_components/project-stepper';
import {
  ProjectHeader,
  type ProjectHeaderBadgeTone,
  type ProjectHeaderLabels,
  type ProjectHeaderView,
} from './_components/project-header';
import type { FgCandidateLabels } from './_components/fg-candidate-modal';
import { PROJECT_STAGES, type ProjectStageKey } from './_components/project-stages';

type ProjectLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string; projectId: string }>;
};

// ─── Stage-Gate metadata (static G0..G4; mirrors prototype GATE_INFO). ───
type GateKey = 'G0' | 'G1' | 'G2' | 'G3' | 'G4';

// Static gate display metadata ONLY (label + badge tone). The advance TRANSITION
// (next stage / target gate / e-sign requirement) is NOT static per gate — it is
// derived from the stage machine via advanceTransitionForStage, so the modal can
// never claim a target the engine will not land on (e.g. the old "G0 → G1" lie:
// the first advance is brief→recipe which derives G2; G1 is collapsed into the
// brief stage by the 2026-06-06 pivot and is never a forward target).
type GateMeta = {
  label: string;
  tone: ProjectHeaderBadgeTone;
};

const GATE_META: Record<GateKey, GateMeta> = {
  G0: { label: 'Idea', tone: 'gray' },
  G1: { label: 'Feasibility', tone: 'blue' },
  G2: { label: 'Business Case', tone: 'blue' },
  G3: { label: 'Development', tone: 'amber' },
  G4: { label: 'Testing', tone: 'amber' },
};

const PRIO_TONE: Record<ProjectPriority, ProjectHeaderBadgeTone> = {
  high: 'red',
  normal: 'amber',
  low: 'gray',
};

function isGateKey(gate: ProjectGate): gate is GateKey {
  return gate !== 'Launched';
}

const STEP_FALLBACKS: Record<ProjectStageKey, string> = {
  brief: 'Brief',
  recipe: 'Recipe',
  packaging: 'Packaging',
  trial: 'Trial',
  sensory: 'Sensory',
  pilot: 'Pilot',
  approval: 'Approval',
  handoff: 'Handoff',
};

const HEADER_DEFAULTS: ProjectHeaderLabels = {
  breadcrumbNpd: 'NPD',
  breadcrumbPipeline: 'Pipeline',
  ownerLabel: 'Owner',
  targetLabel: 'Target launch',
  noOwner: 'Unassigned',
  noTarget: 'Not set',
  watch: 'Watch',
  watchDisabledHint: 'Watching projects is not available yet.',
  duplicate: 'Duplicate',
  duplicateDisabledHint: 'You do not have permission to duplicate projects.',
  duplicating: 'Duplicating…',
  duplicateError: 'Could not duplicate the project. Try again.',
  advanceStage: 'Advance stage →',
  advanceDisabledHint: 'You do not have permission to advance this gate.',
  advanceTerminalHint: 'Launched — fully advanced',
  deleteProject: 'Delete',
  deleting: 'Deleting…',
  deleteConfirm: 'Delete this project? This cannot be undone.',
  deleteError: 'Could not delete the project. Try again.',
  deleteHasDependents: 'This project has downstream work (recipe/trial/…) and cannot be deleted.',
  gateChecklist: 'Gate checklist',
  createFg: 'Create / Link FG',
  openFg: 'Open FG',
};

// FG-candidate create/link modal defaults (mirrors the next-intl fallback pattern
// used for the header + advance modal). Friendly per-code error text — the modal
// never surfaces the raw action error code.
const FG_MODAL_DEFAULTS: FgCandidateLabels = {
  title: 'Create or link the Finished Good',
  subtitle: 'This project has no Finished Good yet. Create one or link an existing code for project',
  modeCreate: 'Create new FG',
  modeMap: 'Link existing FG',
  fieldCreateCode: 'New FG code',
  fieldCreateCodeHint: 'Suggested from the project code — edit it before creating if you need a different code.',
  fieldMapCode: 'Existing FG / product code',
  fieldMapCodeHint: 'Enter the code of an existing Finished Good to link to this project.',
  cancel: 'Cancel',
  submitCreate: 'Create FG',
  submitMap: 'Link FG',
  submitting: 'Saving…',
  errorInvalidInput: 'Enter a valid Finished Good code.',
  errorG3Only: 'A Finished Good can only be created once the project reaches the Business Case (G2) or Development (G3) gate.',
  errorFgAlreadyLinked: 'That Finished Good code is already linked to another active NPD project.',
  errorForbidden: 'You do not have permission to create a Finished Good for this project.',
  errorNotFound: 'This project could not be found. It may have been deleted.',
  errorGeneric: 'Could not create the Finished Good. Try again.',
};

const FG_MODAL_LABEL_KEYS = Object.keys(FG_MODAL_DEFAULTS) as Array<keyof FgCandidateLabels>;

const GATE_LABEL_DEFAULTS: Record<GateKey | 'Launched', string> = {
  G0: 'Idea',
  G1: 'Feasibility',
  G2: 'Business Case',
  G3: 'Development',
  G4: 'Testing',
  Launched: 'Launched',
};

const PRIO_LABEL_DEFAULTS: Record<ProjectPriority, string> = {
  high: 'High priority',
  normal: 'Normal priority',
  low: 'Low priority',
};

const ADVANCE_DEFAULTS = {
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
  blockersTitle: '{count} blocker(s) must be resolved first',
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
  recipeNeedsIngredient: 'Recipe has at least one ingredient',
  alreadyClosedError: 'This project is already launched — there is no further stage to advance to.',
  adjacencyError:
    'The project can only advance one stage at a time. Reload the page — the stage may have changed.',
  notFoundError: 'This project could not be found. It may have been deleted.',
  fgLinkedError: 'The Finished Good code is already linked to another active NPD project.',
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

// ─── Server-Action adapter passed to the client (the action itself is NOT authored here). ───
// The detail-page "Advance stage →" button drives a STAGE step. The modal still passes
// a `targetGate` (its gate-transition UI), but the engine is stage-native now: the
// adapter loads the project's real current_stage and advances exactly one operational
// stage (STAGE_ORDER). `targetGate` is accepted for the existing prop shape but ignored.
async function advanceAdapter(input: { projectId: string; targetGate: TargetGate; notes: string }) {
  'use server';
  const current = await getProject({ projectId: input.projectId });
  if (!current.ok) {
    return { ok: false as const, error: current.error, status: 400 };
  }
  const next = nextStage(current.data.project.currentStage);
  if (!next) {
    return { ok: false as const, error: 'ADJACENCY_VIOLATION', status: 422 };
  }
  const result = await advanceProjectGateAction({ projectId: input.projectId, targetStage: next });
  if (result.ok) return { ok: true as const, data: result.data };
  return { ok: false as const, error: result.error, status: result.status, blockers: result.blockers };
}

// Delete-project Server Action adapter (RBAC enforced inside deleteProject + only
// injected when canDelete). Returns the shape the header's DeleteProjectAction expects.
async function deleteAdapter(input: { projectId: string }) {
  'use server';
  const result = await deleteProjectAction(input.projectId);
  if (result.ok) return { ok: true as const };
  return { ok: false as const, error: result.error };
}

// Clone-project Server Action adapter (RBAC enforced inside cloneProject + only
// injected when canClone). Powers the header "Duplicate" button — creates a fresh
// G0/brief draft copying the project header + checklist items.
async function cloneAdapter(input: { sourceProjectId: string }) {
  'use server';
  const result = await cloneProjectAction({ sourceProjectId: input.sourceProjectId });
  if (result.ok) return { ok: true as const, data: { id: result.data.id, code: result.data.code } };
  return { ok: false as const, error: result.error };
}

// FG-candidate create/link Server Action adapter (RBAC enforced inside the action
// via npd.gate.advance + only injected when canAdvance). The action validates the
// G2/G3 gate and auto-generates FG-{code} when no productCode is given; its return
// envelope already matches the modal's CreateOrMapFgCandidateAction shape, so this
// is a thin 'use server' boundary wrapper.
async function fgCandidateAdapter(input: {
  projectId: string;
  mode: 'create' | 'map';
  productCode?: string | null;
}) {
  'use server';
  return createOrMapFgCandidateAtG3Action(input);
}

export default async function ProjectWorkbenchLayout({ children, params }: ProjectLayoutProps) {
  const { locale, projectId } = await params;

  const p = await pickerFor(locale, 'npd.projectDetail');
  const a = await pickerFor(locale, 'npd.advanceGateModal');
  const stepPick = await pickerFor(locale, 'npd.stepper');

  // 8-stage rail labels.
  const stepLabels = PROJECT_STAGES.reduce(
    (acc, stage) => {
      acc[stage.key] = stepPick(stage.i18nKey, STEP_FALLBACKS[stage.key]);
      return acc;
    },
    {} as Record<ProjectStageKey, string>,
  );
  const stepperAriaLabel = stepPick('ariaLabel', 'Project stages');

  // Load the project for the header + current_stage (real data, org-scoped).
  // Perf (#2): a SINGLE withOrgContext for the whole header — getProject now also
  // resolves the header permissions on the same connection, so the layout no longer
  // opens a second org-context cycle (each cycle = a getUser auth verify + the
  // owner-register/connect/set-context/commit round-trips).
  let result: Awaited<ReturnType<typeof getProject>>;
  let canAdvance = false;
  let canDelete = false;
  let canClone = false;
  try {
    result = await getProject({ projectId });
    if (result.ok) {
      canAdvance = result.data.permissions.canAdvance;
      canDelete = result.data.permissions.canDelete;
      canClone = result.data.permissions.canClone;
    }
  } catch (error) {
    console.error('[project-layout] header load failed:', error);
    result = { ok: false, error: 'PERSISTENCE_FAILED' };
  }

  // When the header cannot load (forbidden/not-found/error) we still render the
  // child (the page renders its own state panel) — but without the header/rail
  // chrome, which would otherwise show empty/garbled data.
  if (!result.ok) {
    return <div className="page-pad flex w-full flex-col">{children}</div>;
  }

  const { project, checklistByGate, recipeIngredientCount } = result.data;

  const headerLabels: ProjectHeaderLabels = {
    breadcrumbNpd: p('header.breadcrumbNpd', HEADER_DEFAULTS.breadcrumbNpd),
    breadcrumbPipeline: p('header.breadcrumbPipeline', HEADER_DEFAULTS.breadcrumbPipeline),
    ownerLabel: p('header.ownerLabel', HEADER_DEFAULTS.ownerLabel),
    targetLabel: p('header.targetLabel', HEADER_DEFAULTS.targetLabel),
    noOwner: p('header.noOwner', HEADER_DEFAULTS.noOwner),
    noTarget: p('header.noTarget', HEADER_DEFAULTS.noTarget),
    watch: p('header.watch', HEADER_DEFAULTS.watch),
    watchDisabledHint: p('header.watchDisabledHint', HEADER_DEFAULTS.watchDisabledHint),
    duplicate: p('header.duplicate', HEADER_DEFAULTS.duplicate),
    duplicateDisabledHint: p('header.duplicateDisabledHint', HEADER_DEFAULTS.duplicateDisabledHint),
    duplicating: p('header.duplicating', HEADER_DEFAULTS.duplicating),
    duplicateError: p('header.duplicateError', HEADER_DEFAULTS.duplicateError),
    advanceStage: p('header.advanceStage', HEADER_DEFAULTS.advanceStage),
    advanceDisabledHint: p('header.advanceDisabledHint', HEADER_DEFAULTS.advanceDisabledHint),
    advanceTerminalHint: p('header.advanceTerminalHint', HEADER_DEFAULTS.advanceTerminalHint),
    deleteProject: p('header.deleteProject', HEADER_DEFAULTS.deleteProject),
    deleting: p('header.deleting', HEADER_DEFAULTS.deleting),
    deleteConfirm: p('header.deleteConfirm', HEADER_DEFAULTS.deleteConfirm),
    deleteError: p('header.deleteError', HEADER_DEFAULTS.deleteError),
    deleteHasDependents: p('header.deleteHasDependents', HEADER_DEFAULTS.deleteHasDependents),
    gateChecklist: p('header.gateChecklist', HEADER_DEFAULTS.gateChecklist),
    createFg: p('header.createFg', HEADER_DEFAULTS.createFg),
    openFg: p('header.openFg', HEADER_DEFAULTS.openFg),
  };

  // FG-candidate modal labels (next-intl with graceful fallback, all four locales).
  const fgPick = await pickerFor(locale, 'npd.projectDetail.fgCandidateModal');
  const fgCandidateLabels = FG_MODAL_LABEL_KEYS.reduce((acc, key) => {
    acc[key] = fgPick(key, FG_MODAL_DEFAULTS[key]);
    return acc;
  }, {} as FgCandidateLabels);

  const currentGate = project.currentGate;
  const currentKey: GateKey = isGateKey(currentGate) ? currentGate : 'G4';
  const meta = GATE_META[currentKey];
  const gateLabel = p(
    `gate.${isGateKey(currentGate) ? currentGate : 'Launched'}`,
    GATE_LABEL_DEFAULTS[isGateKey(currentGate) ? currentGate : 'Launched'],
  );
  const gateTone: ProjectHeaderBadgeTone = currentGate === 'Launched' ? 'green' : meta.tone;

  // ── Canonical field: current_stage (current_gate is DERIVED from it at every
  // write — updateProjectStage/updateProjectGate). The header badge shows BOTH so
  // it can never look out of sync with the stage-based Kanban board ("Development/
  // G3 header while the card sits in Pilot" — clickthrough §3): "Pilot · G3
  // Development" and the Pilot column come from the same current_stage value. ──
  const stageDisplay =
    project.currentStage === 'launched'
      ? p('gate.Launched', GATE_LABEL_DEFAULTS.Launched)
      : (stepLabels[project.currentStage as ProjectStageKey] ?? project.currentStage);
  const headerBadgeLabel =
    currentGate === 'Launched' ? gateLabel : `${stageDisplay} · ${currentGate} ${gateLabel}`;

  // ── Honest advance transition, derived from the STAGE machine (never static
  // gate metadata). From brief (G0) the next step is recipe → gate G2 — the UI
  // must not claim G1, which is collapsed into the brief stage by design. ──
  const transition = advanceTransitionForStage(project.currentStage);
  const targetGate = (transition?.targetGate ?? 'Launched') as TargetGate;
  const targetGateLabel = p(`gate.${targetGate}`, GATE_LABEL_DEFAULTS[targetGate]);
  const targetStageLabel =
    transition && transition.nextStage !== 'launched'
      ? (stepLabels[transition.nextStage as ProjectStageKey] ?? transition.nextStage)
      : null;
  const nextLabel = targetStageLabel ? `${targetGateLabel} · ${targetStageLabel}` : targetGateLabel;

  const headerView: ProjectHeaderView = {
    id: project.id,
    code: project.code,
    name: project.name,
    type: project.type,
    owner: project.owner,
    targetLaunch: project.targetLaunch,
    gateLabel: headerBadgeLabel,
    gateTone,
    prioLabel: p(`prio.${project.prio}`, PRIO_LABEL_DEFAULTS[project.prio]),
    prioTone: PRIO_TONE[project.prio],
    currentGate: project.currentGate,
    productCode: project.productCode,
  };

  // Advance-modal props (resolved from the real getProject checklist).
  // Recipe stage exception: the only real completeness signal for leaving the recipe
  // stage is "≥1 ingredient" (enforced as a hard blocker server-side). The seeded G2
  // checklist (shelf-life / label / HACCP / business case) belongs to later stages, so
  // on the recipe stage we show ONLY the derived ingredient requirement instead.
  const currentChecklist = isGateKey(currentGate) ? (checklistByGate?.[currentGate] ?? []) : [];
  const advanceItems =
    project.currentStage === 'recipe'
      ? [
          {
            id: 'recipe-has-ingredient',
            text: a('recipeNeedsIngredient', ADVANCE_DEFAULTS.recipeNeedsIngredient),
            required: true,
            done: recipeIngredientCount > 0,
          },
        ]
      : currentChecklist.map((item) => ({
          id: item.id,
          text: item.itemText,
          required: item.required,
          done: item.done,
        }));
  const advanceModal = {
    labels: {
      title: a('title', ADVANCE_DEFAULTS.title),
      gateTransition: a('gateTransition', ADVANCE_DEFAULTS.gateTransition),
      currentTag: a('currentTag', ADVANCE_DEFAULTS.currentTag),
      targetTag: a('targetTag', ADVANCE_DEFAULTS.targetTag),
      approvalRequired: a('approvalRequired', ADVANCE_DEFAULTS.approvalRequired),
      checklistSummary: a('checklistSummary', ADVANCE_DEFAULTS.checklistSummary),
      done: a('done', ADVANCE_DEFAULTS.done),
      blocking: a('blocking', ADVANCE_DEFAULTS.blocking),
      optional: a('optional', ADVANCE_DEFAULTS.optional),
      requiredComplete: a('requiredComplete', ADVANCE_DEFAULTS.requiredComplete),
      blockersTitle: a('blockersTitle', ADVANCE_DEFAULTS.blockersTitle),
      requiredIncompleteWarning: a('requiredIncompleteWarning', ADVANCE_DEFAULTS.requiredIncompleteWarning),
      readyAlert: a('readyAlert', ADVANCE_DEFAULTS.readyAlert),
      notesLabel: a('notesLabel', ADVANCE_DEFAULTS.notesLabel),
      notesPlaceholder: a('notesPlaceholder', ADVANCE_DEFAULTS.notesPlaceholder),
      notesHint: a('notesHint', ADVANCE_DEFAULTS.notesHint),
      cancel: a('cancel', ADVANCE_DEFAULTS.cancel),
      advance: a('advance', ADVANCE_DEFAULTS.advance),
      advancing: a('advancing', ADVANCE_DEFAULTS.advancing),
      successTitle: a('successTitle', ADVANCE_DEFAULTS.successTitle),
      successBody: a('successBody', ADVANCE_DEFAULTS.successBody),
      loading: a('loading', ADVANCE_DEFAULTS.loading),
      empty: a('empty', ADVANCE_DEFAULTS.empty),
      error: a('error', ADVANCE_DEFAULTS.error),
      forbidden: a('forbidden', ADVANCE_DEFAULTS.forbidden),
      esignRequiredError: a('esignRequiredError', ADVANCE_DEFAULTS.esignRequiredError),
      blockersPresentError: a('blockersPresentError', ADVANCE_DEFAULTS.blockersPresentError),
      alreadyClosedError: a('alreadyClosedError', ADVANCE_DEFAULTS.alreadyClosedError),
      adjacencyError: a('adjacencyError', ADVANCE_DEFAULTS.adjacencyError),
      notFoundError: a('notFoundError', ADVANCE_DEFAULTS.notFoundError),
      fgLinkedError: a('fgLinkedError', ADVANCE_DEFAULTS.fgLinkedError),
    },
    project: { id: project.id, code: project.code, name: project.name, currentGate: currentKey },
    gateInfo: {
      current: currentKey,
      currentLabel: gateLabel,
      next: targetGate,
      nextLabel,
      // The only enforced approval checkpoint is the approval→handoff G4 e-sign
      // (assertG4ESignForHandoff); claiming approval on other steps was dishonest.
      requiresApproval: transition?.requiresESign ?? false,
    },
    items: advanceItems,
  };

  return (
    <div className="page-pad flex w-full flex-col gap-3">
      {/* PERSISTENT ProjectHeader (prototype project.jsx:22-43). */}
      <ProjectHeader
        project={headerView}
        labels={headerLabels}
        advanceModal={advanceModal}
        canAdvance={canAdvance}
        isTerminal={currentGate === 'Launched'}
        advanceProjectGate={advanceAdapter}
        canDelete={canDelete}
        deleteProject={deleteAdapter}
        canClone={canClone}
        cloneProject={canClone ? cloneAdapter : undefined}
        fgCandidate={{
          labels: fgCandidateLabels,
          // Suggested FG code (owner ASK-with-suggestion decision). The action
          // normalizes/uppercases; mirror its FG-{code} convention here so the
          // pre-filled value matches what an empty submit would generate.
          suggestedCode: `FG-${project.code}`,
          // The action gates on npd.gate.advance (same permission as Advance).
          canCreate: canAdvance,
          action: canAdvance ? fgCandidateAdapter : undefined,
        }}
      />

      {/* PERSISTENT 8-stage operational rail (prototype project.jsx:4-20). */}
      <ProjectStepper
        projectId={projectId}
        locale={locale}
        labels={stepLabels}
        ariaLabel={stepperAriaLabel}
        currentStageKey={project.currentStage}
      />

      {children}
    </div>
  );
}
