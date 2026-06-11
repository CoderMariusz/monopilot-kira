import { getScannerLabels } from "../../../_components/scanner-labels";
import { getScannerProdLabels } from "../../../_components/scanner-prod-labels";
import { WoExecuteScreen } from "./_components/wo-execute-screen";

export const dynamic = "force-dynamic";

export default async function ScannerWoExecutePage({
  params,
}: {
  params: Promise<{ locale: string; woId: string }>;
}) {
  const { locale, woId } = await params;
  return (
    <WoExecuteScreen
      locale={locale}
      woId={woId}
      shellLabels={getScannerLabels(locale)}
      labels={getScannerProdLabels(locale)}
    />
  );
}
