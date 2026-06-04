/**
 * T-059 — Pipeline Kanban page (NPD Stage-Gate pipeline).
 *
 * Server Component. Reads REAL, org-scoped projects from public.npd_projects via
 * the MERGED `listProjects` Server Action (T-057) — RLS-enforced as app_user with
 * app.current_org_id(). No mocks, no hard-coded rows. The gate move is wired to the
 * MERGED `advanceProjectGate` Server Action (T-058), passed as a prop to the client
 * Kanban (adjacency-guarded; 422 ADJACENCY_VIOLATION → optimistic revert in the UI).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:19-52 (KanbanCard + KanbanView)
 *
 * Conflict deviation (closeout deviation log): the canonical KanbanView prototype is
 * @deprecated (legacy R&D stage model, read-only). The production board is the
 * Stage-Gate model (G0..Launched) and the gate move is the merged advanceProjectGate
 * action; the prototype's onClick(open) drag is translated to an explicit, accessible
 * "Advance" affordance (not @dnd-kit drag, which is not a workspace dependency).
 *
 * RBAC (server-side, never client-trusted):
 *   - read gate    → npd.project.view  (PROJECT_VIEW_PERMISSION; mirrors listProjects)
 *   - canAdvance   → npd.gate.advance  (GATE_ADVANCE_PERMISSION)
 */

import { getTranslations } from 'next-intl/server';

import { advanceProjectGate } from '../../../../(npd)/pipeline/_actions/advance-project-gate';
import { listProjects } from '../../../../(npd)/pipeline/_actions/list-projects';
import { GATE_ADVANCE_PERMISSION } from '../../../../(npd)/pipeline/_actions/_lib/gate-helpers';
import {
  PROJECT_VIEW_PERMISSION,
  hasPermission,
  type OrgContextLike,
  type ProjectSummary,
} from '../../../../(npd)/pipeline/_actions/shared';
import { withOrgContext } from '../../../../../lib/auth/with-org-context';
import { KanbanView } from './_components/kanban-view';
import type {
  AdvanceInput,
  AdvanceResult,
  KanbanLabels,
  KanbanProject,
  PageState,
} from './_components/kanban-types';

export const dynamic = 'force-dynamic';

type PipelinePageProps = {
  params?: Promise<{ locale: string }>;
  // Test-only injection seam (mirrors briefs/fa page convention).
  projects?: KanbanProject[];
  canAdvance?: boolean;
  state?: PageState;
};

type LoaderResult = {
  state: PageState;
  projects: KanbanProject[];
  canAdvance: boolean;
};

const DEFAULT_LABELS: KanbanLabels = {
  title: 'Pipeline',
  subtitle: 'Stage-Gate pipeline — projects by gate',
  gateG0: 'G0 · Concept',
  gateG1: 'G1 · Brief',
  gateG2: 'G2 · Recipe',
  gateG3: 'G3 · Trial',
  gateG4: 'G4 · Approval',
  gateLaunched: 'Launched',
  prioHigh: 'High',
  prioNormal: 'Normal',
  prioLow: 'Low',
  advance: 'Advance →',
  advancing: 'Advancing…',
  noOwner: 'Unassigned',
  noTarget: 'No target',
  columnEmpty: '—',
  open: 'Open',
  loading: 'Loading pipeline…',
  empty: 'No projects in the pipeline',
  emptyBody: 'Start a new Stage-Gate project to populate the board.',
  error: 'Unable to load the pipeline. Try again after the backend is available.',
  forbidden: 'You do not have permission to view the pipeline.',
  advanceError: 'Could not advance the project. The change was reverted.',
  adjacencyError: 'Projects can only advance to the next gate. The change was reverted.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof KanbanLabels>;

function translateLabel(t: (key: string) => string, key: keyof KanbanLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<KanbanLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.pipelineKanban' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as KanbanLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

function toKanbanProject(summary: ProjectSummary): KanbanProject {
  return {
    id: summary.id,
    code: summary.code,
    name: summary.name,
    type: summary.type,
    currentGate: summary.currentGate,
    prio: summary.prio,
    owner: summary.owner,
    targetLaunch: summary.targetLaunch,
    progressPercent: summary.progressPercent,
  };
}

async function readPageData(): Promise<LoaderResult> {
  try {
    const canAdvance = await withOrgContext(async (rawCtx): Promise<boolean> => {
      const ctx = rawCtx as OrgContextLike;
      const [canRead, canAdv] = await Promise.all([
        hasPermission(ctx, PROJECT_VIEW_PERMISSION),
        hasPermission(ctx, GATE_ADVANCE_PERMISSION),
      ]);
      // Surface the read gate via a thrown sentinel so the outer block can map it.
      if (!canRead) throw new ForbiddenError();
      return canAdv;
    });

    const result = await listProjects({});
    if (!result.ok) {
      if (result.error === 'FORBIDDEN') {
        return { state: 'permission_denied', projects: [], canAdvance: false };
      }
      return { state: 'error', projects: [], canAdvance };
    }

    const projects = result.data.projects.map(toKanbanProject);
    return { state: projects.length === 0 ? 'empty' : 'ready', projects, canAdvance };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { state: 'permission_denied', projects: [], canAdvance: false };
    }
    console.error('[pipeline-kanban] org-scoped read failed:', error);
    return { state: 'error', projects: [], canAdvance: false };
  }
}

class ForbiddenError extends Error {}

/** Server Action adapter passed to the client (T-058 owns advanceProjectGate). */
async function advanceActionAdapter(input: AdvanceInput): Promise<AdvanceResult> {
  'use server';
  const result = await advanceProjectGate(input);
  if (result.ok) {
    return { ok: true, data: { currentGate: result.data.currentGate } };
  }
  return { ok: false, error: result.error, status: result.status };
}

export default async function PipelineKanbanPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as PipelinePageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };

  const labels = await buildLabels(locale);

  const injected = Array.isArray(props.projects);
  const loaded: LoaderResult = injected
    ? {
        state: props.state ?? ((props.projects?.length ?? 0) === 0 ? 'empty' : 'ready'),
        projects: props.projects ?? [],
        canAdvance: props.canAdvance ?? false,
      }
    : await readPageData();

  return (
    <KanbanView
      projects={loaded.projects}
      labels={labels}
      canAdvance={props.canAdvance ?? loaded.canAdvance}
      state={props.state ?? loaded.state}
      advanceAction={advanceActionAdapter}
    />
  );
}
