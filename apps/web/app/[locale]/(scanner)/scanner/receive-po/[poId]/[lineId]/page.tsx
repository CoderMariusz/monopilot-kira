import { getScannerLabels } from "../../../../_components/scanner-labels";
import { ReceivePoItemScreen } from "./_components/receive-po-item-screen";

export const dynamic = "force-dynamic";

export default async function ScannerReceivePoItemPage({
  params,
}: {
  params: Promise<{ locale: string; poId: string; lineId: string }>;
}) {
  const { locale, poId, lineId } = await params;
  return <ReceivePoItemScreen locale={locale} poId={poId} lineId={lineId} labels={getScannerLabels(locale)} />;
}
