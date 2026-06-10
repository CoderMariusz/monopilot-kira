import { getScannerLabels } from "../_components/scanner-labels";
import { HomeScreen } from "./_components/home-screen";

export const dynamic = "force-dynamic";

export default async function ScannerHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const labels = getScannerLabels(locale);
  return <HomeScreen locale={locale} labels={labels} />;
}
