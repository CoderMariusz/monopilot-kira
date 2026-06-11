import { getScannerLabels } from "../../_components/scanner-labels";
import { getScannerProdLabels } from "../../_components/scanner-prod-labels";
import { WoListScreen } from "./_components/wo-list-screen";

export const dynamic = "force-dynamic";

export default async function ScannerWoListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <WoListScreen
      locale={locale}
      shellLabels={getScannerLabels(locale)}
      labels={getScannerProdLabels(locale)}
    />
  );
}
