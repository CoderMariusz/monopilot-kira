import { getScannerLabels } from "../../_components/scanner-labels";
import { ReceivePoListScreen } from "./_components/receive-po-list-screen";

export const dynamic = "force-dynamic";

export default async function ScannerReceivePoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <ReceivePoListScreen locale={locale} labels={getScannerLabels(locale)} />;
}
