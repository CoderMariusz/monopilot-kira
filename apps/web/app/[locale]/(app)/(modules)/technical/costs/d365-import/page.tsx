/**
 * RELOCATION REDIRECT (2026-06-05).
 *
 * TEC-052 Cost Import from D365 moved with the whole D365 group out of Technical
 * into Settings › Integrations › D365. The real surface now lives at
 *   /settings/integrations/d365/cost-import
 * (apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/cost-import).
 *
 * This thin redirect preserves any bookmarked/legacy
 * /technical/costs/d365-import URL. Locale-aware so the destination keeps the
 * active locale segment.
 */
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LegacyD365CostImportRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/settings/integrations/d365/cost-import`);
}
