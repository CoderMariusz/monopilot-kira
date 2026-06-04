import { redirect } from 'next/navigation';

// Decision D-1: the real DLQ manager (T-058 / TEC-073) lives under the canonical
// settings/integrations/d365 namespace. The legacy SettingsRouteStub at this path
// is retired — redirect to the real page.
type PageProps = {
  params?: Promise<{ locale: string }>;
};

export default async function D365DlqLegacyRedirectPage({ params }: PageProps) {
  const locale = (await params)?.locale ?? 'en';
  redirect(`/${locale}/settings/integrations/d365/dlq`);
}
