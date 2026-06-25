import { getScannerLabels } from "../../_components/scanner-labels";
import { ShipScreen } from "./_components/ship-screen";

export const dynamic = "force-dynamic";

export default async function ScannerShipPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const labels = getScannerLabels(locale);
  return <ShipScreen locale={locale} labels={labels} />;
}
