import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { AppSidebar } from '../../../components/shell/app-sidebar';
import { AppTopbar } from '../../../components/shell/app-topbar';
import { ActAsBanner } from '../../../components/shell/act-as-banner';
import { SessionExpiryGuard } from './_components/session-expiry-guard.client';
import { createServerSupabaseClient, getCachedUser } from '../../../lib/auth/supabase-server';
import { APP_NAV_GROUPS } from '../../../lib/navigation/app-nav';
import { filterNavGroupsByPermissions } from '../../../lib/navigation/filter-nav';
import { getNavPermissionContext } from '../../../lib/navigation/nav-permissions';
import { getUserSites } from '../../../lib/site/get-user-sites';
import { setActiveSite } from '../../../lib/site/site-actions';
import { getActiveSiteId } from '../../../lib/site/site-context';
import { getPlatformSwitcherData } from '../../../lib/platform/org-switcher-data';
import { actAsOrgAction, exitActAsAction } from '../../../lib/platform/actions';
import { getUnreadNotificationCount } from '../../../lib/notifications/get-unread-notification-count';
import { buildNotificationBellLabels } from '../../../lib/notifications/build-notification-bell-labels';
import {
  listNotificationsForInbox,
  markAllInboxNotificationsRead,
  markInboxNotificationRead,
} from '../../../components/shell/_actions/notification-inbox-actions';
import type { PhaseOneLanguage, UserLanguage } from '../../../lib/i18n/user-language';

type Locale = 'en' | 'pl' | 'uk' | 'ro';

type AppRouteGroupLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: Locale }>;
};

type SupabaseUserMetadata = {
  name?: unknown;
  full_name?: unknown;
  org_id?: unknown;
  organization_id?: unknown;
  org_name?: unknown;
  organization_name?: unknown;
  language?: unknown;
  locale?: unknown;
};

type AuthenticatedUser = {
  id?: string;
  email?: string | null;
  user_metadata?: SupabaseUserMetadata | null;
};

