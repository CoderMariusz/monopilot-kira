/**
 * Legacy /costing route — redirects to the merged Costing + Nutrition stage (D5).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/costing
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type CostingRedirectProps = {
  params?: Promise<{ locale: string; projectId: string }>;
};

export default async function CostingRedirectPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as CostingRedirectProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  redirect(`/${locale}/pipeline/${projectId}/costing-nutrition`);
}
