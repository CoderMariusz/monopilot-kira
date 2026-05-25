import { redirect } from 'next/navigation';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

export default async function SitesLegacyRedirectPage({ params }: PageProps) {
  const locale = (await params)?.locale ?? 'en';
  redirect(`/${locale}/settings/infra/lines`);
}
