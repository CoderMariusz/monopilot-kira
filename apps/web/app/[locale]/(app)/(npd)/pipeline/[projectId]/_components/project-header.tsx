'use client';

/**
 * ProjectHeader — NPD project-detail header + action buttons (client island).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:22-43 (ProjectHeader)
 *   - breadcrumb NPD / Pipeline / {code}
 *   - page-head: project.name + stage/gate badge + priority badge
 *   - muted sub-line: code · type · Owner · Target launch
 *   - buttons: "⚑ Watch" / "Duplicate" / "Advance stage →"
 *
 * Translation notes (project.jsx:22-43):
 *   - window.stageColor / window.NPD_STAGES.find / window.prioBadge mocks → the
 *     gate label + badge tone + priority text are resolved server-side and passed
 *     in as already-localized strings (labels.*) + the stage/prio tone props.
 *   - openModal('advanceGate'|'gateApproval', { project }) → wires the EXISTING
 *     AdvanceGateModal flow via the shared query-trigger host (?modal=advanceGate).
 *     This island NEVER queries the DB and NEVER authors the advance action — the
 *     advanceProjectGate Server Action is injected from the page (Server boundary).
 *   - "Duplicate" → REAL cloneProject Server Action (injected from the layout when
 *     npd.project.create is granted): creates a fresh G0/brief draft copying this
 *     project's header + checklist items, then navigates to the new project. When the
 *     user lacks the permission the button is honestly disabled with a tooltip.
 *   - "⚑ Watch" → per-user project follow. NO backing table exists yet (a watchers
 *     table needs a migration), so the affordance is honestly disabled with a tooltip
 *     rather than faking the behaviour (see report — deferred, needs migration).
 *
 * Next 16 RSC contract: the page passes a Server Action (advanceProjectGate), not a
 * raw client function. This island owns its own button callbacks; the modal host is
 * a sibling client component driven by URL query state.
 */

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

import {
  AdvanceGateModalHost,
  ADVANCE_GATE_MODAL_PARAM,
} from '../../../../../../(npd)/_modals/advance-gate-modal-host';
import type {
  AdvanceGateInfo,
  AdvanceGateItem,
  AdvanceGateLabels,
  AdvanceGateProject,
  AdvanceProjectGateAction,
} from '../../../../../../(npd)/_modals/advance-gate-modal';
import {
  FgCandidateModal,
  type CreateOrMapFgCandidateAction,
  type FgCandidateLabels,
} from './fg-candidate-modal';

/** Query value that opens the FG-candidate modal (trigger + modal share this island). */
const FG_CANDIDATE_MODAL_PARAM = 'fgCandidate';

export type ProjectHeaderBadgeTone = 'green' | 'blue' | 'amber' | 'red' | 'gray';
export type ProjectGate = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'Launched';

export type ProjectHeaderLabels = {
  breadcrumbNpd: string;
  breadcrumbPipeline: string;
  /** Sub-line template: "{code} · {type} · {ownerLabel}: {owner} · {targetLabel}: {target}". */
  ownerLabel: string;
  targetLabel: string;
  noOwner: string;
  noTarget: string;
  watch: string;
  watchDisabledHint: string;
  duplicate: string;
  duplicateDisabledHint: string;
  duplicating: string;
  duplicateError: string;
  advanceStage: string;
  advanceDisabledHint: string;
  /** Shown on the (disabled) Advance control once the project is Launched (terminal). */
  advanceTerminalHint: string;
  deleteProject: string;
  deleting: string;
  deleteConfirm: string;
  deleteError: string;
  deleteHasDependents: string;
  /** Label for the link to the gate checklist page (where items are ticked). */
  gateChecklist: string;
  /** "Create / Link FG" header button (shown at G2/G3 when no FG is linked yet). */
  createFg: string;
  /** "Open FG" link label (shown once the project has a linked product_code). */
  openFg: string;
};

export type DeleteProjectAction = (
  input: { projectId: string },
) => Promise<{ ok: true } | { ok: false; error: string }>;

export type CloneProjectAction = (
  input: { sourceProjectId: string },
) => Promise<{ ok: true; data: { id: string; code: string } } | { ok: false; error: string }>;

export type ProjectHeaderView = {
  id: string;
  code: string;
  name: string;
  type: string;
  owner: string | null;
  targetLaunch: string | null;
  /** Already-localized gate/stage badge label. */
  gateLabel: string;
  /**
   * Optional already-localized tooltip for the gate badge. Used to explain the
   * G0–G1 merge at the initial gate (G1 "Feasibility" is collapsed into the Brief
   * stage by the 2026-06-06 pivot and is never a forward advance target, so it is
   * never shown as its own stepper step). Rendered as the badge's native `title`.
   */
  gateLabelHint?: string | null;
  gateTone: ProjectHeaderBadgeTone;
  /** Already-localized priority badge label. */
  prioLabel: string;
  prioTone: ProjectHeaderBadgeTone;
  /** Raw current gate (drives the G2/G3 FG-candidate affordance — never client-trusted for writes). */
  currentGate: ProjectGate;
  /** Linked FG/product code, or null until an FG candidate is created/mapped. */
  productCode: string | null;
};

