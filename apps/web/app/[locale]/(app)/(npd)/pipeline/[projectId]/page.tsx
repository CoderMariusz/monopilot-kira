/**
 * NPD project-detail INDEX (RSC) — redirects to the project's CURRENT stage.
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]
 *
 * Opening a project (from the pipeline card or after creation) should land on the
 * stage the project is actually on — not always Brief. We read current_stage and
 * redirect to its route segment (recipe→/formulation, etc.). A brand-new project is
 * at 'brief'; a project advanced to recipe lands on /formulation, and so on. If the
 * project can't be loaded we fall back to /brief (its own page renders the state).
 *
 * The persistent header + 8-stage rail live in layout.tsx and wrap every stage route.
 */

import { redirect } from 'next/navigation';

import { getProject } from '../../../../../(npd)/pipeline/_actions/get-project';
import { PROJECT_STAGES } from './_components/project-stages';

export const dynamic = 'force-dynamic';

type ProjectDetailPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
};

/** Map a current_stage value → its route segment (e.g. 'recipe' → 'formulation'). */
function segmentForStage(stage: string | undefined): string {
  const match = PROJECT_STAGES.find((s) => s.key === stage);
  if (match) return match.segment;
  // 'launched' (terminal) → land on the last operational stage; anything else → brief.
  return stage === 'launched' ? 'handoff' : 'brief';
}

export default async function ProjectDetailPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as ProjectDetailPageProps;
  const { locale, projectId } = props.params ? await props.params : { locale: 'en', projectId: '' };

  let segment = 'brief';
  try {
    const result = await getProject({ projectId });
    if (result.ok) segment = segmentForStage(result.data.project.currentStage);
  } catch {
    // fall through to /brief — the stage page renders its own error/empty state.
  }

  redirect(`/${locale}/pipeline/${projectId}/${segment}`);
}
