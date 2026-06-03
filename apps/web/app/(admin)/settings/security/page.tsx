import { redirect } from 'next/navigation';

/**
 * Legacy non-localized Security route.
 *
 * Structural consolidation (Class E): the canonical SET-012 Security screen now
 * lives in the localized tree at
 * `app/[locale]/(app)/(admin)/settings/security/page.tsx`, a Server Component
 * loader that reads real org-scoped security policy / SSO / IP-allowlist / audit
 * data via withOrgContext. This file is a thin redirect so the bare
 * `/settings/security` URL keeps resolving to the canonical localized route.
 */
export default function LegacySettingsSecurityPage() {
  redirect('/en/settings/security');
}
