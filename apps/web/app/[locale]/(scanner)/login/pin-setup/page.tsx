import { getScannerLabels } from "../../_components/scanner-labels";
import { PinSetupScreen } from "./_components/pin-setup-screen";

export const dynamic = "force-dynamic";

export default async function ScannerPinSetupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const labels = getScannerLabels(locale);
  return <PinSetupScreen locale={locale} labels={labels} />;
}
