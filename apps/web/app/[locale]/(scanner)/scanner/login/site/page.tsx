import { getScannerLabels } from "../../../_components/scanner-labels";
import { SiteSelectScreen } from "./_components/site-select-screen";

export const dynamic = "force-dynamic";

export default async function ScannerSitePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const labels = getScannerLabels(locale);
  return <SiteSelectScreen locale={locale} labels={labels} />;
}
