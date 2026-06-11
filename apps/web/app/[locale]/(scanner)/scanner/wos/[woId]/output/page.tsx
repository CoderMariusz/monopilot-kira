import { getScannerLabels } from "../../../../_components/scanner-labels";
import { getScannerProdLabels } from "../../../../_components/scanner-prod-labels";
import { OutputScreen } from "./_components/output-screen";

export const dynamic = "force-dynamic";

export default async function ScannerOutputPage({
  params,
}: {
  params: Promise<{ locale: string; woId: string }>;
}) {
  const { locale, woId } = await params;
  return (
    <OutputScreen
      locale={locale}
      woId={woId}
      shellLabels={getScannerLabels(locale)}
      labels={getScannerProdLabels(locale)}
    />
  );
}
