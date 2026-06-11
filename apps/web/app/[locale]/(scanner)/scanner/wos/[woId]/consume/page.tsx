import { getScannerLabels } from "../../../../_components/scanner-labels";
import { getScannerProdLabels } from "../../../../_components/scanner-prod-labels";
import { ConsumeScreen } from "./_components/consume-screen";

export const dynamic = "force-dynamic";

export default async function ScannerConsumePage({
  params,
}: {
  params: Promise<{ locale: string; woId: string }>;
}) {
  const { locale, woId } = await params;
  return (
    <ConsumeScreen
      locale={locale}
      woId={woId}
      shellLabels={getScannerLabels(locale)}
      labels={getScannerProdLabels(locale)}
    />
  );
}
