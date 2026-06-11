import { getScannerLabels } from "../../_components/scanner-labels";
import { MoveScreen } from "./_components/move-screen";

export const dynamic = "force-dynamic";

export default async function ScannerMovePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <MoveScreen locale={locale} labels={getScannerLabels(locale)} />;
}
