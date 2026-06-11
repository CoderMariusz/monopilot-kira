import { getScannerLabels } from "../../_components/scanner-labels";
import { QaScreen } from "./_components/qa-screen";

export const dynamic = "force-dynamic";

export default async function ScannerQaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <QaScreen locale={locale} labels={getScannerLabels(locale)} />;
}
