/**
 * W2-T2 (2026-07-06 consolidation) — legacy reference-A "Process steps" screen
 * RETIRED (owner decision: no read-only grace). Its reference_tables
 * (table_code='processes') + reference_schemas ('reference.processes') data is
 * removed by migration 441-retire-reference-processes.sql.
 *
 * This route now redirects to the unified Processes screen (W2-T1,
 * npd_process_defaults backbone) at /settings/process-defaults — same pattern
 * as the schema-wizard legacy redirect. The settings nav already points its
 * single "Processes" entry there. The physical rename of the unified screen
 * onto this path is a follow-up owned with W2-T1's files (see
 * process-defaults/page.tsx NOTE).
 */
import { redirect } from 'next/navigation';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

export default async function ProcessesLegacyRedirectPage({ params }: PageProps) {
  const locale = (await params)?.locale ?? 'en';
  redirect(`/${locale}/settings/process-defaults`);
}
