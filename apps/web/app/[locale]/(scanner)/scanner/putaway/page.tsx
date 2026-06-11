import { getScannerLabels } from "../../_components/scanner-labels";
import { PutawayScreen } from "./_components/putaway-screen";

export const dynamic = "force-dynamic";

export default async function ScannerPutawayPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <PutawayScreen locale={locale} labels={getScannerLabels(locale)} />;
}
