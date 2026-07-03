/**
 * Legacy /nutrition route — redirects to the merged Costing + Nutrition stage (D5).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/nutrition
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type NutritionRedirectProps = {
  params?: Promise<{ locale: string; projectId: string }>;
};

export default async function NutritionRedirectPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as NutritionRedirectProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  redirect(`/${locale}/pipeline/${projectId}/costing-nutrition`);
}
