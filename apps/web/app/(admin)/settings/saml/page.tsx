import { redirect } from 'next/navigation';

/**
 * Legacy non-localized SAML route.
 *
 * The canonical SSO/security settings UI lives under the localized AppShell.
 */
export default function LegacySettingsSamlPage() {
  redirect('/en/settings/security');
}
