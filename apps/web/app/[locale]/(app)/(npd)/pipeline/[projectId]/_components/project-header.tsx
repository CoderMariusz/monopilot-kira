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
 *   - "⚑ Watch" / "Duplicate" → NO backend exists yet (no watch/duplicate Server
 *     Action). Rendered per prototype but disabled with a tooltip rather than
 *     faking the behaviour (see report).
 *
 * Next 16 RSC contract: the page passes a Server Action (advanceProjectGate), not a
 * raw client function. This island owns its own button callbacks; the modal host is
 * a sibling client component driven by URL query state.
 */

import React from 'react';
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

export type ProjectHeaderBadgeTone = 'green' | 'blue' | 'amber' | 'red' | 'gray';

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
  advanceStage: string;
  advanceDisabledHint: string;
  deleteProject: string;
  deleting: string;
  deleteConfirm: string;
  deleteError: string;
  deleteHasDependents: string;
};

export type DeleteProjectAction = (
  input: { projectId: string },
) => Promise<{ ok: true } | { ok: false; error: string }>;

export type ProjectHeaderView = {
  id: string;
  code: string;
  name: string;
  type: string;
  owner: string | null;
  targetLaunch: string | null;
  /** Already-localized gate/stage badge label. */
  gateLabel: string;
  gateTone: ProjectHeaderBadgeTone;
  /** Already-localized priority badge label. */
  prioLabel: string;
  prioTone: ProjectHeaderBadgeTone;
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
  /** Injected only when the user may advance (RBAC resolved server-side). */
  advanceProjectGate?: AdvanceProjectGateAction;
  /** Server-resolved permission to delete the project (never client-trusted). */
  canDelete?: boolean;
  /** Injected only when the user may delete (RBAC resolved server-side). */
  deleteProject?: DeleteProjectAction;
};

export function ProjectHeader({
  project,
  labels,
  advanceModal,
  canAdvance,
  advanceProjectGate,
  canDelete,
  deleteProject,
}: ProjectHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [deleting, setDeleting] = React.useState(false);

  const openAdvance = React.useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('modal', ADVANCE_GATE_MODAL_PARAM);
    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

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
            <span className={`badge badge-${project.gateTone}`} data-testid="project-header-gate">
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
          {/* Watch / Duplicate: no backend yet — disabled per prototype, never faked. */}
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
          <button
            type="button"
            className="btn btn-secondary"
            disabled
            title={labels.duplicateDisabledHint}
            aria-label={labels.duplicateDisabledHint}
            data-testid="project-header-duplicate"
          >
            {labels.duplicate}
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
        </div>
      </div>

      {/* EXISTING AdvanceGateModal flow, driven by ?modal=advanceGate. */}
      <AdvanceGateModalHost
        labels={advanceModal.labels}
        project={advanceModal.project}
        gateInfo={advanceModal.gateInfo}
        items={advanceModal.items}
        state="ready"
        advanceProjectGate={advanceProjectGate}
      />
    </section>
  );
}

export default ProjectHeader;
