import { getScannerLabels } from "../../../../_components/scanner-labels";
import { getScannerProdLabels } from "../../../../_components/scanner-prod-labels";
import { ReverseConsumeScreen } from "./_components/reverse-consume-screen";

export const dynamic = "force-dynamic";

export default async function ScannerReverseConsumePage({
  params,
}: {
  params: Promise<{ locale: string; woId: string }>;
}) {
  const { locale, woId } = await params;
  return (
    <ReverseConsumeScreen
      locale={locale}
      woId={woId}
      shellLabels={getScannerLabels(locale)}
      labels={getScannerProdLabels(locale)}
    />
  );
}