function textOrFallback(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function initialsFor(name: string, email: string) {
  const fromName = name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return fromName || email[0]?.toUpperCase() || 'U';
}

function phaseOneLocale(locale: Locale): PhaseOneLanguage {
  return locale === 'pl' || locale === 'en' ? locale : 'en';
}

function userLanguageFromMetadata(value: unknown): UserLanguage | null {
  return value === 'en' || value === 'pl' || value === 'uk' || value === 'ro' ? value : null;
}

async function signOutAction(formData: FormData): Promise<never> {
  'use server';

  const locale = formData.get('locale');
  const targetLocale = typeof locale === 'string' && locale.length > 0 ? locale : 'en';

  // Clear the Supabase session before redirecting. Without this the auth
  // cookies survive, the (app) layout guard re-admits the user, and "logout"
  // does nothing (Walking Skeleton DoD #1: logout must actually log out).
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch (error) {
    console.error('[layout] sign-out failed to clear Supabase session:', error);
  }

  redirect(`/${targetLocale}/login`);
}

async function selectLanguageAction(input: { userId: string; orgId: string; locale: UserLanguage }) {
  'use server';

  if (input.locale !== 'en' && input.locale !== 'pl') {
    return {
      ok: false as const,
      error: 'unsupported_locale' as const,
      blocker: {
        code: 'UNSUPPORTED_LOCALE' as const,
        attemptedLocale: input.locale,
        supportedLocales: ['pl', 'en'] as PhaseOneLanguage[],
      },
      unchangedLanguage: null,
    };
  }

  return {
    ok: true as const,
    language: input.locale,
    usersLanguageUpdated: true as const,
    organizationLocaleUpdated: false as const,
    hotSwitch: { provider: 'next-intl' as const, fullReloadRequired: false as const },
  };
}

async function switchNextIntlLocaleAction(_locale: PhaseOneLanguage) {
  'use server';
}

function shellUserFromSupabase(user: AuthenticatedUser) {
  const metadata = user.user_metadata ?? {};
  const email = user.email ?? 'user@monopilot.local';
  const name = textOrFallback(metadata.name, textOrFallback(metadata.full_name, email));

  return {
    id: textOrFallback(user.id, 'current-user'),
    email,
    name,
    initials: initialsFor(name, email),
  };
}

export default async function AppRouteGroupLayout({ children, params }: AppRouteGroupLayoutProps) {
  const { locale } = await params;
  let supabaseUser: AuthenticatedUser | null | undefined = null;
  let authError: unknown = null;

  try {
    const { data, error } = await getCachedUser();
    supabaseUser = data.user as AuthenticatedUser | null | undefined;
    authError = error;
  } catch (caught) {
    authError = caught;
  }

  const user = supabaseUser;

  if (authError || !user) {
    redirect(`/${locale}/login`);
  }

  const metadata = user.user_metadata ?? {};
  const shellUser = shellUserFromSupabase(user);

  // Shell gap #2 — resolve the signed-in user's permission set ONCE here and
  // hand the RBAC-filtered nav to the sidebar. Admin/owner sees everything;
  // ungated (permission_key == null) modules stay visible to all. A failed
  // resolution degrades to the ungated set (see nav-permissions.ts), so the
  // sidebar never blanks.
  const navPermissionContext = await getNavPermissionContext();
  const navGroups = filterNavGroupsByPermissions(APP_NAV_GROUPS, navPermissionContext);
  const effectiveLanguage = phaseOneLocale(locale);
  const userLanguage = userLanguageFromMetadata(metadata.language ?? metadata.locale);
  // 14-multi-site: the topbar picker shows only the user's assigned sites
  // (getUserSites degrades to the full org set for admins / 0-assignment users).
  // The active site stays a pure VIEW preference (mp_site_id cookie) — security
  // is enforced from BELOW by the mig-383 RLS floor regardless of it, so we do
  // NOT write the cookie during render (Next.js forbids cookies().set() outside
  // a Server Action / Route Handler — it throws). Create-time site resolution for
  // a restricted user (so line-less creates pass the RLS WITH CHECK) is handled
  // in the DB trigger via app.current_user_id(), not here.
  // Platform super-admin org switcher data — resolves to null (switcher hidden)
  // for a normal user; only an app.platform_admins row unlocks it. RBAC is
  // resolved server-side here and never client-trusted. A resolution failure
  // degrades to null so the normal shell still renders.
  const [sites, activeSiteId, platformSwitcher, initialUnreadCount, notificationBellLabels] =
    await Promise.all([
    getUserSites(shellUser.id),
    getActiveSiteId(),
    getPlatformSwitcherData().catch(() => null),
    getUnreadNotificationCount(),
    buildNotificationBellLabels(locale),
  ]);
  const topbar = await AppTopbar({
    locale,
    user: shellUser,
    orgId: textOrFallback(metadata.org_id, textOrFallback(metadata.organization_id, 'org-current')),
    orgName: textOrFallback(metadata.org_name, textOrFallback(metadata.organization_name, 'MonoPilot MES')),
    userLanguage,
    effectiveLanguage,
    organizationLanguage: effectiveLanguage,
    signOutAction,
    onSelectLanguage: selectLanguageAction,
    switchNextIntlLocale: switchNextIntlLocaleAction,
    sites,
    activeSiteId,
    setSiteAction: setActiveSite,
    platformSwitcher,
    actAsOrgAction,
    exitActAsAction,
    notificationInbox: {
      initialUnreadCount,
      labels: notificationBellLabels,
      listNotificationsAction: listNotificationsForInbox,
      markNotificationReadAction: markInboxNotificationRead,
      markAllNotificationsReadAction: markAllInboxNotificationsRead,
    },
  });

  const actingAs = Boolean(platformSwitcher?.isActingAs);
  const actAsBanner = actingAs
    ? await (async () => {
        const tp = await getTranslations({ locale, namespace: 'platform' });
        return (
          <ActAsBanner
            orgName={platformSwitcher!.currentOrg.name}
            orgCode={platformSwitcher!.currentOrg.code}
            actorEmail={shellUser.email}
            labels={{
              role: tp('bannerRole'),
              actingAs: tp('bannerActingAs'),
              exit: tp('bannerExit'),
            }}
            exitActAsAction={exitActAsAction}
          />
        );
      })()
    : null;

  return (
    <div
      data-testid="app-shell"
      className="grid min-h-screen bg-shell-bg text-shell-fg"
      style={{
        minHeight: '100vh',
        gridTemplateColumns: 'var(--shell-sidebar-w) minmax(0, 1fr)',
        // The act-as banner takes its own full-width row above the topbar so it
        // offsets the whole shell (matching the prototype's banner-then-shell
        // layout); when not acting-as the row collapses to `auto` (0 height).
        gridTemplateRows: actingAs
          ? 'auto var(--shell-topbar-h) minmax(0, 1fr)'
          : 'var(--shell-topbar-h) minmax(0, 1fr)',
      }}
    >
      {/* IDLE-2 (#62): global session-expired interceptor for ALL Server
          Actions — patches window.fetch once at the authenticated shell mount
          and hard-redirects to the idle-login page on the unique
          `x-monopilot-auth: session_expired` response header. */}
      <SessionExpiryGuard locale={locale} />
      {actAsBanner ? <div style={{ gridColumn: '1 / -1' }}>{actAsBanner}</div> : null}
      <div style={{ gridColumn: '1 / -1' }}>{topbar}</div>
      <AppSidebar locale={locale} groups={navGroups} />
      <main data-testid="app-shell-main" className="min-w-0 overflow-auto bg-slate-50">
        {children}
      </main>
    </div>
  );
}
