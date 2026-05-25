import { redirect } from 'next/navigation';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

export default async function ManufacturingOpsLegacyRedirectPage({ params }: PageProps) {
  const locale = (await params)?.locale ?? 'en';
  redirect(`/${locale}/settings/reference/manufacturing-operations`);
}
