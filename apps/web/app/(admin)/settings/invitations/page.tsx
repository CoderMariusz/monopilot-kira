import { redirect } from 'next/navigation';

/**
 * Legacy non-localized Invitations route.
 *
 * Structural consolidation (F4): the canonical SET-010 Invitations screen now
 * lives in the localized tree at
 * `app/[locale]/(app)/(admin)/settings/invitations/page.tsx`, a Server Component
 * loader that reads real org-scoped invitation data via withOrgContext. The
 * client island lives at
 * `app/[locale]/(app)/(admin)/settings/invitations/invitations-screen.client.tsx`.
 * This file is a thin redirect so the bare `/settings/invitations` URL keeps
 * resolving to the canonical localized route.
 */
export default function LegacySettingsInvitationsPage() {
  redirect('/en/settings/invitations');
}
