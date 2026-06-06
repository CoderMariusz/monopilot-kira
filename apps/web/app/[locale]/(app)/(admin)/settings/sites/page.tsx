import { redirect } from 'next/navigation';

import { readSitesSettingsData } from './_actions/sites';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

export default async function SitesLegacyRedirectPage({ params }: PageProps) {
  const locale = (await params)?.locale ?? 'en';
  await readSitesSettingsData();
  redirect(`/${locale}/settings/infra/lines`);
}
