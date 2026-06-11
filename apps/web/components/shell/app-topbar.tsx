import type { JSX } from "react";
import { getTranslations } from "next-intl/server";

import { SiteCrumb } from "./site-crumb";
import { SiteSwitcher, type SiteSwitcherOption } from "./site-switcher";
import { UserMenu } from "./user-menu";
import type { UserMenuLanguagePickerProps } from "../../app/_components/user-menu-language-picker";

type ShellUser = {
  id: string;
  email: string;
  name: string;
  initials: string;
};

type AppTopbarProps = {
  locale: "en" | "pl" | "uk" | "ro";
  user: ShellUser;
  orgId: string;
  orgName: string;
  userLanguage: UserMenuLanguagePickerProps["userLanguage"];
  effectiveLanguage: UserMenuLanguagePickerProps["effectiveLanguage"];
  organizationLanguage: UserMenuLanguagePickerProps["organizationLanguage"];
  signOutAction: (formData: FormData) => Promise<never> | never;
  onSelectLanguage: UserMenuLanguagePickerProps["onSelectLanguage"];
  switchNextIntlLocale: UserMenuLanguagePickerProps["switchNextIntlLocale"];
  /** 14-multi-site (CL4): org sites for the picker; empty/absent → SiteCrumb fallback. */
  sites?: SiteSwitcherOption[];
  /** Active site id (mp_site_id cookie); null/absent = All sites. */
  activeSiteId?: string | null;
  /** Cookie write seam (lib/site/site-actions.setActiveSite). */
  setSiteAction?: (siteId: string | null) => Promise<{ ok: boolean }>;
};

export async function AppTopbar({
  locale,
  user,
  orgId,
  orgName,
  userLanguage,
  effectiveLanguage,
  organizationLanguage,
  signOutAction,
  onSelectLanguage,
  switchNextIntlLocale,
  sites,
  activeSiteId,
  setSiteAction,
}: AppTopbarProps): Promise<JSX.Element> {
  const t = await getTranslations({ locale, namespace: "Topbar" });
  const brand = t("brand");
  const searchPlaceholder = t("searchPlaceholder");

  return (
    <header
      data-testid="app-topbar"
      role="banner"
      className="flex shrink-0 items-center gap-4 border-b border-shell-border bg-shell-surface px-6 text-shell-fg"
      style={{ height: "var(--shell-topbar-h)" }}
    >
      <div className="text-base font-semibold tracking-tight" aria-label={brand}>
        {brand}
      </div>

      <div className="min-w-0 flex-1 max-w-md">
        <input
          data-testid="app-topbar-search"
          type="search"
          readOnly
          aria-label={searchPlaceholder}
          placeholder={searchPlaceholder}
          className="h-10 w-full rounded-full border border-shell-border bg-shell-bg px-4 text-sm text-shell-fg placeholder:text-shell-muted focus:outline-none"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        {sites && sites.length > 0 && setSiteAction ? (
          <SiteSwitcher
            sites={sites}
            activeSiteId={activeSiteId ?? null}
            labels={{
              label: t("sitePickerLabel"),
              allSites: t("sitePickerAllSites"),
              tooltip: t("sitePickerTooltip"),
            }}
            setSiteAction={setSiteAction}
          />
        ) : (
          <SiteCrumb orgName={orgName} />
        )}
        <UserMenu
          user={user}
          orgId={orgId}
          locale={locale}
          userLanguage={userLanguage}
          effectiveLanguage={effectiveLanguage}
          organizationLanguage={organizationLanguage}
          onSelectLanguage={onSelectLanguage}
          switchNextIntlLocale={switchNextIntlLocale}
          signOutAction={signOutAction}
        />
      </div>
    </header>
  );
}

export default AppTopbar;
export type { AppTopbarProps };
