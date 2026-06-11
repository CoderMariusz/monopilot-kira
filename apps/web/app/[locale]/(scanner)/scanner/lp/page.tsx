import { getScannerLabels } from "../../_components/scanner-labels";
import { LpInfoScreen } from "./_components/lp-info-screen";

export const dynamic = "force-dynamic";

export default async function ScannerLpInfoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <LpInfoScreen locale={locale} labels={getScannerLabels(locale)} />;
}
