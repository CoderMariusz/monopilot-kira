import { getScannerLabels } from "../_components/scanner-labels";
import { LoginScreen } from "./_components/login-screen";

// Auth screen: no DB read, but keep dynamic to avoid stale prerender of the shell.
export const dynamic = "force-dynamic";

export default async function ScannerLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const labels = getScannerLabels(locale);
  return <LoginScreen locale={locale} labels={labels} />;
}
