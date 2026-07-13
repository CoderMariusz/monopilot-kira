/**
 * C1 consolidation — /fg list folded into /pipeline.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type FgListRedirectProps = {
  params?: Promise<{ locale: string }>;
};

export default async function FgListRedirectPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as FgListRedirectProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };

  redirect(`/${locale}/pipeline`);
}