export type ProjectHeaderProps = {
  project: ProjectHeaderView;
  labels: ProjectHeaderLabels;
  /** Advance-modal props (resolved server-side from getProject). */
  advanceModal: {
    labels: AdvanceGateLabels;
    project: AdvanceGateProject;
    gateInfo: AdvanceGateInfo;
    items: AdvanceGateItem[];
  };
  /** Server-resolved permission to advance the gate (never client-trusted). */
  canAdvance: boolean;
  /**
   * True once the project has reached the terminal Launched gate. The Advance
   * affordance is hidden entirely (no stale "advance to G4: Testing" modal on a
   * launched project — FINAL-NIGHT gap 3). Resolved server-side from the real
   * current_gate; never client-trusted.
   */
  isTerminal?: boolean;
  /** Injected only when the user may advance (RBAC resolved server-side). */
  advanceProjectGate?: AdvanceProjectGateAction;
  /** Server-resolved permission to delete the project (never client-trusted). */
  canDelete?: boolean;
  /** Injected only when the user may delete (RBAC resolved server-side). */
  deleteProject?: DeleteProjectAction;
  /** Server-resolved permission to duplicate the project (= npd.project.create). */
  canClone?: boolean;
  /** Injected only when the user may create projects (RBAC resolved server-side). */
  cloneProject?: CloneProjectAction;
  /**
   * FG-candidate affordance bundle. Fixes the "Finished Good not found" dead-end:
   * at gate G2/G3 with no linked product_code, the user can create/link the FG via
   * createOrMapFgCandidateAtG3. Once linked, the header instead offers "Open FG".
   */
  fgCandidate: {
    labels: FgCandidateLabels;
    /** Suggested FG code `FG-{code}` pre-filled in Create mode (owner decision). */
    suggestedCode: string;
    /** Server-resolved permission to create/map the FG candidate (= npd.gate.advance). */
    canCreate: boolean;
    /** Injected only when the user may advance the gate (RBAC resolved server-side). */
    action?: CreateOrMapFgCandidateAction;
  };
};

