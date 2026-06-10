import { getScannerLabels } from "../_components/scanner-labels";
import { SettingsScreen } from "./_components/settings-screen";

export const dynamic = "force-dynamic";

export default async function ScannerSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const labels = getScannerLabels(locale);
  return <SettingsScreen locale={locale} labels={labels} />;
}
