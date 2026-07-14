/**
 * NPD project-detail INDEX (RSC) — redirects to the project's CURRENT stage.
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]
 *
 * Opening a project (from the pipeline card or after creation) should land on the
 * stage the project is actually on — not always Brief. We read current_stage and
 * redirect to its route segment (recipe→/formulation, etc.). A brand-new project is
 * at 'brief'; a project advanced to recipe lands on /formulation, and so on. If the
 * A missing project renders the route's 404 boundary; other loader failures fall
 * back to /brief so its own page can render the error state.
 *
 * The persistent header + 8-stage rail live in layout.tsx and wrap every stage route.
 */

import { notFound, redirect } from 'next/navigation';

import { getProject } from '../../../../../(npd)/pipeline/_actions/get-project';
import { PROJECT_STAGES } from './_components/project-stages';

export const dynamic = 'force-dynamic';

type ProjectDetailPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

  let result: Awaited<ReturnType<typeof getProject>> | undefined;
  try {
    result = await getProject({ projectId });
  } catch {
    // fall through to /brief — the stage page renders its own error/empty state.
  }
  if (result && !result.ok && result.error === 'NOT_FOUND') notFound();
  const segment = result?.ok ? segmentForStage(result.data.project.currentStage) : 'brief';

  // Preserve query params across the redirect — the Kanban "Advance →" deep-links to
  // /pipeline/[id]?modal=advanceGate (F-C08: the advance must route through the gate
  // modal) and the AdvanceGateModalHost on the stage route opens from ?modal=.
  const rawSearch = props.searchParams ? await props.searchParams : undefined;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rawSearch ?? {})) {
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === 'string') params.set(key, single);
  }
  const query = params.toString();

  redirect(`/${locale}/pipeline/${projectId}/${segment}${query ? `?${query}` : ''}`);
}