export function ProjectHeader({
  project,
  labels,
  advanceModal,
  canAdvance,
  isTerminal = false,
  advanceProjectGate,
  canDelete,
  deleteProject,
  canClone,
  cloneProject,
  fgCandidate,
}: ProjectHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = pathname?.split('/').filter(Boolean)[0] ?? 'en';
  const [deleting, setDeleting] = React.useState(false);
  const [duplicating, setDuplicating] = React.useState(false);

  const openAdvance = React.useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('modal', ADVANCE_GATE_MODAL_PARAM);
    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  // ── FG-candidate affordance (dead-end fix). The button + modal live in the SAME
  // island so the button is robust on a fresh hard load (no cross-island race —
  // see fa-create-host.tsx). Shown only at gate G2/G3 with no FG linked yet. ──
  const fgModalOpen = searchParams?.get('modal') === FG_CANDIDATE_MODAL_PARAM;
  const showFgCreate =
    (project.currentGate === 'G2' || project.currentGate === 'G3') && !project.productCode;

  const openFgModal = React.useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('modal', FG_CANDIDATE_MODAL_PARAM);
    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  const closeFgModal = React.useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete('modal');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : (pathname ?? '/'));
  }, [pathname, router, searchParams]);

  const onFgCreated = React.useCallback(
    (_productCode: string) => {
      // Stay on the recipe/pipeline stage after minting the FG candidate — the user is
      // still mid-recipe (ingredients, packaging, production detail) and jumping to the
      // /fg detail page yanks them out of the flow. Just close the modal and refresh so
      // the now-assigned product_code shows in the header.
      closeFgModal();
      router.refresh();
    },
    [closeFgModal, router],
  );

  const onDelete = React.useCallback(async () => {
    if (!deleteProject || deleting) return;
    if (!window.confirm(labels.deleteConfirm)) return;
    setDeleting(true);
    try {
      const result = await deleteProject({ projectId: project.id });
      if (result.ok) {
        const locale = pathname?.split('/').filter(Boolean)[0] ?? 'en';
        router.push(`/${locale}/pipeline`);
        return;
      }
      window.alert(result.error === 'HAS_DEPENDENTS' ? labels.deleteHasDependents : labels.deleteError);
      setDeleting(false);
    } catch {
      window.alert(labels.deleteError);
      setDeleting(false);
    }
  }, [deleteProject, deleting, labels.deleteConfirm, labels.deleteError, labels.deleteHasDependents, pathname, project.id, router]);

  const onDuplicate = React.useCallback(async () => {
    if (!cloneProject || duplicating) return;
    setDuplicating(true);
    try {
      const result = await cloneProject({ sourceProjectId: project.id });
      if (result.ok) {
        const locale = pathname?.split('/').filter(Boolean)[0] ?? 'en';
        router.push(`/${locale}/pipeline/${result.data.id}`);
        return;
      }
      window.alert(labels.duplicateError);
      setDuplicating(false);
    } catch {
      window.alert(labels.duplicateError);
      setDuplicating(false);
    }
  }, [cloneProject, duplicating, labels.duplicateError, pathname, project.id, router]);

  const canDuplicate = Boolean(canClone && cloneProject);

  return (
    <section aria-label={project.name} data-testid="project-header">
      <nav aria-label="breadcrumb" className="breadcrumb">
        {labels.breadcrumbNpd} / {labels.breadcrumbPipeline} /{' '}
        <span className="mono">{project.code}</span>
      </nav>

      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {project.name}
            </h1>
            <span
              className={`badge badge-${project.gateTone}`}
              title={project.gateLabelHint ?? undefined}
              data-testid="project-header-gate"
            >
              {project.gateLabel}
            </span>
            <span className={`badge badge-${project.prioTone}`} data-testid="project-header-prio">
              {project.prioLabel}
            </span>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }} data-testid="project-header-meta">
            <span className="mono">{project.code}</span> · {project.type} · {labels.ownerLabel}:{' '}
            {project.owner ?? labels.noOwner} · {labels.targetLabel}:{' '}
            {project.targetLaunch ?? labels.noTarget}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* Watch: per-user follow needs a watchers table (migration) — honestly
              disabled with a tooltip until that lands. Never faked. */}
          <button
            type="button"
            className="btn btn-secondary"
            disabled
            title={labels.watchDisabledHint}
            aria-label={labels.watchDisabledHint}
            data-testid="project-header-watch"
          >
            ⚑ {labels.watch}
          </button>
          {/* Duplicate: real cloneProject Server Action when the user may create
              projects; otherwise an honest disabled affordance (RBAC, never faked). */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={canDuplicate ? onDuplicate : undefined}
            disabled={!canDuplicate || duplicating}
            title={canDuplicate ? undefined : labels.duplicateDisabledHint}
            aria-label={canDuplicate ? labels.duplicate : labels.duplicateDisabledHint}
            data-testid="project-header-duplicate"
          >
            {duplicating ? labels.duplicating : labels.duplicate}
          </button>
          {canDelete && deleteProject ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={onDelete}
              disabled={deleting}
              data-testid="project-header-delete"
            >
              {deleting ? labels.deleting : labels.deleteProject}
            </button>
          ) : null}
          {/* Gate checklist: the tickable G0-G4 checklist lives on its own page
              (/pipeline/[id]/gate) and was previously unreachable from any rendered
              surface — the "Advance stage" modal only shows a READ-ONLY summary. This
              link makes the place you actually tick items reachable, next to Advance. */}
          <Link
            href={`/${locale}/pipeline/${project.id}/gate`}
            prefetch={false}
            className="btn btn-secondary"
            data-testid="project-header-gate-checklist"
          >
            {labels.gateChecklist}
          </Link>
          {/* FG-candidate affordance (dead-end fix): once an FG is linked, jump to
              its detail page; at G2/G3 with no FG yet, open the create/link modal.
              Hidden entirely on other gates (the FG candidate only exists at G2/G3). */}
          {project.productCode ? (
            <Link
              href={`/${locale}/pipeline/${project.id}`}
              prefetch={false}
              className="btn btn-secondary"
              data-testid="project-header-open-fg"
            >
              {labels.openFg}
            </Link>
          ) : showFgCreate ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={openFgModal}
              data-testid="project-header-create-fg"
            >
              {labels.createFg}
            </button>
          ) : null}
          {/* Launched is terminal: there is no next gate, so the Advance
              affordance is hidden entirely (no stale "advance to G4: Testing"
              modal on a launched project). */}
          {isTerminal ? (
            <span
              className="badge badge-green"
              title={labels.advanceTerminalHint}
              data-testid="project-header-advance-terminal"
            >
              {labels.advanceTerminalHint}
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={openAdvance}
              disabled={!canAdvance || !advanceProjectGate}
              title={!canAdvance ? labels.advanceDisabledHint : undefined}
              data-testid="project-header-advance"
            >
              {labels.advanceStage}
            </button>
          )}
        </div>
      </div>

      {/* EXISTING AdvanceGateModal flow, driven by ?modal=advanceGate. Suppressed
          on the terminal Launched gate (a stale query param must not reopen it). */}
      {isTerminal ? null : (
        <AdvanceGateModalHost
          labels={advanceModal.labels}
          project={advanceModal.project}
          gateInfo={advanceModal.gateInfo}
          items={advanceModal.items}
          state="ready"
          advanceProjectGate={advanceProjectGate}
        />
      )}

      {/* FG-candidate create/link modal — same island as its trigger (dead-end fix).
          Only mounted while the affordance is relevant (G2/G3, no FG linked). */}
      {showFgCreate ? (
        <FgCandidateModal
          open={fgModalOpen}
          projectId={project.id}
          projectCode={project.code}
          suggestedCode={fgCandidate.suggestedCode}
          labels={fgCandidate.labels}
          action={fgCandidate.canCreate ? fgCandidate.action : undefined}
          onCreated={onFgCreated}
          onClose={closeFgModal}
        />
      ) : null}
    </section>
  );
}

export default ProjectHeader;
