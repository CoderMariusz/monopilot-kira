/**
 * NPD project-detail INDEX (RSC) — redirects straight to the Brief stage.
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]
 *
 * NPD always starts at the Brief. After creating a project (or opening one from
 * the pipeline list) the user should land directly on the Brief stage rather than
 * a bare index body — so this index immediately redirects to ./brief. The
 * persistent ProjectHeader + 8-stage rail live in layout.tsx and wrap every stage
 * route, so nothing is lost by skipping the standalone index.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type ProjectDetailPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
};

export default async function ProjectDetailPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as ProjectDetailPageProps;
  const { locale, projectId } = props.params ? await props.params : { locale: 'en', projectId: '' };
  redirect(`/${locale}/pipeline/${projectId}/brief`);
}
