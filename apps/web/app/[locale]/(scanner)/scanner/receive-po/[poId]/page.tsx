import { getScannerLabels } from "../../../_components/scanner-labels";
import { ReceivePoLinesScreen } from "./_components/receive-po-lines-screen";

export const dynamic = "force-dynamic";

export default async function ScannerReceivePoLinesPage({
  params,
}: {
  params: Promise<{ locale: string; poId: string }>;
}) {
  const { locale, poId } = await params;
  return <ReceivePoLinesScreen locale={locale} poId={poId} labels={getScannerLabels(locale)} />;
}
