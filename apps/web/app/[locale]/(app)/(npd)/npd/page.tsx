/**
 * C7b consolidation — NPD dashboard folded into the pipeline list.
 *
 * Route: /[locale]/(app)/(npd)/npd
 *
 * The pipeline list is the canonical NPD home; per-dept widgets and launch-alert
 * tables from the old dashboard are deferred.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type NpdDashboardRedirectProps = {
  params?: Promise<{ locale: string }>;
};

export default async function NpdDashboardRedirectPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as NpdDashboardRedirectProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };

  redirect(`/${locale}/pipeline`);
}
