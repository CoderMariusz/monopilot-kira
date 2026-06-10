"use client";

import type { CSSProperties, JSX } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Badge } from "@monopilot/ui/Badge";

import { APP_NAV_GROUPS } from "../../lib/navigation/app-nav";
import type { AppNavGroup, AppSidebarNavItem } from "../../lib/navigation/types";

type AppSidebarProps = {
  locale: string;
  pathnameOverride?: string;
  /**
   * RBAC-filtered nav groups resolved server-side in the (app) shell layout
   * (shell gap #2). Defaults to the full, ungated registry so existing callers
   * and RTL harnesses that render the sidebar standalone keep working.
   */
  groups?: readonly AppNavGroup[];
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const NAV_I18N_NAMESPACE = "Navigation.app";

function localizedHref(locale: string, route: string) {
  return `/${locale}${route}`;
}

function navI18nKey(i18nKey: string) {
  const prefix = `${NAV_I18N_NAMESPACE}.`;
  return i18nKey.startsWith(prefix) ? i18nKey.slice(prefix.length) : i18nKey;
}

function stripLocalePrefix(pathname: string, locale: string) {
  const localePrefix = `/${locale}`;

  if (pathname === localePrefix) {
    return "/";
  }

  if (pathname.startsWith(`${localePrefix}/`)) {
    return pathname.slice(localePrefix.length) || "/";
  }

  return pathname || "/";
}

function isItemActive(item: AppSidebarNavItem, pathname: string, locale: string) {
  const routePath = stripLocalePrefix(pathname, locale);

  return routePath === item.route || routePath.startsWith(`${item.route}/`);
}

function iconStyle(iconToken: string) {
  return { "--app-sidebar-icon": JSON.stringify(iconToken) } as CSSProperties;
}

function CountSlot() {
  return (
    <Badge
      data-slot="count"
      aria-hidden="true"
      variant="muted"
      className="ml-auto min-w-0 border-0 bg-transparent p-0 shadow-none"
    />
  );
}

export function AppSidebar({ locale, pathnameOverride, groups }: AppSidebarProps): JSX.Element {
  const pathname = usePathname();
  const t = useTranslations(NAV_I18N_NAMESPACE);
  const activePathname = pathnameOverride ?? pathname ?? localizedHref(locale, "/dashboard");
  const navGroups = groups ?? APP_NAV_GROUPS;

  return (
    <nav
      data-testid="app-sidebar"
      role="navigation"
      aria-label="Primary"
      className="w-sidebar shrink-0 border-r border-shell-sidebar-border bg-shell-sidebar px-4 py-5 text-shell-sidebar-fg"
      style={{ width: "var(--shell-sidebar-w)" }}
    >
      <div className="flex flex-col gap-5">
        {navGroups.map((group) => (
          <section key={group.id} className="space-y-1.5">
            <h2
              data-slot="group"
              className="px-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-shell-sidebar-muted"
            >
              {t(navI18nKey(group.i18n_key))}
            </h2>

            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isItemActive(item, activePathname, locale);

                return (
                  <Link
                    key={item.key}
                    href={localizedHref(locale, item.route)}
                    // Perf: do NOT prefetch every module route. In production a prefetch
                    // is a FULL server render of the target (each module page runs its own
                    // withOrgContext/DB reads). With ~15 sidebar modules this fired ~15
                    // background renders on EVERY page view — the dominant DB/connection
                    // load + the pool pressure behind the vanishing headers. Navigate on click.
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                    data-testid={`app-sidebar-item-${item.key}`}
                    className={cx(
                      "flex min-h-10 items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-active focus-visible:ring-offset-2 focus-visible:ring-offset-shell-sidebar",
                      active
                        ? "border-l-[3px] border-l-blue-500 bg-shell-active text-shell-active-fg"
                        : "text-shell-sidebar-fg hover:bg-shell-sidebar-hover hover:text-white",
                    )}
                  >
                    {item.rbac_todo ? <>{/* TODO(rbac/02-settings/T-130) */}</> : null}
                    <span
                      aria-hidden="true"
                      className="mr-2 inline-flex h-4 w-4 items-center justify-center text-xs before:content-[var(--app-sidebar-icon)]"
                      style={iconStyle(item.icon_token)}
                    />
                    <span>{t(navI18nKey(item.i18n_key))}</span>
                    <CountSlot />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </nav>
  );
}

export default AppSidebar;
