import { getScannerLabels } from "../../../../_components/scanner-labels";
import { getScannerProdLabels } from "../../../../_components/scanner-prod-labels";
import { WasteScreen } from "./_components/waste-screen";

export const dynamic = "force-dynamic";

export default async function ScannerWastePage({
  params,
}: {
  params: Promise<{ locale: string; woId: string }>;
}) {
  const { locale, woId } = await params;
  return (
    <WasteScreen
      locale={locale}
      woId={woId}
      shellLabels={getScannerLabels(locale)}
      labels={getScannerProdLabels(locale)}
    />
  );
}
