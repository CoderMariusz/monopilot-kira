import { redirect } from 'next/navigation';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

export default async function D365MappingLegacyRedirectPage({ params }: PageProps) {
  const locale = (await params)?.locale ?? 'en';
  redirect(`/${locale}/settings/integrations/d365/mapping`);
}
