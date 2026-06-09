/**
 * NPD project-stage Brief page (RSC).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/brief
 *   → live URL /[locale]/pipeline/[projectId]/brief (route groups add no segment).
 *
 * The project-stage view of the brief that CREATED this project. Server Component.
 * Reads REAL, org-scoped data via `withOrgContext` (RLS as app_user with
 * app.current_org_id()) through the `readProjectBrief` action. No mocks.
 *
 *   - public.brief (npd_project_id = [projectId])  → brief header (frozen post-conversion)
 *   - public.brief_lines                           → product line (name/volume/comments) + packaging
 *   - public.npd_projects                          → project name + target_launch (enrichment)
 *
 * REUSE of the existing brief read path (Postgres query only): the query mirrors
 * the brief-detail page structure — same `withOrgContext`, same `hasPermission`
 * shape, same `public.brief`/`public.brief_lines` columns + ::text decimal carry.
 * It resolves by the project→brief link `brief.npd_project_id` instead of by
 * brief_id, and shapes a read-oriented project-stage view (the brief is frozen).
 *
 * RBAC read: `npd.brief.read` (resolved server-side in the action, never trusted
 * from the client). If no brief is linked to the project, an empty state is shown.
 */

import { getTranslations } from 'next-intl/server';

import {
  ProjectBriefScreen,
  type ProjectBriefLabels,
} from './_components/project-brief-screen';
import {
  readProjectBrief,
  type ProjectBriefState,
  type ProjectBriefView,
} from './_actions/read-project-brief';
import { updateProjectBrief } from './_actions/update-project-brief';
import type { UpdateBriefCall, UpdateBriefOutcome } from './_components/edit-brief-modal';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  type OrgContextLike,
} from '../../../../../../(npd)/pipeline/_actions/shared';

export const dynamic = 'force-dynamic';

const WRITE_PERMISSION = 'npd.core.write';

type ProjectBriefPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors costing/nutrition/fa pages).
  data?: ProjectBriefView | null;
  state?: ProjectBriefState;
  canWrite?: boolean;
};

const DEFAULT_LABELS: ProjectBriefLabels = {
  cardTitle: 'Project brief',
  completed: 'Completed',
  fieldProductName: 'Product name',
  fieldCategory: 'Category',
  fieldTargetLaunch: 'Target launch date',
  fieldTargetPrice: 'Target retail price (EUR)',
  fieldPackFormat: 'Pack format',
  fieldPackWeight: 'Pack weight (g)',
  fieldSalesChannel: 'Sales channel',
  fieldExpectedVolume: 'Expected volume',
  fieldTargetAudience: 'Target audience',
  fieldMarketingClaims: 'Marketing claims',
  fieldConstraints: 'Constraints & requirements',
  fieldNotes: 'Notes',
  attachmentsTitle: 'Attachments',
  upload: 'Upload',
  uploadDisabledHint: 'Uploading attachments is not available yet.',
  attachmentsEmpty: 'No attachments on this brief.',
  notProvided: '—',
  loading: 'Loading brief…',
  empty: 'No brief linked to this project.',
  emptyBody: 'This project was created without a brief, or the brief is not visible to you.',
  error: 'Unable to load the brief.',
  forbidden: 'You do not have permission to view this brief.',
  editBrief: 'Edit brief',
  editModalTitle: 'Edit project brief',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  errInvalidInput: 'Some fields are invalid. Check the values and try again.',
  errForbidden: 'You do not have permission to edit this brief.',
  errNotFound: 'This project could not be found.',
  errPersistence: 'Could not save the brief. Please try again.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof ProjectBriefLabels>;

function translateLabel(t: (key: string) => string, key: keyof ProjectBriefLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<ProjectBriefLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.briefStage' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as ProjectBriefLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

// Server-side write capability — never trusted from the client. Resolved with
// the SAME permission the updateProjectBrief action enforces ('npd.core.write').
async function resolveCanWrite(): Promise<boolean> {
  try {
    return await withOrgContext(async (ctx) =>
      hasPermission(ctx as OrgContextLike, WRITE_PERMISSION),
    );
  } catch {
    return false;
  }
}

// Server Action adapter (passed across the RSC boundary, Next16 guard). Maps the
// reviewed action's discriminated result to the modal's UpdateBriefOutcome shape.
async function updateBriefAction(call: UpdateBriefCall): Promise<UpdateBriefOutcome> {
  'use server';
  const result = await updateProjectBrief(call);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export default async function ProjectBriefPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as ProjectBriefPageProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);

  const injected = props.data !== undefined || props.state !== undefined;
  const loaded = injected
    ? {
        state: props.state ?? (props.data ? 'ready' : 'empty'),
        data: props.data ?? null,
      }
    : await readProjectBrief(projectId);

  const canWrite =
    props.canWrite !== undefined
      ? props.canWrite
      : loaded.state === 'ready'
        ? await resolveCanWrite()
        : false;

  return (
    <ProjectBriefScreen
      state={loaded.state}
      data={loaded.data}
      labels={labels}
      canWrite={canWrite}
      onUpdate={updateBriefAction}
    />
  );
}
