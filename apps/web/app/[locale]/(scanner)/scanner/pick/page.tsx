import { getScannerLabels } from "../../_components/scanner-labels";
import { PickScreen } from "./_components/pick-screen";

export const dynamic = "force-dynamic";

export default async function ScannerPickPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <PickScreen locale={locale} labels={getScannerLabels(locale)} />;
}
