import { redirect } from 'next/navigation';

/**
 * /scanner index — the shell has no landing of its own: an authenticated
 * session lands on /scanner/home, everyone else is bounced there too and the
 * client session guard on Home forwards unauthenticated users to /scanner/login.
 * (Round-2 live verify: bare /en/scanner 404'd.)
 */
export default async function ScannerIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/scanner/home`);
}
