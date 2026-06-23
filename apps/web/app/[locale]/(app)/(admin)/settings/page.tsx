import { redirect } from 'next/navigation';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

// Settings has no standalone landing screen — send users to the first canonical
// sub-page (Company profile) so /settings never renders a blank page.
export default async function SettingsIndexPage({ params }: PageProps) {
  const locale = (await params)?.locale ?? 'en';
  redirect(`/${locale}/settings/company`);
}
