import { redirect } from 'next/navigation';

// W2-T4 (2026-07-06 consolidation) — the settings Products & SKUs screen was a
// third write path into public.items that bypassed the technical-items wizard's
// pack-hierarchy validation and allowed item_code rename. It is retired; old
// bookmarks land on the Technical items master list filtered to finished goods.
// FG create/edit goes only through the technical items wizard.
type PageProps = {
  params?: Promise<{ locale: string }>;
};

export default async function ProductsSettingsLegacyRedirectPage({ params }: PageProps) {
  const locale = (await params)?.locale ?? 'en';
  redirect(`/${locale}/technical/items?type=fg`);
}
